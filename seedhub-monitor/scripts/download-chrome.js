#!/usr/bin/env node
/**
 * 下载便携版Chromium
 * 
 * 用法：
 *   node scripts/download-chrome.js
 * 
 * 首次运行会自动下载Chromium到chrome/目录
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CHROME_DIR = path.join(__dirname, '..', 'chrome');
const PLATFORM = process.platform;
const ARCH = process.arch;

function getPlatformInfo() {
  let platform, ext;
  
  if (PLATFORM === 'win32') {
    platform = 'win';
    ext = 'zip';
  } else if (PLATFORM === 'darwin') {
    platform = 'mac';
    ext = ARCH === 'arm64' ? 'zip' : 'zip';
  } else {
    platform = 'linux';
    ext = 'tar.gz';
  }
  
  return { platform, ext, arch: ARCH };
}

async function fetchJSON(url) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    const req = client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error(`JSON解析失败: ${e.message}`));
        }
      });
    });
    
    req.on('error', (e) => {
      reject(new Error(`请求失败: ${e.message}`));
    });
    
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
  });
}

function getPlatformPattern() {
  if (PLATFORM === 'win32') {
    return ARCH === 'x64' ? 'win64' : 'win32';
  } else if (PLATFORM === 'darwin') {
    return ARCH === 'arm64' ? 'mac-arm64' : 'mac-x64';
  } else {
    return 'linux64';
  }
}

async function getLatestVersion() {
  console.log('准备下载便携版Chromium...');
  
  const platformPattern = getPlatformPattern();
  console.log(`平台: ${platformPattern} (arch: ${ARCH})`);
  
  // 使用已知稳定版本
  const knownVersions = {
    'win64': { version: '148.0.7778.96', url: 'https://storage.googleapis.com/chrome-for-testing-public/148.0.7778.96/win64/chrome-win64.zip' },
    'win32': { version: '148.0.7778.96', url: 'https://storage.googleapis.com/chrome-for-testing-public/148.0.7778.96/win32/chrome-win32.zip' },
    'mac-x64': { version: '148.0.7778.96', url: 'https://storage.googleapis.com/chrome-for-testing-public/148.0.7778.96/mac-x64/chrome-mac-x64.zip' },
    'mac-arm64': { version: '148.0.7778.96', url: 'https://storage.googleapis.com/chrome-for-testing-public/148.0.7778.96/mac-arm64/chrome-mac-arm64.zip' },
    'linux64': { version: '148.0.7778.96', url: 'https://storage.googleapis.com/chrome-for-testing-public/148.0.7778.96/linux64/chrome-linux64.zip' }
  };
  
  const versionInfo = knownVersions[platformPattern];
  if (!versionInfo) {
    throw new Error(`不支持的平台: ${platformPattern}`);
  }
  
  console.log(`版本: ${versionInfo.version}`);
  return { ...versionInfo, platformPattern };
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`下载: ${url}`);
    console.log(`保存到: ${dest}`);
    
    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      
      const total = parseInt(res.headers['content-length'], 10);
      let downloaded = 0;
      
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        const percent = total ? Math.round(downloaded / total * 100) : 0;
        process.stdout.write(`\r下载进度: ${percent}% (${Math.round(downloaded/1024/1024)}MB)`);
      });
      
      res.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log('\n✅ 下载完成');
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest);
      reject(err);
    });
  });
}

function extractFile(file, dest) {
  console.log('解压文件...');
  
  if (PLATFORM === 'win32') {
    // Windows使用PowerShell解压
    execSync(`powershell -Command "Expand-Archive -Path '${file}' -DestinationPath '${dest}' -Force"`, {
      stdio: 'inherit'
    });
  } else {
    // Linux/macOS使用tar
    execSync(`tar -xzf "${file}" -C "${dest}"`, { stdio: 'inherit' });
  }
  
  console.log('✅ 解压完成');
}

async function downloadChrome() {
  console.log('='.repeat(60));
  console.log('下载便携版Chromium');
  console.log('='.repeat(60));
  
  const { platform } = getPlatformInfo();
  console.log(`\n平台: ${PLATFORM} ${ARCH}`);
  
  // 检查是否已存在
  const chromeExe = PLATFORM === 'win32' 
    ? path.join(CHROME_DIR, 'chrome', 'chrome.exe')
    : path.join(CHROME_DIR, 'chrome', 'chrome');
  
  if (fs.existsSync(chromeExe)) {
    console.log('\n✅ Chromium已存在');
    console.log(`   位置: ${chromeExe}`);
    return;
  }
  
  // 创建目录
  if (!fs.existsSync(CHROME_DIR)) {
    fs.mkdirSync(CHROME_DIR, { recursive: true });
  }
  
  // 获取版本信息
  const { version, url, platformPattern } = await getLatestVersion();
  console.log(`\n版本: ${version}`);
  console.log(`下载地址: ${url}`);
  
  // 下载文件
  const tempFile = path.join(CHROME_DIR, 'chrome-download.zip');
  await downloadFile(url, tempFile);
  
  // 解压
  extractFile(tempFile, CHROME_DIR);
  
  // 删除压缩包
  fs.unlinkSync(tempFile);
  
  // 修正目录结构：解压后是chrome-win64/chrome.exe，需要重命名为chrome/chrome.exe
  const extractedDir = path.join(CHROME_DIR, `chrome-${platformPattern}`);
  const targetDir = path.join(CHROME_DIR, 'chrome');
  
  if (fs.existsSync(extractedDir) && extractedDir !== targetDir) {
    if (fs.existsSync(targetDir)) {
      // 删除旧的chrome目录
      execSync(`rm -rf "${targetDir}"`, { stdio: 'inherit' });
    }
    // 重命名解压目录
    fs.renameSync(extractedDir, targetDir);
    console.log('✅ 目录结构已调整');
  }
  
  // 验证
  if (fs.existsSync(chromeExe)) {
    console.log('\n' + '='.repeat(60));
    console.log('✅ Chromium安装成功');
    console.log(`   版本: ${version}`);
    console.log(`   位置: ${chromeExe}`);
    console.log('='.repeat(60));
  } else {
    console.log('\n❌ 安装失败，请检查下载是否完整');
  }
}

if (require.main === module) {
  downloadChrome().catch(err => {
    console.error('\n❌ 错误:', err.message);
    process.exit(1);
  });
}

module.exports = { downloadChrome };
