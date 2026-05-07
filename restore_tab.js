// restore_tab.js - 恢复百度网盘标签页
const { execFileSync } = require('child_process');
const path = require('path');
const AGENT_JS = path.join(process.env.APPDATA, 'npm', 'node_modules', 'agent-browser', 'bin', 'agent-browser.js');
const CLEAN_ENV = Object.assign({}, process.env, { NODE_OPTIONS: '' });

function runAgent(...args) {
  return execFileSync('node', [AGENT_JS, '--cdp', '9222', ...args], {
    encoding: 'utf8', timeout: 15000, env: CLEAN_ENV
  });
}

console.log('切换到百度网盘标签页...');
console.log(runAgent('tab', 't7'));
console.log('导航到分享链接...');
console.log(runAgent('open', 'https://pan.baidu.com/s/1MkqhXmSWTY3--znq1wzHlw'));
console.log('等待 6 秒...');

// 用同步延迟
const start = Date.now();
while (Date.now() - start < 6000) {
  require('child_process').execFileSync('ping', ['-n', '2', '127.0.0.1'], { stdio: 'ignore' });
}

console.log('验证 URL:');
console.log(runAgent('eval', 'window.location.href'));
