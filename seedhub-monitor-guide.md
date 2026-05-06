# SeedHub 影视资源监控系统

## 功能说明

监控 SeedHub 网站电影分类页，自动抓取指定网盘的资源链接（支持百度/UC/夸克/天翼）。

## 环境要求

- Microsoft Edge 浏览器
- Node.js 环境
- agent-browser 工具：`npm install -g agent-browser`

## 快速开始

### 方式一：使用脚本自动启动（推荐）

```bash
# 直接运行，脚本会自动检测/启动 Edge 调试模式
node scrape.js

# 或启用定时模式
node scrape.js --loop
```

### 方式二：手动启动 Edge 远程调试

```powershell
# 关闭所有现有 Edge 进程
taskkill /F /IM msedge.exe

# 启动 Edge 调试模式
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --no-first-run --no-default-browser-check
```

然后在另一个终端运行脚本：

```bash
node scrape.js
```

## 配置说明

### 脚本配置项（scrape.js 第 25-31 行）

```javascript
const CDP_PORT = 9222;              // CDP 调试端口
const TARGET_URL = 'https://www.seedhub.cc/categories/1/movies/';  // 目标网址
const TARGET_PAN = '百度';           // 目标网盘（百度/UC/夸克/天翼/全部）
const INTERVAL_HOURS = 24;          // 抓取间隔（小时），0 = 只运行一次
const MAX_CHECK = 10;               // 每个电影最多检查几个中转链接
const MAX_MOVIES = 20;              // 每次最多处理几部电影
```

### 命令行参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `--loop` | 定时运行模式（间隔由 INTERVAL_HOURS 决定） | `node scrape.js --loop` |
| `--max-movies N` | 覆盖 MAX_MOVIES 配置，处理前 N 部 | `node scrape.js --max-movies 10` |

### 使用场景示例

```bash
# 运行一次，处理前 20 部（默认值）
node scrape.js

# 运行一次，只处理前 10 部
node scrape.js --max-movies 10

# 定时运行，每 24 小时处理 20 部
node scrape.js --loop

# 定时运行，每 24 小时处理 5 部
node scrape.js --loop --max-movies 5
```

## 抓取流程

### Step 1: 打开电影分类页

```javascript
// 打开分类页
window.location.href = "https://www.seedhub.cc/categories/1/movies/"
```

### Step 2: 获取电影列表

```javascript
// 获取电影列表（带缩略图和标题）
const movies = Array.from(document.querySelectorAll('.content a[href*="/movies/"]'))
  .filter(a => a.querySelector('img'))
  .map(a => ({
    title: a.querySelector('img')?.alt || a.textContent.trim().substring(0, 30),
    url: a.href
  }));
JSON.stringify(movies)
```

### Step 3: 点击网盘标签

```javascript
// 点击指定网盘标签（如"百度"）
const targetPan = '百度';
const tab = Array.from(document.querySelectorAll('a')).find(a => 
  a.textContent.trim().includes(targetPan)
);
tab?.click();
```

**注意**：同一网盘标签下可能混合多种网盘资源，需要遍历识别。

### Step 4: 获取中转链接列表

```javascript
// 获取前 N 个中转链接（pan_id）
const transitLinks = Array.from(document.querySelectorAll('a[href*="redirect_to=pan_id"]'))
  .slice(0, 10)
  .map(a => a.href);
JSON.stringify(transitLinks)
```

### Step 5: 解析实际网盘链接

```javascript
// 中转页中，实际网盘链接在 JavaScript 变量中
// 查找 var panLink = "..."
const html = document.documentElement.outerHTML;
const match = html.match(/var panLink\s*=\s*["']([^"']+)["']/);
const panLink = match ? match[1] : null;

// 提取提取码（如果有）
const extractCode = panLink.match(/[?&]pwd=([^&"'\s]+)/i)?.[1] || '';

JSON.stringify({ panLink, extractCode })
```

## 关键发现

### 1. 中转链接格式

```
https://www.seedhub.cc/link_start/?redirect_to=pan_id_XXXXX
```

### 2. 实际网盘链接解析

实际网盘链接存储在页面 JavaScript 的 `panLink` 变量中：

```javascript
var panLink = "https://pan.baidu.com/s/xxxxx?pwd=xxxx";
```

### 3. 提取码获取

- 从 `panLink` URL 中提取（`?pwd=xxxx`）
- 格式：`https://pan.baidu.com/s/xxx?pwd=ojmk`

### 4. 网盘类型识别

通过 `panLink` 域名判断：

| 域名 | 网盘类型 |
|------|----------|
| `pan.baidu.com` | 百度 |
| `drive.uc.cn` | UC |
| `pan.quark.cn` | 夸克 |
| `cloud.189.cn` | 天翼 |

### 5. 混合资源问题

**重要**：同一网盘标签下可能混合多种网盘资源。

例如："百度"标签下的 59 个资源可能包含：
- 百度网盘
- UC 网盘
- 其他网盘

**解决方案**：遍历前 `MAX_CHECK` 个中转链接，逐个检查 `panLink` 是否包含目标网盘域名。

## 输出结果

### 结果文件

```
results/YYYY-MM-DD.json
```

### 结果格式

```json
{
  "timestamp": "2026-05-06T18:30:00.000Z",
  "movies": [
    {
      "title": "飞驰人生3",
      "url": "https://www.seedhub.cc/movies/12345",
      "panType": "百度",
      "panLink": "https://pan.baidu.com/s/1NiQJW0DJBw8FR_Y1_k8Yig?pwd=ojmk",
      "extractCode": "ojmk"
    }
  ]
}
```

## 注意事项

1. **Cloudflare 保护**：直接 curl 请求会被拦截，必须使用真实浏览器环境（CDP 模式）
2. **资源动态加载**：需要等待 JavaScript 执行完毕后才能获取完整数据（建议延迟 3-5 秒）
3. **链接时效性**：网盘链接可能失效，建议及时保存
4. **混合资源**：同一网盘标签下可能混合多种网盘，需要遍历识别
5. **Edge 调试端口**：确保 9222 端口未被占用

## 文件结构

```
seedhub-monitor/
├── scrape.js            # 抓取脚本（核心）
├── start-browser.bat   # 手动启动 Edge 调试模式的备用脚本
├── schedule.bat        # Windows 任务计划程序定时脚本（备用）
├── results/            # 抓取结果
│   └── YYYY-MM-DD.json
└── logs/               # 运行日志（schedule.bat 使用）
```

## 高级用法

### 修改目标网盘

编辑 `scrape.js` 第 28 行：

```javascript
const TARGET_PAN = 'UC';  // 改为 UC 网盘
```

支持值：`百度` / `UC` / `夸克` / `天翼` / `全部`

### 修改定时间隔

编辑 `scrape.js` 第 29 行：

```javascript
const INTERVAL_HOURS = 12;  // 每 12 小时运行一次
```

### 使用 Windows 任务计划程序（备用方案）

如果希望使用系统级定时任务（而非脚本内定时），可以配置 `schedule.bat`：

1. 打开 Windows 任务计划程序
2. 创建基本任务
3. 触发器：每天（或自定义间隔）
4. 操作：启动程序
5. 程序/脚本：`C:\Users\yinwe\WorkBuddy\2026-05-06-task-1\seedhub-monitor\schedule.bat`

## 故障排查

### 问题 1：Edge 无法启动调试模式

**检查**：
```bash
netstat -ano | findstr ":9222"
```

**解决**：
```bash
taskkill /F /IM msedge.exe
timeout /t 2 /nobreak
# 然后重新运行脚本
```

### 问题 2：获取不到电影列表

**原因**：页面未加载完成

**解决**：增加延迟时间（第 125 行）
```javascript
await delay(5000);  // 改为 5 秒
```

### 问题 3：找不到百度网盘链接

**原因**：该电影下没有百度网盘资源

**解决**：脚本会自动遍历前 `MAX_CHECK` 个中转链接，如果都找不到会跳过

### 问题 4：agent-browser 命令找不到

**检查**：
```bash
npm list -g agent-browser
```

**解决**：
```bash
npm install -g agent-browser
```

## 更新日志

- **2026-05-07**：新增 `MAX_MOVIES` 配置项和 `--max-movies` 命令行参数
- **2026-05-06**：修复混合网盘资源问题，实现遍历查找算法
- **2026-05-06**：集成 Edge 浏览器自动启动功能
- **2026-05-06**：实现内嵌定时任务（不依赖 Windows 任务计划程序）
