/**
 * start-edge.js - 启动 Edge 调试模式并等待就绪
 * 用法：node start-edge.js
 */
const { spawn, execSync } = require('child_process');
const net = require('net');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA_DIR = path.join(__dirname, 'edge-debug-profile');
const CDP_PORT = 9222;

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
          console.log(`  ⚠️  无法关闭进程 ${pid}: ${e.message}`);
        }
      }
    }
  } catch (e) {
    // netstat 未找到占用端口的进程，正常情况
  }
  
  return false;
}

function startEdge() {
  console.log('检查调试端口...');
  
  if (killProcessOnPort(CDP_PORT)) {
    console.log('  等待进程退出...');
    const start = Date.now();
    while (Date.now() - start < 3000) {
      // 等待3秒让进程完全退出
    }
  }
  
  console.log('启动 Edge 调试模式...');
  
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check'
  ], {
    detached: true,
    stdio: 'ignore',
    shell: true
  });
  edge.unref();
  return edge;
}

function waitForPort(port, host, timeout) {
  host = host || '127.0.0.1';
  timeout = timeout || 20000;
  return new Promise(function(resolve, reject) {
    var start = Date.now();
    function tryConnect() {
      var sock = net.connect(port, host, function() {
        sock.destroy();
        resolve(true);
      });
      sock.on('error', function() {
        if (Date.now() - start > timeout) {
          reject(new Error('Timeout waiting for port ' + port));
        } else {
          setTimeout(tryConnect, 800);
        }
      });
    }
    tryConnect();
  });
}

console.log('启动 Edge 调试模式...');
startEdge();

waitForPort(CDP_PORT).then(function() {
  console.log('✅ Edge 已在端口', CDP_PORT, '就绪');
  process.exit(0);
}).catch(function(err) {
  console.error('❌ 启动失败:', err.message);
  process.exit(1);
});
