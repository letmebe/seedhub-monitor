/**
 * SeedHub 影视资源抓取脚本（简单定时版）
 * 
 * 功能：
 * 1. 自动检测/启动 Edge 浏览器（CDP 调试模式）
 * 2. 定时抓取 SeedHub 资源
 * 
 * 配置：
 * - INTERVAL_HOURS: 抓取间隔（小时），0 = 只运行一次
 * - TARGET_PAN: 目标网盘（百度/UC/夸克/天翼/全部）
 * - MAX_MOVIES: 每次最多处理几部电影（默认 20）
 * - MAX_CHECK: 每个电影最多检查几个中转链接
 * 
 * 使用：
 * node scrape.js                  # 运行一次（处理 MAX_MOVIES 部）
 * node scrape.js --loop            # 持续定时运行
 * node scrape.js --max-movies 10  # 运行一次，处理前 10 部
 * node scrape.js --loop --max-movies 5  # 定时运行，每次处理 5 部
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('./db');

// ============ 命令行参数（模块级，供 scrape() 读取） ============
const args = process.argv.slice(2);

// ============ 配置 ============
const CDP_PORT = 9222;
const TARGET_URL = 'https://www.seedhub.cc/categories/1/movies/';
const TARGET_PAN = '百度';  // 百度 / UC / 夸克 / 天翼 / 全部
const INTERVAL_HOURS = 24;  // 抓取间隔（小时），0 = 只运行一次
const MAX_CHECK = 10;  // 每个电影最多检查几个中转链接
const MAX_MOVIES = 20;  // 每次最多处理几部电影

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const AGENT = `node "${process.env.APPDATA}\\npm\\node_modules\\agent-browser\\bin\\agent-browser.js" --cdp ${CDP_PORT}`;

// ============ 工具函数 ============
function cdpEval(jsCode) {
  const escaped = jsCode.replace(/"/g, '\\"');
  const cmd = `${AGENT} eval "${escaped}"`;
  try {
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
    const trimmed = result.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const match = trimmed.match(/^\[[\s\S]*\]$|^\{[\s\S]*\}$|^null$|^true$|^false$|^-?\d+(\.\d+)?$/m);
      if (match) return JSON.parse(match[0]);
    }
    return trimmed;
  } catch (e) {
    console.error('  [cdpEval] 失败:', e.message.split('\n')[0]);
    return null;
  }
}

function openPage(url) {
  try {
    execSync(`${AGENT} open "${url}"`, { encoding: 'utf-8', timeout: 30000 });
  } catch (e) {
    console.error('  [openPage] 失败:', url);
  }
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function isEdgeRunning() {
  try {
    const result = execSync('netstat -ano | findstr ":9222"', { encoding: 'utf-8' });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

function startEdge() {
  console.log('🚀 启动 Edge（调试模式）...');
  try {
    execSync('taskkill /F /IM msedge.exe', { stdio: 'ignore' });
    execSync('timeout /t 2 /nobreak >nul', { stdio: 'ignore' });
  } catch {}

  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-first-run',
    '--no-default-browser-check'
  ], {
    detached: true,
    stdio: 'ignore'
  });
  edge.unref();

  return delay(5000).then(() => console.log('  ✅ Edge 已启动\n'));
}

// ============ 核心逻辑 ============
async function extractPanLink(transitUrl) {
  openPage(transitUrl);
  await delay(5000);

  const html = cdpEval("document.documentElement.outerHTML");
  if (!html) return null;

  const matchLink = html.match(/var panLink\s*=\s*["']([^"']+)["']/);
  if (!matchLink) return null;

  const panLink = matchLink[1];
  const matchCode = panLink.match(/[?&]pwd=([^&"'\s]+)/i);
  const extractCode = matchCode ? matchCode[1] : '';

  let panType = '未知';
  if (panLink.includes('pan.baidu.com')) panType = '百度';
  else if (panLink.includes('drive.uc.cn')) panType = 'UC';
  else if (panLink.includes('pan.quark.cn')) panType = '夸克';
  else if (panLink.includes('cloud.189.cn')) panType = '天翼';

  return { panLink, panType, extractCode };
}

async function scrape() {
  const timestamp = new Date().toISOString();
  const results = { timestamp, movies: [] };

  console.log(`\n[${new Date().toLocaleString()}] 🚀 开始抓取...\n`);

  // Step 1: 打开分类页
  console.log('📄 打开电影分类页...');
  openPage(TARGET_URL);
  await delay(4000);

  // Step 2: 获取电影列表
  console.log('📋 获取电影列表...');
  const movies = cdpEval(
    "Array.from(document.querySelectorAll('.content a[href*=\"/movies/\"]')).filter(a=>a.querySelector('img')).map(a=>({title:a.querySelector('img')?.alt||a.textContent.trim().substring(0,30),url:a.href}))"
  );

  if (!movies || !Array.isArray(movies)) {
    console.error('  ❌ 获取失败:', movies);
    return null;
  }
  console.log(`  找到 ${movies.length} 部电影\n`);

  // Step 3: 处理前 N 部（可配置）
  const maxMovies = args.includes('--max-movies') 
    ? parseInt(args[args.indexOf('--max-movies') + 1]) || MAX_MOVIES
    : MAX_MOVIES;
  const todo = movies.slice(0, maxMovies);
  console.log(`🔍 处理前 ${todo.length} 部电影（最多 ${maxMovies} 部）...\n`);

  for (const movie of todo) {
    console.log(`  处理: ${movie.title}`);
    console.log(`    URL: ${movie.url}`);

    openPage(movie.url);
    await delay(3000);

    // 点击网盘标签
    let clickedInfo = false;
    if (TARGET_PAN === '全部') {
      clickedInfo = cdpEval(
        "(function(){var links=document.querySelectorAll('a[href*=\"redirect_to=pan_id\"]');if(links.length>0){links[0].click();return links[0].textContent.trim();}return false;})()"
      );
    } else {
      clickedInfo = cdpEval(
        `(function(){var el=Array.from(document.querySelectorAll('a')).find(a=>a.textContent.trim().includes('${TARGET_PAN}'));if(el){el.click();return el.textContent.trim();}return false;})()`
      );
    }
    console.log(`    点击标签: ${clickedInfo || '❌'}`);
    await delay(3000);

    // 获取中转链接
    const transitLinks = cdpEval(
      `(function(){return Array.from(document.querySelectorAll('a[href*="redirect_to=pan_id"]')).slice(0,${MAX_CHECK}).map(a=>a.href)})()`
    );

    if (!transitLinks || !Array.isArray(transitLinks) || transitLinks.length === 0) {
      console.log('    ⚠️ 未找到中转链接\n');
      results.movies.push({ title: movie.title, url: movie.url, status: 'no-transit-link' });
      continue;
    }

    console.log(`    找到 ${transitLinks.length} 个中转链接，查找 ${TARGET_PAN}...`);

    let found = null;
    for (let i = 0; i < transitLinks.length; i++) {
      const transitUrl = transitLinks[i];
      const panId = transitUrl.match(/pan_id_(\d+)/)?.[1] || `${i + 1}`;
      console.log(`      ${i + 1}/${transitLinks.length}: pan_id_${panId}`);

      const result = await extractPanLink(transitUrl);
      if (result && result.panType === TARGET_PAN) {
        found = result;
        console.log(`      ✅ 找到 ${TARGET_PAN}!`);
        console.log(`         ${result.panLink.substring(0, 60)}...`);
        if (result.extractCode) console.log(`         提取码: ${result.extractCode}`);
        break;
      }
    }

    if (found) {
      results.movies.push({
        title: movie.title,
        url: movie.url,
        panType: found.panType,
        panLink: found.panLink,
        extractCode: found.extractCode
      });
    } else {
      console.log(`    ❌ 未找到 ${TARGET_PAN}\n`);
      results.movies.push({ title: movie.title, url: movie.url, status: 'not-found' });
    }
    console.log();
  }

  // Step 4: 保存结果
  console.log('💾 保存结果...');
  
  // 保存到JSON（保持向后兼容）
  const outDir = path.join(__dirname, 'results');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, timestamp.split('T')[0] + '.json');
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`  JSON: ${outFile}`);
  
  // 保存到数据库
  const validMovies = results.movies.filter(m => m.panLink && m.panType);
  if (validMovies.length > 0) {
    await db.initDatabase();
    const inserted = db.insertMovies(validMovies);
    console.log(`  数据库: 新增 ${inserted}/${validMovies.length} 条`);
    
    const stats = db.getStats();
    console.log(`  数据库统计: 总${stats.total}, 待转存${stats.pending_count}`);
    db.closeDatabase();
  }

  console.log(`\n✅ 完成！`);
  console.log(`   共处理 ${results.movies.length} 部，有效 ${validMovies.length} 部\n`);

  console.log('📊 摘要:');
  results.movies.forEach(m => {
    if (m.panLink) {
      console.log(`   ✅ ${m.title}: ${m.panLink.substring(0, 50)}...`);
    } else {
      console.log(`   ❌ ${m.title}: ${m.status}`);
    }
  });

  return results;
}

// ============ 主函数 ============
async function main() {
  console.log('====================================');
  console.log('  SeedHub 资源监控系统');
  console.log('====================================\n');

  // 检查/启动 Edge
  if (!isEdgeRunning()) {
    await startEdge();
  } else {
    console.log('✅ Edge 已在调试模式运行\n');
  }

  // 判断运行模式
  const loopMode = args.includes('--loop') || INTERVAL_HOURS > 0;

  if (loopMode) {
    console.log(`⏰ 定时模式：每 ${INTERVAL_HOURS} 小时运行一次\n`);
    
    // 先运行一次
    await scrape();
    
    // 定时运行
    setInterval(async () => {
      await scrape();
    }, INTERVAL_HOURS * 60 * 60 * 1000);

    console.log(`⏰ 下次运行: ${new Date(Date.now() + INTERVAL_HOURS * 60 * 60 * 1000).toLocaleString()}\n`);
    console.log('💤 等待下次运行...\n');
  } else {
    await scrape();
  }
}

main().catch(console.error);
