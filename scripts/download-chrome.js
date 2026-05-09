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
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function getLatestVersion() {
  console.log('获取最新版本信息...');
  
  const url = 'https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json';
  const data = await fetchJSON(url);
  
  const { platform, arch } = getPlatformInfo();
  
  // 查找最新稳定版本
  for (let i = data.versions.length - 1; i >= 0; i--) {
    const version = data.versions[i];
    const downloads = version.downloads?.chrome;
    
    if (downloads) {
      const download = downloads.find(d => 
        d.platform === platform && 
        (arch === 'x64' || d.platform.includes(arch))
      );
      
      if (download) {
        return {
          version: version.version,
          url: download.url
        };
      }
    }
  }
  
  throw new Error('未找到合适的下载版本');
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
  const { version, url } = await getLatestVersion();
  console.log(`\n版本: ${version}`);
  console.log(`下载地址: ${url}`);
  
  // 下载文件
  const tempFile = path.join(CHROME_DIR, 'chrome-download.zip');
  await downloadFile(url, tempFile);
  
  // 解压
  extractFile(tempFile, CHROME_DIR);
  
  // 删除压缩包
  fs.unlinkSync(tempFile);
  
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
