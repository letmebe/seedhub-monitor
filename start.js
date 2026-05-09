#!/usr/bin/env node
/**
 * start.js - 自动抓取并转存（主入口）
 * 
 * 功能：
 * 1. 启动浏览器
 * 2. 抓取最新资源
 * 3. 自动转存所有新记录
 * 
 * 使用：
 *   npm start                    # 抓取并转存所有
 *   npm start -- --dry-run       # 仅抓取，不转存
 *   npm start -- --max-movies 10 # 抓取前10部并转存
 */

const { execSync } = require('child_process');
const path = require('path');
const db = require('./db');
const browser = require('./browser-manager');
const utils = require('./utils');

const args = process.argv.slice(2);

async function main() {
  console.log('='.repeat(60));
  console.log('SeedHub 自动抓取与转存');
  console.log('='.repeat(60));
  console.log();

  // Step 1: 启动浏览器
  console.log('📍 Step 1: 启动浏览器');
  try {
    await browser.startBrowser({ browserType: 'chrome' });
    console.log();
  } catch (err) {
    console.error('❌ 浏览器启动失败:', err.message);
    process.exit(1);
  }

  // Step 2: 抓取
  console.log('📍 Step 2: 抓取资源');
  console.log('='.repeat(60));
  
  const scrapeScript = path.join(__dirname, 'scrape.js');
  const scrapeArgs = args.filter(arg => arg === '--loop' || arg.startsWith('--max-movies'));
  
  try {
    execSync(`node "${scrapeScript}" ${scrapeArgs.join(' ')}`, {
      stdio: 'inherit',
      cwd: __dirname
    });
  } catch (err) {
    console.error('❌ 抓取失败:', err.message);
    process.exit(1);
  }

  // Step 3: 检查是否需要转存
  const dryRun = args.includes('--dry-run');
  
  if (dryRun) {
    console.log('\n🔍 [DRY RUN] 跳过转存步骤');
    return;
  }

  // Step 4: 自动转存
  console.log('\n📍 Step 3: 自动转存');
  console.log('='.repeat(60));

  await db.initDatabase();
  const stats = db.getStats();
  
  if (stats.pending_count === 0) {
    console.log('\n✅ 没有新资源需要转存');
    db.closeDatabase();
    return;
  }

  console.log(`\n发现 ${stats.pending_count} 条待转存记录`);
  db.closeDatabase();

  // 调用auto-transfer脚本
  const transferScript = path.join(__dirname, 'scripts', 'auto-transfer.js');
  
  try {
    execSync(`node "${transferScript}"`, {
      stdio: 'inherit',
      cwd: __dirname
    });
  } catch (err) {
    console.error('❌ 转存失败:', err.message);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ 全部完成');
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});
