# SeedHub 影视资源监控系统

自动抓取SeedHub影视资源并支持交互式转存到百度网盘。

## 功能特性

- ✅ 自动抓取 SeedHub 电影资源
- ✅ 支持百度/UC/夸克/天翼网盘
- ✅ SQLite数据库增量存储
- ✅ 智能链接更新检测
- ✅ 交互式选择转存
- ✅ 百度网盘自动转存

## 快速开始

### 1. 安装依赖

```bash
cd seedhub-monitor
npm install
npm install -g agent-browser
```

### 2. 启动调试模式

```bash
node start-edge.js
```

首次使用需要在调试窗口登录百度网盘。

**重要提示**：
- ✅ 仅登录百度网盘
- ❌ 不要登录微软账户
- ❌ 不要开启同步功能
- 详见：[Edge使用指南](docs/EDGE_USAGE_GUIDE.md)

### 3. 抓取电影

```bash
npm start
```

### 4. 选择转存

```bash
npm run transfer
```

## 使用方式

### 抓取命令

```bash
# 单次抓取（默认20部）
npm start

# 指定数量
node scrape.js --max-movies 10

# 定时抓取（每24小时）
node scrape.js --loop
```

### 转存命令

```bash
# 交互式转存（推荐）
npm run transfer

# 指定ID转存
node select-transfer.js --ids 1,3,5

# 全部转存
node select-transfer.js --all

# 查看状态
npm run status
```

### 数据迁移

```bash
# 从JSON迁移到数据库
npm run migrate
```

## 项目结构

```
seedhub-monitor/
├── scrape.js              # 抓取模块
├── baidu_transfer.js      # 转存模块
├── db.js                  # 数据库模块
├── select-transfer.js     # 交互式转存
├── start-edge.js          # Edge启动
├── package.json           # 依赖管理
│
├── docs/                  # 文档目录
│   ├── DATABASE.md        # 数据库说明
│   ├── INCREMENTAL.md     # 增量更新说明
│   └── EDGE_USAGE.md      # Edge使用指南
│
├── results/               # 抓取结果（JSON）
├── logs/                  # 运行日志
└── edge-debug-profile/    # Edge调试配置
```

## 工作流程

```
抓取(scrape.js)
    ↓
保存到数据库
    ↓
增量更新检测
    ├─ 新电影 → INSERT
    ├─ 已转存 → SKIP
    └─ 链接更新 → UPDATE
    ↓
交互式转存(select-transfer.js)
    ↓
选择电影 → 确认 → 执行转存
    ↓
更新数据库状态
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

### 转存配置

默认转存目录：`/视听娱乐/SeedHub`

可在 `select-transfer.js` 和 `auto-transfer.js` 中修改：

```javascript
const DEFAULT_TARGET_PATH = '/你的/目标/目录';
```

## npm scripts

| 命令 | 功能 |
|-----|------|
| `npm start` | 抓取电影 |
| `npm run transfer` | 交互式转存 |
| `npm run auto-transfer` | 自动转存 |
| `npm run status` | 查看数据库状态 |
| `npm run migrate` | 数据迁移 |

## 注意事项

### Edge调试模式

- 使用独立用户数据目录
- 不影响正常Edge配置
- 不登录微软账户，不开启同步
- 详见：[Edge使用指南](docs/EDGE_USAGE_GUIDE.md)

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
node start-edge.js
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

## 开发

### 测试

```bash
node test_transfer_fixed.js
```

### 日志

日志文件：`logs/schedule.log`

## 更新日志

### v1.0.0 (2026-05-08)

- ✅ SQLite数据库集成
- ✅ 增量更新功能
- ✅ 交互式转存
- ✅ URL验证修复
- ✅ 提取码提交优化
- ✅ Edge独立配置

## License

MIT
