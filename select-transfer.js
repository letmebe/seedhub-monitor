#!/usr/bin/env node
/**
 * select-transfer.js - 交互式选择转存
 * 
 * 功能：
 * 1. 显示待转存电影列表
 * 2. 用户选择要转存的电影
 * 3. 执行转存并更新状态
 * 
 * 使用：
 *   node select-transfer.js              # 交互式选择
 *   node select-transfer.js --all        # 转存所有
 *   node select-transfer.js --ids 1,3,5  # 指定ID转存
 */

const db = require('./db');
const { transferBaiduShare } = require('./baidu_transfer');
const readline = require('readline');

const CDP_PORT = 9222;
const DEFAULT_TARGET_PATH = '/视听娱乐/SeedHub';

const args = process.argv.slice(2);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectToBrowser() {
  try {
    const { connect } = require('agent-browser');
    const browser = await connect(CDP_PORT);
    console.log('✅ 已连接到浏览器');
    return browser;
  } catch (error) {
    console.error('❌ 连接浏览器失败:', error.message);
    console.log('💡 请确保浏览器已在调试模式运行: node start-edge.js');
    return null;
  }
}

async function showMovieList(movies) {
  console.log('\n📋 待转存列表:\n');
  console.log('ID  | 网盘   | 标题                                    | 更新时间');
  console.log('-'.repeat(80));
  
  movies.forEach((movie, index) => {
    const id = String(index + 1).padStart(2, ' ');
    const pan = movie.pan_type.padEnd(6, ' ');
    const title = movie.title.substring(0, 40).padEnd(40, ' ');
    const time = movie.updated_at ? 
      new Date(movie.updated_at).toLocaleDateString() : 
      new Date(movie.created_at).toLocaleDateString();
    
    console.log(`${id}  | ${pan} | ${title} | ${time}`);
  });
  
  console.log('-'.repeat(80));
  console.log(`共 ${movies.length} 部待转存\n`);
}

async function selectTransfer(options = {}) {
  console.log('='.repeat(60));
  console.log('SeedHub 选择转存');
  console.log('='.repeat(60));
  
  await db.initDatabase();
  
  const stats = db.getStats();
  console.log('\n📊 数据库状态:');
  console.log(`   总记录: ${stats.total}`);
  console.log(`   已转存: ${stats.transferred_count}`);
  console.log(`   待转存: ${stats.pending_count}`);
  
  if (stats.pending_count === 0) {
    console.log('\n✅ 没有待转存的电影');
    db.closeDatabase();
    rl.close();
    return;
  }
  
  const allMovies = db.getUntransferred(100);
  
  if (options.all) {
    console.log('\n🔄 --all 模式: 转存所有待转存电影');
    await executeTransfer(allMovies, DEFAULT_TARGET_PATH);
    db.closeDatabase();
    rl.close();
    return;
  }
  
  if (options.ids) {
    const selectedMovies = options.ids.map(id => allMovies[id - 1]).filter(m => m);
    if (selectedMovies.length === 0) {
      console.log('\n❌ 无效的ID');
      db.closeDatabase();
      rl.close();
      return;
    }
    console.log(`\n🔄 指定ID模式: 转存 ${selectedMovies.length} 部电影`);
    await executeTransfer(selectedMovies, DEFAULT_TARGET_PATH);
    db.closeDatabase();
    rl.close();
    return;
  }
  
  await showMovieList(allMovies);
  
  const answer = await question('请输入要转存的ID(用逗号分隔，或输入all全部转存，q退出): ');
  
  if (answer.toLowerCase() === 'q') {
    console.log('\n👋 已取消');
    db.closeDatabase();
    rl.close();
    return;
  }
  
  let selectedMovies = [];
  
  if (answer.toLowerCase() === 'all') {
    selectedMovies = allMovies;
  } else {
    const ids = answer.split(/[,，\s]+/).map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0 && n <= allMovies.length);
    selectedMovies = ids.map(id => allMovies[id - 1]);
  }
  
  if (selectedMovies.length === 0) {
    console.log('\n❌ 未选择有效电影');
    db.closeDatabase();
    rl.close();
    return;
  }
  
  console.log(`\n已选择 ${selectedMovies.length} 部电影:`);
  selectedMovies.forEach((m, i) => {
    console.log(`  ${i + 1}. ${m.title} (${m.pan_type})`);
  });
  
  const confirm = await question('\n确认转存? (y/n): ');
  
  if (confirm.toLowerCase() !== 'y') {
    console.log('\n👋 已取消');
    db.closeDatabase();
    rl.close();
    return;
  }
  
  await executeTransfer(selectedMovies, DEFAULT_TARGET_PATH);
  
  db.closeDatabase();
  rl.close();
}

async function executeTransfer(movies, targetPath) {
  const browser = await connectToBrowser();
  if (!browser) {
    return;
  }
  
  console.log(`\n🚀 开始转存...\n`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    console.log(`\n[${i + 1}/${movies.length}] ${movie.title}`);
    console.log(`  网盘类型: ${movie.pan_type}`);
    console.log(`  分享链接: ${movie.pan_link}`);
    
    if (movie.pan_type !== '百度') {
      console.log('  ⏭️  跳过: 暂不支持该网盘类型');
      continue;
    }
    
    try {
      const result = await transferBaiduShare(
        movie.pan_link,
        movie.extract_code || '',
        targetPath,
        { skipLoginCheck: false }
      );
      
      if (result && result.success) {
        db.markTransferred(movie.id, targetPath);
        console.log('  ✅ 转存成功');
        successCount++;
      } else {
        console.log('  ❌ 转存失败:', result?.error || '未知错误');
        failCount++;
      }
      
      await sleep(2000);
      
    } catch (error) {
      console.error('  ❌ 转存异常:', error.message);
      failCount++;
    }
  }
  
  const finalStats = db.getStats();
  console.log('\n' + '='.repeat(60));
  console.log('📊 转存完成');
  console.log(`   本次成功: ${successCount} 部`);
  console.log(`   本次失败: ${failCount} 部`);
  console.log(`   剩余待转存: ${finalStats.pending_count} 部`);
  console.log('='.repeat(60));
}

function showHelp() {
  console.log('用法:');
  console.log('  node select-transfer.js              交互式选择');
  console.log('  node select-transfer.js --all        转存所有');
  console.log('  node select-transfer.js --ids 1,3,5  指定ID转存');
  console.log('  node select-transfer.js --help       显示帮助');
}

async function main() {
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    rl.close();
    return;
  }
  
  const options = {
    all: args.includes('--all'),
    ids: null
  };
  
  if (args.includes('--ids')) {
    const idsIndex = args.indexOf('--ids');
    const idsStr = args[idsIndex + 1];
    if (idsStr) {
      options.ids = idsStr.split(/[,，\s]+/).map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    }
  }
  
  await selectTransfer(options);
}

main().catch(error => {
  console.error('错误:', error);
  rl.close();
});
