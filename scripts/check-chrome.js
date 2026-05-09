#!/usr/bin/env node
/**
 * 检查便携版Chromium状态
 */

const fs = require('fs');
const path = require('path');

const CHROME_DIR = path.join(__dirname, '..', 'chrome');
const PLATFORM = process.platform;

function checkChrome() {
  console.log('='.repeat(60));
  console.log('Chromium状态检查');
  console.log('='.repeat(60));
  
  const chromeExe = PLATFORM === 'win32'
    ? path.join(CHROME_DIR, 'chrome', 'chrome.exe')
    : path.join(CHROME_DIR, 'chrome', 'chrome');
  
  if (fs.existsSync(chromeExe)) {
    console.log('\n✅ 状态: 已安装');
    console.log(`   位置: ${chromeExe}`);
    
    // 获取文件大小
    const stats = fs.statSync(chromeExe);
    const sizeMB = Math.round(stats.size / 1024 / 1024);
    console.log(`   大小: ${sizeMB}MB`);
    
    // 检查chrome目录总大小
    let totalSize = 0;
    const chromePath = path.dirname(chromeExe);
    
    function calcSize(dir) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          calcSize(filePath);
        } else {
          totalSize += stat.size;
        }
      }
    }
    
    try {
      calcSize(chromePath);
      const totalMB = Math.round(totalSize / 1024 / 1024);
      console.log(`   总体积: ${totalMB}MB`);
    } catch (e) {}
    
    return true;
  } else {
    console.log('\n❌ 状态: 未安装');
    console.log('\n安装方法:');
    console.log('  node scripts/download-chrome.js');
    return false;
  }
}

if (require.main === module) {
  checkChrome();
}

module.exports = { checkChrome };
