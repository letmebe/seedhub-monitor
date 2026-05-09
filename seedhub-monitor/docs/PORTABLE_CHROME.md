# 便携版浏览器集成方案

## 方案概述

集成便携版Chromium，避免依赖用户系统浏览器。

---

## 为什么选择便携版Chromium

**优势**：
- ✅ 开源免费（BSD许可证）
- ✅ 无Google服务依赖
- ✅ 体积适中（约150MB）
- ✅ 自动更新简单
- ✅ 配置隔离（不污染用户系统）

**对比**：

| 方案 | 体积 | 许可证 | 优势 | 劣势 |
|-----|------|--------|------|------|
| **便携Chromium** | 150MB | BSD | 开源免费 | 需下载 |
| 便携Chrome | 200MB | 专有 | 功能完整 | 许可证问题 |
| Playwright | 280MB | Apache | 自动管理 | 体积大 |
| 系统Edge | 0MB | - | 已安装 | 配置冲突 |

---

## 实现方案

### 方案A：预打包（推荐用于Release）

```
seedhub-monitor/
├── chrome/
│   ├── chrome.exe          # Chromium可执行文件
│   ├── locales/            # 语言包
│   └── ...
├── scripts/
│   └── download-chrome.js  # 下载脚本
└── ...
```

**优点**：
- ✅ 开箱即用
- ✅ 无需用户操作

**缺点**：
- ❌ 项目体积大（+150MB）
- ❌ 更新需重新下载

### 方案B：自动下载（推荐）

```
seedhub-monitor/
├── scripts/
│   └── download-chrome.js  # 首次运行自动下载
├── chrome/                  # 下载后存放
│   └── (自动生成)
└── ...
```

**优点**：
- ✅ 项目体积小
- ✅ 自动管理
- ✅ 支持更新

**缺点**：
- ⚠️ 首次需下载

---

## 下载源

### 官方Chrome for Testing

```javascript
// 稳定版本，专为自动化测试设计
const CHROME_VERSION = 'stable';
const PLATFORM = process.platform; // win32, darwin, linux
const ARCH = process.arch; // x64, arm64

// 下载地址
const URL = `https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json`;
```

**优点**：
- ✅ Google官方维护
- ✅ 稳定版本
- ✅ 自动化测试优化

### ungoogled-chromium

```javascript
// 去Google服务的纯净版
const URL = 'https://ungoogled-software.github.io/ungoogled-chromium-binaries/';
```

**优点**：
- ✅ 完全开源
- ✅ 无Google依赖
- ✅ 隐私友好

---

## 实现代码

### 下载脚本

```javascript
// scripts/download-chrome.js
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CHROME_DIR = path.join(__dirname, '..', 'chrome');
const PLATFORM = process.platform;
const ARCH = process.arch;

async function downloadChrome() {
  console.log('下载便携版Chromium...');
  
  // 检测平台
  const platform = PLATFORM === 'win32' ? 'win' : 
                   PLATFORM === 'darwin' ? 'mac' : 'linux';
  
  // 获取最新版本信息
  const versionInfo = await getLatestVersion();
  
  // 下载URL
  const downloadUrl = versionInfo.downloads.chrome[0].url;
  
  console.log(`下载地址: ${downloadUrl}`);
  console.log(`保存到: ${CHROME_DIR}`);
  
  // 下载并解压
  await downloadAndExtract(downloadUrl, CHROME_DIR);
  
  console.log('✅ Chromium下载完成');
}

module.exports = { downloadChrome };
```

### 启动脚本修改

```javascript
// start-edge.js 修改为 start-chrome.js
const CHROME_PATH = fs.existsSync(path.join(__dirname, 'chrome', 'chrome.exe'))
  ? path.join(__dirname, 'chrome', 'chrome.exe')  // 使用便携版
  : findSystemChrome();  // 回退到系统浏览器
```

---

## 配置管理

### 独立配置目录

```javascript
// 使用项目内的配置目录
const USER_DATA_DIR = path.join(__dirname, 'chrome-profile');
```

**优点**：
- ✅ 完全独立
- ✅ 不影响系统浏览器
- ✅ 便于清理

---

## 体积优化

### 最小化打包

仅保留必要文件：
```
chrome/
├── chrome.exe              # 主程序
├── chrome.dll              # 核心库
├── icudtl.dat              # 国际化
├── resources.pak           # 资源
├── locales/en-US.pak       # 语言包（仅英文）
└── ...
```

**删除非必要文件**：
- ❌ locales/（除en-US外）
- ❌ swiftshader/（软件渲染）
- ❌ MEIPreload/（媒体）

**优化后体积**：约 **100-120MB**

---

## 更新机制

### 自动更新

```javascript
// 检查版本
const currentVersion = getCurrentChromeVersion();
const latestVersion = await getLatestVersion();

if (currentVersion < latestVersion) {
  console.log('发现新版本，更新中...');
  await downloadChrome();
}
```

### 手动更新

```bash
npm run update-chrome
```

---

## 使用流程

### 首次使用

```bash
# 方式1：自动下载（推荐）
node start-chrome.js  # 自动检测并下载

# 方式2：手动下载
npm run download-chrome
node start-chrome.js
```

### 日常使用

```bash
node start-chrome.js  # 启动便携版
npm start             # 抓取
npm run transfer      # 转存
```

---

## Git管理

### .gitignore配置

```gitignore
# 忽略便携版浏览器（体积大）
chrome/

# 忽略浏览器配置
chrome-profile/
```

### 提供下载脚本

将下载脚本提交到仓库：
```
scripts/
├── download-chrome.js    # 下载脚本
└── check-chrome.js      # 检查脚本
```

---

## Release打包

### 包含便携版

```bash
# 打包脚本
npm run package

# 生成
seedhub-monitor-v1.0.0-win-x64.zip (约170MB)
├── chrome/              # 便携版Chromium
├── src/                 # 源码
└── package.json
```

### 不包含便携版

```bash
# 轻量打包
npm run package-lite

# 生成
seedhub-monitor-v1.0.0-lite.zip (约20MB)
├── scripts/
│   └── download-chrome.js
├── src/
└── package.json
```

---

## 许可证说明

### Chromium许可证

```
BSD 3-Clause License
- 可自由使用、修改、分发
- 需保留版权声明
- 不能使用作者名义推广
```

**完全符合开源要求！**

---

## 推荐方案

**开发阶段**：
- 使用自动下载方案
- 保持仓库轻量
- `.gitignore`忽略chrome/

**发布Release**：
- 提供两个版本
  - 完整版（含Chromium，约170MB）
  - 轻量版（不含，约20MB，需下载）

**用户选择**：
- 网速快 → 轻量版
- 离线环境 → 完整版

---

## 总结

**推荐实现**：
1. ✅ 创建下载脚本
2. ✅ 修改启动脚本支持便携版
3. ✅ 配置独立用户数据目录
4. ✅ 提供完整版和轻量版两种Release

**预期效果**：
- 🎯 无需依赖系统浏览器
- 🎯 配置完全隔离
- 🎯 开箱即用
- 🎯 跨平台支持
