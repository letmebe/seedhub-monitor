/**
 * utils.js - 通用工具函数
 * 
 * 避免在多个文件中重复实现相同的工具函数
 */

const { execSync } = require('child_process');
const net = require('net');

// ============ 常量 ============
const CDP_PORT = 9222;
const DEFAULT_TARGET_PATH = '/视听娱乐/SeedHub';

// ============ 工具函数 ============

/**
 * 延迟函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 检查浏览器是否在调试模式运行
 */
function isBrowserRunning(port = CDP_PORT) {
  try {
    const result = execSync(
      `netstat -ano | findstr ":${port}" | findstr "LISTENING"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * 连接到浏览器（CDP）
 * 注意：需要安装 agent-browser 模块
 */
async function connectToBrowser(port = CDP_PORT) {
  try {
    const { connect } = require('agent-browser');
    const browser = await connect(port);
    console.log('✅ 已连接到浏览器');
    return browser;
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.error('❌ 未安装 agent-browser 模块');
      console.log('💡 安装方法: npm install -g agent-browser');
    } else {
      console.error('❌ 连接浏览器失败:', error.message);
    }
    console.log('💡 请确保浏览器已在调试模式运行:');
    console.log('   npm run start-chrome');
    console.log('   npm run start-edge');
    return null;
  }
}

/**
 * 等待端口就绪
 */
function waitForPort(port = CDP_PORT, timeout = 20000) {
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

/**
 * 格式化日期
 */
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('zh-CN');
}

/**
 * 格式化时间戳
 */
function formatTimestamp(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleString('zh-CN');
}

/**
 * 截断字符串
 */
function truncate(str, length = 40) {
  if (!str) return '';
  return str.length > length ? str.substring(0, length) + '...' : str;
}

/**
 * 安全解析JSON
 */
function safeJsonParse(str, defaultValue = null) {
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
}

module.exports = {
  // 常量
  CDP_PORT,
  DEFAULT_TARGET_PATH,
  
  // 函数
  sleep,
  isBrowserRunning,
  connectToBrowser,
  waitForPort,
  formatDate,
  formatTimestamp,
  truncate,
  safeJsonParse
};
