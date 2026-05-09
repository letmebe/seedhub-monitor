#!/usr/bin/env node
/**
 * start-chrome.js - 启动便携版Chromium调试模式
 * 
 * 用法：
 *   node start-chrome.js
 * 
 * 自动检测并使用便携版Chromium，如不存在则提示下载
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

const CHROME_DIR = path.join(__dirname, 'chrome');
const USER_DATA_DIR = path.join(__dirname, 'chrome-profile');
const CDP_PORT = 9222;
const PLATFORM = process.platform;

function findChromeExecutable() {
  // 1. 检查便携版
  const portableChrome = PLATFORM === 'win32'
    ? path.join(CHROME_DIR, 'chrome', 'chrome.exe')
    : path.join(CHROME_DIR, 'chrome', 'chrome');
  
  if (fs.existsSync(portableChrome)) {
    console.log('✅ 使用便携版Chromium');
    return portableChrome;
  }
  
  // 2. 检查系统Edge（回退）
  const systemEdge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  if (PLATFORM === 'win32' && fs.existsSync(systemEdge)) {
    console.log('⚠️  使用系统Edge（建议安装便携版Chromium）');
    console.log('   安装方法: node scripts/download-chrome.js');
    return systemEdge;
  }
  
  // 3. 未找到
  console.log('❌ 未找到浏览器');
  console.log('\n安装便携版Chromium:');
  console.log('  node scripts/download-chrome.js');
  return null;
}

function killProcessOnPort(port) {
  try {
    const result = execSync(`netstat -ano | findstr ":${port}" | findstr "LISTENING"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    const lines = result.trim().split('\n');
    for (const line of lines) {
      const match = line.match(/\s+(\d+)\s*$/);
      if (match) {
        const pid = match[1];
        console.log(`  发现占用端口 ${port} 的进程 PID: ${pid}`);
        
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
          console.log(`  ✅ 已关闭进程 ${pid}`);
          return true;
        } catch (e) {
          console.log(`  ⚠️  无法关闭进程 ${pid}`);
        }
      }
    }
  } catch (e) {
    // 未找到占用端口的进程
  }
  
  return false;
}

function startChrome() {
  const chromePath = findChromeExecutable();
  
  if (!chromePath) {
    process.exit(1);
  }
  
  console.log('\n检查调试端口...');
  
  if (killProcessOnPort(CDP_PORT)) {
    console.log('  等待进程退出...');
    const start = Date.now();
    while (Date.now() - start < 3000) {
      // 等待进程退出
    }
  }
  
  console.log('启动浏览器调试模式...');
  
  // 确保用户数据目录存在
  if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  }
  
  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled'
  ], {
    detached: true,
    stdio: 'ignore',
    shell: true
  });
  
  chrome.unref();
  return chrome;
}

function waitForPort(port, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    
    function tryConnect() {
      const sock = net.connect(port, '127.0.0.1', () => {
        sock.destroy();
        resolve(true);
      });
      
      sock.on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(tryConnect, 800);
        }
      });
    }
    
    tryConnect();
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('启动浏览器调试模式');
  console.log('='.repeat(60));
  
  startChrome();
  
  try {
    await waitForPort(CDP_PORT);
    console.log(`\n✅ 浏览器已在端口 ${CDP_PORT} 就绪`);
    console.log(`   用户数据: ${USER_DATA_DIR}`);
    console.log('\n提示:');
    console.log('  - 首次使用请登录百度网盘');
    console.log('  - 不要登录微软账户或开启同步');
    console.log('  - 调试窗口可以关闭，不影响使用');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ 启动失败:', err.message);
    process.exit(1);
  }
}

main();
