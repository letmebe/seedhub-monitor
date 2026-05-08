const db = require('./db');
const fs = require('fs');
const path = require('path');

const TARGET_PATH = '/视听娱乐/SeedHub';
const MAX_TRANSFER_PER_RUN = 10;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runWorkflow(options = {}) {
  console.log('='.repeat(60));
  console.log('SeedHub 自动化工作流');
  console.log('='.repeat(60));
  
  db.initDatabase();
  
  const stats = db.getStats();
  console.log('\n当前状态:');
  console.log(`  总记录: ${stats.total}`);
  console.log(`  已转存: ${stats.transferred_count}`);
  console.log(`  待转存: ${stats.pending_count}`);
  
  if (options.skipTransfer) {
    console.log('\n跳过转存环节');
    db.closeDatabase();
    return;
  }
  
  const pendingMovies = db.getUntransferred(MAX_TRANSFER_PER_RUN);
  
  if (pendingMovies.length === 0) {
    console.log('\n没有待转存的电影');
    db.closeDatabase();
    return;
  }
  
  console.log(`\n开始转存 ${pendingMovies.length} 部电影...\n`);
  
  for (let i = 0; i < pendingMovies.length; i++) {
    const movie = pendingMovies[i];
    console.log(`[${i + 1}/${pendingMovies.length}] ${movie.title}`);
    console.log(`  网盘类型: ${movie.pan_type}`);
    console.log(`  分享链接: ${movie.pan_link}`);
    
    if (movie.pan_type !== '百度') {
      console.log('  跳过: 暂不支持该网盘类型');
      continue;
    }
    
    try {
      const { transferBaiduPan } = require('./baidu_transfer');
      
      const browser = await connectToBrowser();
      if (!browser) {
        console.error('无法连接到浏览器');
        break;
      }
      
      const page = browser.pages[0] || await browser.newPage();
      
      const success = await transferBaiduPan(
        page,
        movie.pan_link,
        movie.extract_code || '',
        TARGET_PATH,
        { skipLoginCheck: false }
      );
      
      if (success) {
        db.markTransferred(movie.id, TARGET_PATH);
        console.log('  ✅ 转存成功');
      } else {
        console.log('  ❌ 转存失败');
      }
      
      await sleep(2000);
      
    } catch (error) {
      console.error('  ❌ 转存异常:', error.message);
    }
  }
  
  const finalStats = db.getStats();
  console.log('\n' + '='.repeat(60));
  console.log('工作流完成');
  console.log(`  本次转存: ${stats.pending_count - finalStats.pending_count} 部`);
  console.log(`  剩余待转存: ${finalStats.pending_count} 部`);
  console.log('='.repeat(60));
  
  db.closeDatabase();
}

async function connectToBrowser() {
  const CDP_PORT = 9222;
  
  try {
    const { connect } = require('agent-browser');
    const browser = await connect(CDP_PORT);
    console.log('已连接到浏览器');
    return browser;
  } catch (error) {
    console.error('连接浏览器失败:', error.message);
    console.log('请确保浏览器已在调试模式运行: node start-edge.js');
    return null;
  }
}

function showStatus() {
  db.initDatabase();
  
  const stats = db.getStats();
  console.log('\n数据库状态:');
  console.log(`  总记录: ${stats.total}`);
  console.log(`  已转存: ${stats.transferred_count}`);
  console.log(`  待转存: ${stats.pending_count}`);
  
  if (stats.pending_count > 0) {
    console.log('\n待转存列表:');
    const pending = db.getUntransferred(10);
    pending.forEach((movie, i) => {
      console.log(`  ${i + 1}. ${movie.title} (${movie.pan_type})`);
    });
    
    if (stats.pending_count > 10) {
      console.log(`  ... 还有 ${stats.pending_count - 10} 部`);
    }
  }
  
  db.closeDatabase();
}

const args = process.argv.slice(2);

if (args.includes('--status')) {
  showStatus();
} else if (args.includes('--run')) {
  const skipTransfer = args.includes('--no-transfer');
  runWorkflow({ skipTransfer }).catch(console.error);
} else {
  console.log('用法:');
  console.log('  node workflow.js --status        查看状态');
  console.log('  node workflow.js --run           执行工作流');
  console.log('  node workflow.js --run --no-transfer  仅统计不转存');
}
