/**
 * browser-manager.js - 浏览器管理模块
 * 
 * 统一管理浏览器的启动、关闭、检测
 * 提供优雅关闭（CDP Browser.close）和强制关闭两种方式
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

const CDP_PORT = 9222;

/**
 * 通过CDP Browser.close优雅关闭浏览器
 */
async function closeBrowserGracefully(port = CDP_PORT) {
  return new Promise((resolve) => {
    const req = net.connect(port, '127.0.0.1', () => {
      // 获取WebSocket URL
      const getVersion = `GET /json/version HTTP/1.1\r\nHost: localhost:${port}\r\n\r\n`;
      req.write(getVersion);
      
      let data = '';
      req.on('data', chunk => {
        data += chunk;
        if (data.includes('\r\n\r\n')) {
          // 解析响应
          const body = data.split('\r\n\r\n')[1];
          try {
            const info = JSON.parse(body);
            const wsUrl = info.webSocketDebuggerUrl;
            
            // 通过WebSocket发送Browser.close
            // 简化：直接用HTTP /json/close关闭所有页面
            const closeReq = net.connect(port, '127.0.0.1', () => {
              closeReq.write(`GET /json/close HTTP/1.1\r\nHost: localhost:${port}\r\n\r\n`);
              closeReq.end();
            });
            
            closeReq.on('close', () => {
              console.log('✅ 浏览器已优雅关闭');
              resolve(true);
            });
            
            closeReq.on('error', () => resolve(false));
          } catch (e) {
            resolve(false);
          }
          req.end();
        }
      });
    });
    
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * 强制关闭占用端口的进程
 */
function killProcessOnPort(port = CDP_PORT) {
  try {
    const result = execSync(
      `netstat -ano | findstr ":${port}" | findstr "LISTENING"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    
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

/**
 * 检查浏览器是否运行
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
 * 检查 CDP 是否真正可响应（端口监听不代表 CDP 能响应，浏览器卡死时端口可能仍在监听）
 * 通过 HTTP 请求 /json/version 验证
 */
function checkCDPHealth(port = CDP_PORT) {
  return new Promise((resolve) => {
    const req = net.connect(port, '127.0.0.1', () => {
      req.write(`GET /json/version HTTP/1.1\r\nHost: localhost:${port}\r\n\r\n`);
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
        if (data.includes('\r\n\r\n')) {
          try {
            const body = data.split('\r\n\r\n')[1];
            JSON.parse(body); // 能解析即健康
            resolve(true);
          } catch {
            resolve(false);
          }
          req.destroy();
        }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * 确保浏览器健康：检查 CDP 可响应，否则自动重启浏览器
 * 用于抓取阶段后浏览器可能崩溃/卡死的场景
 */
async function ensureBrowserHealthy(options = {}) {
  const {
    port = CDP_PORT,
    browserType = 'chrome'
  } = options;

  const running = isBrowserRunning(port);
  const healthy = running && await checkCDPHealth(port);

  if (healthy) {
    console.log(`✅ 浏览器健康检查通过（端口 ${port} CDP 可响应）`);
    return true;
  }

  if (running && !healthy) {
    console.log('⚠️  浏览器端口在监听但 CDP 无响应（可能卡死），强制关闭...');
    killProcessOnPort(port);
    await new Promise(r => setTimeout(r, 3000));
  } else {
    console.log('⚠️  浏览器未运行，自动重启...');
  }

  // 重启浏览器
  console.log('🔄 重启浏览器...');
  await startBrowser({ browserType, port, gracefulClose: false });
  // 等待浏览器完全就绪
  await new Promise(r => setTimeout(r, 3000));
  return false;
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
 * 标记上次退出为正常退出，避免 Chrome 启动时显示"恢复页面"崩溃提示栏
 * Chrome 根据 Preferences 文件中 profile.exit_type 字段判断：
 *   "Crashed" / "Abnormal" → 显示恢复提示，阻塞页面操作
 *   "Normal"                → 正常启动，无提示
 */
function markCleanExit(userDataDir) {
  try {
    const prefPath = path.join(userDataDir, 'Default', 'Preferences');
    if (!fs.existsSync(prefPath)) return;
    const raw = fs.readFileSync(prefPath, 'utf8');
    const prefs = JSON.parse(raw);
    if (!prefs.profile) prefs.profile = {};
    // 仅在需要修改时写入，避免无谓的文件改动
    if (prefs.profile.exit_type !== 'Normal') {
      prefs.profile.exit_type = 'Normal';
      fs.writeFileSync(prefPath, JSON.stringify(prefs), 'utf8');
      console.log('  已重置 exit_type=Normal（避免崩溃恢复提示）');
    }
  } catch (e) {
    // 解析/写入失败不阻断启动，仅记录
    console.log(`  ⚠️ 重置 exit_type 跳过: ${e.message}`);
  }
}

/**
 * 查找浏览器可执行文件
 */
function findBrowserExecutable(browserType = 'chrome') {
  const PLATFORM = process.platform;
  
  if (browserType === 'chrome') {
    // 优先：环境变量指定的浏览器路径
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
      return { path: process.env.CHROME_PATH, type: 'custom-chrome' };
    }

    // 便携版Chromium
    const portableChrome = PLATFORM === 'win32'
      ? path.join(__dirname, 'chrome', 'chrome', 'chrome.exe')
      : path.join(__dirname, 'chrome', 'chrome', 'chrome');
    
    if (fs.existsSync(portableChrome)) {
      return { path: portableChrome, type: 'portable-chrome' };
    }
    
    // 回退到系统Edge
    const systemEdge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    if (PLATFORM === 'win32' && fs.existsSync(systemEdge)) {
      return { path: systemEdge, type: 'system-edge' };
    }
  } else if (browserType === 'edge') {
    const systemEdge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    if (PLATFORM === 'win32' && fs.existsSync(systemEdge)) {
      return { path: systemEdge, type: 'system-edge' };
    }
  }
  
  return null;
}

/**
 * 启动浏览器
 */
async function startBrowser(options = {}) {
  const {
    browserType = 'chrome',
    port = CDP_PORT,
    gracefulClose = true
  } = options;
  
  const browserInfo = findBrowserExecutable(browserType);
  
  if (!browserInfo) {
    throw new Error('未找到浏览器');
  }
  
  console.log(`浏览器类型: ${browserInfo.type}`);
  
  // 关闭已有实例
  if (isBrowserRunning(port)) {
    console.log('检测到浏览器已在运行');
    
    if (gracefulClose) {
      console.log('尝试优雅关闭...');
      const closed = await closeBrowserGracefully(port);
      if (!closed) {
        console.log('优雅关闭失败，使用强制关闭');
        killProcessOnPort(port);
      }
    } else {
      killProcessOnPort(port);
    }
    
    // 等待进程退出
    await new Promise(r => setTimeout(r, 3000));
  }
  
  // 用户数据目录（优先使用环境变量指定的 profile，复用已登录状态）
  const userDataDir = process.env.CHROME_PROFILE
    ? process.env.CHROME_PROFILE
    : path.join(__dirname, `${browserType}-profile`);
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  
  // 重置 exit_type，避免上次崩溃后启动时弹出"恢复页面"提示栏阻塞操作
  markCleanExit(userDataDir);
  
  console.log('启动浏览器...');
  
  const browser = spawn(browserInfo.path, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--disable-session-crashed-bubble',
    '--disable-features=InfiniteSessionRestore'
  ], {
    detached: true,
    stdio: 'ignore',
    shell: true
  });
  
  browser.unref();
  
  // 等待就绪
  await waitForPort(port);
  
  console.log(`✅ 浏览器已在端口 ${port} 就绪`);
  
  return {
    port,
    type: browserInfo.type,
    userDataDir
  };
}

/**
 * 关闭浏览器（自动选择优雅或强制）
 */
async function closeBrowser(port = CDP_PORT) {
  if (!isBrowserRunning(port)) {
    console.log('浏览器未运行');
    return false;
  }
  
  // 先尝试优雅关闭
  const closed = await closeBrowserGracefully(port);
  
  if (closed) {
    return true;
  }
  
  // 回退到强制关闭
  console.log('优雅关闭失败，使用强制关闭');
  return killProcessOnPort(port);
}

module.exports = {
  CDP_PORT,
  startBrowser,
  closeBrowser,
  closeBrowserGracefully,
  killProcessOnPort,
  isBrowserRunning,
  checkCDPHealth,
  ensureBrowserHealthy,
  waitForPort,
  findBrowserExecutable
};
