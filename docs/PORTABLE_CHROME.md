# 便携版浏览器集成方案

## 方案概述

集成便携版Chromium，避免依赖用户系统浏览器。

**当前实现**：
- ✅ 自动下载最新版本（从Chrome for Testing API）
- ✅ 精确平台匹配（win64/win32/mac-x64/mac-arm64/linux64）
- ✅ 自动解压和目录结构调整
- ✅ 独立用户数据目录（不污染系统）
- ✅ API失败时使用备用版本

## 已实现功能

### 自动下载脚本

**文件**：`scripts/download-chrome.js`

```bash
# 下载便携版Chromium
npm run download-chrome

# 检查状态
npm run check-chrome
```

**特性**：
- 从Chrome for Testing API获取最新版本
- 使用curl绕过Windows SSL证书吊销检查问题
- 精确匹配平台（win64而非模糊匹配win）
- 自动解压并调整目录结构
- 失败时回退到已知稳定版本

**当前版本**：150.0.7834.0（约416MB）

### 浏览器管理模块

**文件**：`browser-manager.js`

提供统一接口：
- `startBrowser()` - 启动浏览器（优先便携版）
- `closeBrowser()` - 优雅或强制关闭
- `closeBrowserGracefully()` - CDP Browser.close命令
- `killProcessOnPort()` - 强制关闭端口进程
- `isBrowserRunning()` - 检测运行状态
- `waitForPort()` - 等待端口就绪

### 启动脚本

**文件**：`scripts/start-chrome.js`

```bash
npm run start-chrome
```

**功能**：
- 自动检测便携版Chromium
- 不存在时回退到系统Edge
- 独立用户数据目录
- 等待调试端口就绪

## 为什么选择便携版Chromium

**优势**：
- ✅ 开源免费（BSD许可证）
- ✅ 无Google服务依赖
- ✅ 自动获取最新版本
- ✅ 配置隔离（不污染用户系统）
- ✅ 跨平台支持

**对比**：

| 方案 | 体积 | 许可证 | 优势 | 劣势 |
|-----|------|--------|------|------|
| **便携Chromium** | 416MB | BSD | 开源免费，自动更新 | 首次需下载 |
| 便携Chrome | 200MB | 专有 | 功能完整 | 许可证问题 |
| Playwright | 280MB | Apache | 自动管理 | 体积大 |
| 系统Edge | 0MB | - | 已安装 | 配置冲突风险 |

## 使用流程

### 首次使用

```bash
# 1. 下载便携版Chromium
npm run download-chrome

# 2. 启动浏览器
npm run start-chrome

# 3. 在浏览器中登录百度网盘

# 4. 开始使用
npm start
```

### 日常使用

```bash
# 启动浏览器（会自动检测已有的）
npm run start-chrome

# 或直接运行（start.js会自动启动浏览器）
npm start
```

## 技术实现

### 下载源

使用**Chrome for Testing**官方API：

```
https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json
```

**优点**：
- ✅ Google官方维护
- ✅ 稳定版本
- ✅ 专为自动化测试优化
- ✅ 自动获取最新版本

### API访问问题解决

**问题**：Windows系统SSL证书吊销检查失败
```
schannel: next InitializeSecurityContext failed: 
Unknown error (0x80092013) - 由于吊销服务器已脱机，吊销功能无法检查吊销
```

**解决方案**：
1. 使用 `curl -k` 命令绕过SSL验证
2. API失败时回退到已知稳定版本

**代码**：
```javascript
async function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    try {
      const result = execSync(`curl -k -s "${url}"`, {
        timeout: 30000,
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024
      });
      
      const json = JSON.parse(result);
      resolve(json);
    } catch (e) {
      reject(new Error(`请求失败: ${e.message}`));
    }
  });
}
```

### 平台匹配

**精确匹配**（避免win64匹配到win32）：

```javascript
function getPlatformPattern() {
  if (PLATFORM === 'win32') {
    return ARCH === 'x64' ? 'win64' : 'win32';
  } else if (PLATFORM === 'darwin') {
    return ARCH === 'arm64' ? 'mac-arm64' : 'mac-x64';
  } else {
    return 'linux64';
  }
}
```

### 备用版本

当API访问失败时使用已知稳定版本：

```javascript
const fallbackVersions = {
  'win64': { 
    version: '148.0.7778.96', 
    url: 'https://storage.googleapis.com/chrome-for-testing-public/148.0.7778.96/win64/chrome-win64.zip' 
  },
  // ... 其他平台
};
```

## 目录结构

```
seedhub-monitor/
├── chrome/                    # 便携版Chromium（自动生成）
│   └── chrome/                # 解压后的文件
│       ├── chrome.exe         # 主程序
│       ├── chrome.dll         # 核心库
│       └── ...
│
├── chrome-profile/            # 用户数据目录
│   ├── Default/               # 默认配置
│   └── ...
│
└── scripts/
    ├── download-chrome.js     # 下载脚本
    ├── check-chrome.js        # 检查脚本
    └── start-chrome.js        # 启动脚本
```

## 配置管理

### 独立用户数据目录

```javascript
const USER_DATA_DIR = path.join(__dirname, 'chrome-profile');
```

**优点**：
- ✅ 完全独立
- ✅ 不影响系统浏览器
- ✅ 便于清理
- ✅ 配置隔离

### 调试端口

```javascript
const CDP_PORT = 9222;
```

## 更新机制

### 手动更新

```bash
# 删除旧版本
rm -rf chrome/

# 重新下载
npm run download-chrome
```

### 自动更新（未实现）

可在 `start.js` 中添加版本检查：

```javascript
const currentVersion = getCurrentChromeVersion();
const latestVersion = await getLatestVersion();

if (currentVersion < latestVersion) {
  console.log('发现新版本，更新中...');
  await downloadChrome();
}
```

## Git管理

### .gitignore配置

```gitignore
# 忽略便携版浏览器（体积大）
chrome/

# 忽略浏览器配置
chrome-profile/
```

### 提供下载脚本

下载脚本已提交到仓库，用户首次使用时自动下载。

## 故障排查

### 下载失败

```bash
# 检查网络连接
curl -I https://googlechromelabs.github.io/chrome-for-testing/

# 手动下载
# 访问：https://googlechromelabs.github.io/chrome-for-testing/
# 找到对应平台的下载链接
# 下载后解压到 chrome/ 目录
```

### 启动失败

```bash
# 检查Chromium是否存在
npm run check-chrome

# 检查端口占用
netstat -ano | findstr ":9222"

# 关闭占用进程
npm run start-chrome  # 会自动关闭旧进程
```

### 配置丢失

便携版Chromium使用独立配置目录，不会丢失配置。

如果Edge配置丢失，是因为使用了系统Edge，请使用便携版Chromium。

## 许可证说明

### Chromium许可证

```
BSD 3-Clause License
- 可自由使用、修改、分发
- 需保留版权声明
- 不能使用作者名义推广
```

**完全符合开源要求！**

## 未来改进

- [ ] 自动版本检查和更新
- [ ] 体积优化（删除非必要文件）
- [ ] 多版本管理
- [ ] 下载进度显示优化
