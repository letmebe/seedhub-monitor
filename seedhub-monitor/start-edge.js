/**
 * start-edge.js - 启动 Edge 调试模式并等待就绪
 * 用法：node start-edge.js
 */
const { spawn } = require('child_process');
const net = require('net');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function startEdge() {
  // 先杀掉已有的 Edge 进程
  try { require('child_process').execSync('taskkill /F /IM msedge.exe', { stdio: 'ignore' }); } catch {}
  
  const edge = spawn(EDGE_PATH, [
    '--remote-debugging-port=9222',
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

waitForPort(9222).then(function() {
  console.log('Edge 已在端口 9222 就绪');
  process.exit(0);
}).catch(function(err) {
  console.error('启动失败:', err.message);
  process.exit(1);
});
