# SeedHub 影视资源监控系统

自动抓取SeedHub影视资源并支持交互式转存到百度网盘。

## 功能特性

- ✅ 自动抓取 SeedHub 电影资源
- ✅ 支持百度/UC/夸克/天翼网盘（请根据百度方案自行改造）
- ✅ SQLite数据库增量存储
- ✅ 智能链接更新检测
- ✅ 交互式选择转存
- ✅ 百度网盘自动转存
- ✅ 便携版Chromium支持（自动下载）
- ✅ 一键运行完整流程

## 快速开始

### 1. 安装依赖

```bash
cd seedhub-monitor
npm install
npm install -g agent-browser
```

### 2. 准备浏览器

**方式A：便携版Chromium（推荐）**
```bash
# 自动下载便携版浏览器
npm run download-chrome

# 检查状态
npm run check-chrome
```

**方式B：系统Edge（备选）**
```bash
# 使用系统安装的Edge
npm run start-edge
```

### 3. 登录百度网盘并准备转存目录

首次使用需要准备百度网盘环境：

```bash
# 启动浏览器
npm run start-chrome  # 或 npm run start-edge
```

启动后，在浏览器窗口中完成以下步骤：

1. **登录百度网盘**
   - 访问 `https://pan.baidu.com`
   - 使用百度账号登录

2. **创建转存目录**
   - 默认转存目录：`/视听娱乐/SeedHub`
   - 如果该目录不存在，请在百度网盘中手动创建
   - 或创建自定义目录，并修改配置（见下一步）

3. **修改转存目录（可选）**
   - 如需修改默认转存目录，编辑 `utils.js`：
   ```javascript
   const DEFAULT_TARGET_PATH = '/你的/目标/目录';
   ```

4. **关闭浏览器窗口**
   - 登录和目录准备完成后，关闭浏览器窗口
   - 浏览器会保持在后台运行（调试模式）

**重要提示**：
- ✅ 仅登录百度网盘
- ❌ 不要登录微软账户
- ❌ 不要开启同步功能
- ⚠️ 转存目录必须已存在，否则转存会失败

### 4. 一键运行

```bash
# 自动抓取并转存所有新记录
npm start

# 仅抓取，不转存
npm start -- --dry-run

# 抓取前10部并转存
npm start -- --max-movies 10
```

## 使用方式

### 主流程

```bash
# 完整流程：启动浏览器 → 抓取 → 转存
npm start                      # 抓取并转存所有
npm start -- --dry-run         # 仅抓取，不转存
npm start -- --max-movies 10   # 抓取前10部并转存

# 仅抓取
npm run scrape                 # 抓取最新资源
npm run scrape -- --max-movies 10  # 抓取前10部
npm run scrape -- --loop       # 定时抓取（每24小时）

# 交互式转存（手动选择）
npm run transfer               # 显示列表，交互选择
npm run transfer -- --all      # 转存所有待处理
npm run transfer -- --ids 1,3,5  # 指定ID转存
```

### 辅助命令

```bash
npm run status              # 查看数据库状态
npm run auto-transfer       # 自动转存待处理记录
npm run migrate             # JSON数据迁移到数据库
npm run check-chrome        # 检查Chromium状态
```

## 项目结构

```
seedhub-monitor/
├── 核心文件（根目录）
│   ├── start.js               # 主入口（自动抓取+转存）
│   ├── scrape.js              # 抓取模块
│   ├── select-transfer.js     # 交互式转存
│   ├── baidu_transfer.js      # 百度网盘转存
│   ├── browser-manager.js     # 浏览器管理
│   ├── db.js                  # 数据库模块
│   └── utils.js               # 通用工具
│
├── scripts/                   # 辅助脚本
│   ├── start-chrome.js        # 启动便携版Chromium
│   ├── start-edge.js          # 启动Edge
│   ├── auto-transfer.js       # 自动转存
│   ├── download-chrome.js     # 下载Chromium
│   ├── check-chrome.js        # 检查Chromium
│   ├── status.js              # 查看状态
│   └── migrate-json-to-db.js  # 数据迁移
│
├── docs/                      # 文档
│   ├── DATABASE.md            # 数据库说明
│   ├── INCREMENTAL.md         # 增量更新说明
│   ├── PORTABLE_CHROME.md     # 便携版浏览器方案
│   └── EDGE_USAGE.md          # Edge使用指南
│
├── results/                   # 抓取结果（JSON备份）
├── chrome/                    # 便携版Chromium（自动下载）
├── chrome-profile/            # Chromium配置
└── edge-debug-profile/        # Edge配置
```

## 工作流程

```
npm start
    ↓
启动浏览器（便携版Chromium或Edge）
    ↓
scrape.js 抓取最新资源
    ↓
保存到数据库（增量更新）
    ├─ 新电影 → INSERT
    ├─ 已转存 → SKIP
    └─ 链接更新 → UPDATE
    ↓
auto-transfer.js 自动转存
    ↓
更新数据库状态
    ↓
完成
```

## 数据库

使用SQLite存储电影数据，支持：
- 增量更新（避免重复）
- 链接更新检测
- 转存状态管理
- 数据统计和搜索

详细说明：[数据库文档](docs/DATABASE.md)

## 配置

### 抓取配置（scrape.js）

```javascript
const TARGET_PAN = '百度';        // 目标网盘
const MAX_MOVIES = 20;           // 每次处理数量
const MAX_CHECK = 10;            // 每部电影检查的中转链接数
```

### 转存配置（utils.js）

默认转存目录：`/视听娱乐/SeedHub`

可在 `utils.js` 中修改：

```javascript
const DEFAULT_TARGET_PATH = '/你的/目标/目录';
```

## npm scripts

| 命令 | 功能 | 说明 |
|-----|------|------|
| `npm start` | 自动抓取并转存 | **主入口**，完整工作流 |
| `npm run scrape` | 仅抓取 | 原来的 `npm start` |
| `npm run transfer` | 交互式转存 | 手动选择转存 |
| `npm run auto-transfer` | 自动转存 | 转存待处理记录 |
| `npm run status` | 查看状态 | 数据库统计 |
| `npm run start-chrome` | 启动Chromium | 便携版浏览器 |
| `npm run start-edge` | 启动Edge | 系统浏览器 |
| `npm run download-chrome` | 下载Chromium | 自动下载最新版 |
| `npm run check-chrome` | 检查Chromium | 查看状态和版本 |

## 模块说明

### browser-manager.js

统一浏览器管理模块，提供：
- `startBrowser()` - 启动浏览器（优先便携版）
- `closeBrowser()` - 优雅关闭浏览器
- `closeBrowserGracefully()` - CDP Browser.close命令
- `killProcessOnPort()` - 强制关闭端口进程
- `isBrowserRunning()` - 检测运行状态
- `waitForPort()` - 等待端口就绪

### utils.js

通用工具模块，提供：
- `sleep()` - 延迟函数
- `isBrowserRunning()` - 检查浏览器状态
- `connectToBrowser()` - 连接浏览器
- `waitForPort()` - 等待端口就绪
- `CDP_PORT` - 调试端口常量
- `DEFAULT_TARGET_PATH` - 默认转存路径

## 注意事项

### 浏览器调试模式

- 便携版Chromium：独立配置，不影响系统浏览器
- Edge：独立用户数据目录，不影响正常Edge配置
- 不登录微软账户，不开启同步
- 详见：[Edge使用指南](docs/EDGE_USAGE.md)

### 增量更新

- 影片不存在 → 新增
- 已转存 → 跳过
- 未转存 + 链接相同 → 跳过
- 未转存 + 链接不同 → 更新

详细说明：[增量更新文档](docs/INCREMENTAL.md)

### 转存流程

1. 检查百度网盘登录状态
2. 打开分享链接
3. 输入提取码
4. 检查保存路径
5. 执行转存
6. 验证结果
7. 更新数据库

## 故障排查

### 浏览器连接失败

```bash
# 检查端口
netstat -ano | findstr ":9222"

# 重启调试模式
npm run start-chrome
```

### 数据库问题

```bash
# 查看状态
npm run status

# 重新迁移
npm run migrate
```

### 转存失败

- 检查百度网盘是否登录
- 检查目标目录是否存在
- 查看错误日志

### Chromium下载失败

```bash
# Windows系统可能遇到SSL证书吊销检查问题
# 脚本会自动使用备用版本

# 手动下载
# 访问：https://googlechromelabs.github.io/chrome-for-testing/
# 下载后解压到 chrome/ 目录
```

## 更新日志

### v1.1.0 (2026-05-09)

- ✅ 便携版Chromium自动下载
- ✅ 统一浏览器管理模块
- ✅ 统一工具函数模块
- ✅ npm start 实现完整流程
- ✅ 项目结构整理优化
- ✅ 消除重复代码
- ✅ API访问问题修复（SSL证书）

### v1.0.0 (2026-05-08)

- ✅ SQLite数据库集成
- ✅ 增量更新功能
- ✅ 交互式转存
- ✅ URL验证修复
- ✅ 提取码提交优化
- ✅ Edge独立配置

## License

MIT
