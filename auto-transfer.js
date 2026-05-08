#!/usr/bin/env node
/**
 * auto-transfer.js - 自动转存待处理电影
 * 
 * 功能：
 * 1. 从数据库读取未转存的电影
 * 2. 调用百度网盘转存功能
 * 3. 更新数据库转存状态
 * 
 * 使用：
 *   node auto-transfer.js              # 转存所有待处理电影
 *   node auto-transfer.js --limit 5   # 最多转存5部
 *   node auto-transfer.js --dry-run   # 仅查看待转存列表，不执行
 */

const db = require('./db');
const { transferBaiduShare } = require('./baidu_transfer');
const { connect } = require('agent-browser');

const CDP_PORT = 9222;
const DEFAULT_TARGET_PATH = '/视听娱乐/SeedHub';
const DEFAULT_LIMIT = 10;

const args = process.argv.slice(2);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectToBrowser() {
  try {
    const browser = await connect(CDP_PORT);
    console.log('✅ 已连接到浏览器');
    return browser;
  } catch (error) {
    console.error('❌ 连接浏览器失败:', error.message);
    console.log('💡 请确保浏览器已在调试模式运行: node start-edge.js');
    return null;
  }
}

async function autoTransfer(options = {}) {
  const limit = options.limit || DEFAULT_LIMIT;
  const dryRun = options.dryRun || false;
  const targetPath = options.targetPath || DEFAULT_TARGET_PATH;
  
  console.log('='.repeat(60));
  console.log('SeedHub 自动转存');
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
    return;
  }
  
  const pendingMovies = db.getUntransferred(limit);
  
  console.log(`\n📋 待转存列表 (${pendingMovies.length}/${stats.pending_count}):`);
  pendingMovies.forEach((movie, i) => {
    console.log(`   ${i + 1}. ${movie.title} (${movie.pan_type})`);
  });
  
  if (dryRun) {
    console.log('\n🔍 [DRY RUN] 仅查看，不执行转存');
    db.closeDatabase();
    return;
  }
  
  const browser = await connectToBrowser();
  if (!browser) {
    db.closeDatabase();
    return;
  }
  
  console.log(`\n🚀 开始转存...\n`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < pendingMovies.length; i++) {
    const movie = pendingMovies[i];
    console.log(`\n[${i + 1}/${pendingMovies.length}] ${movie.title}`);
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
  
  db.closeDatabase();
}

function showHelp() {
  console.log('用法:');
  console.log('  node auto-transfer.js              转存待处理电影');
  console.log('  node auto-transfer.js --limit 5    最多转存5部');
  console.log('  node auto-transfer.js --dry-run    仅查看待转存列表');
  console.log('  node auto-transfer.js --help       显示帮助');
  console.log('\n配置:');
  console.log(`  目标路径: ${DEFAULT_TARGET_PATH}`);
  console.log(`  默认限制: ${DEFAULT_LIMIT} 部`);
}

async function main() {
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }
  
  const options = {
    dryRun: args.includes('--dry-run'),
    limit: DEFAULT_LIMIT,
    targetPath: DEFAULT_TARGET_PATH
  };
  
  if (args.includes('--limit')) {
    const limitIndex = args.indexOf('--limit');
    options.limit = parseInt(args[limitIndex + 1]) || DEFAULT_LIMIT;
  }
  
  if (args.includes('--path')) {
    const pathIndex = args.indexOf('--path');
    options.targetPath = args[pathIndex + 1] || DEFAULT_TARGET_PATH;
  }
  
  await autoTransfer(options);
}

main().catch(console.error);
