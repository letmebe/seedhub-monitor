# SQLite数据库集成说明

## 概述

本项目已完成SQLite数据库集成，用于管理SeedHub影视资源数据，支持增量更新和转存状态追踪。

## 技术选型

使用 **sql.js**（纯JavaScript实现的SQLite）而非better-sqlite3：
- ✅ 无需编译，无需Visual Studio
- ✅ 跨平台兼容性好
- ✅ 安装简单，开箱即用

## 数据库结构

### movies 表

```sql
CREATE TABLE movies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,              -- 电影标题
  url TEXT,                         -- 详情页URL
  pan_type TEXT,                    -- 网盘类型(百度/UC/夸克/天翼)
  pan_link TEXT,                    -- 网盘分享链接
  extract_code TEXT,                -- 提取码
  transferred INTEGER DEFAULT 0,    -- 是否已转存(0/1)
  transfer_time TEXT,               -- 转存时间
  transfer_path TEXT,               -- 转存路径
  created_at TEXT,                  -- 创建时间
  updated_at TEXT,                  -- 更新时间
  UNIQUE(title, pan_type)           -- 唯一约束
);
```

### 索引

- `idx_transferred` - 转存状态索引
- `idx_pan_type` - 网盘类型索引  
- `idx_created_at` - 创建时间索引

## 使用方法

### 1. 安装依赖

```bash
cd seedhub-monitor
npm install
```

### 2. 数据迁移

将现有JSON数据迁移到数据库：

```bash
npm run migrate
# 或
node migrate-json-to-db.js
```

### 3. 查看状态

```bash
node workflow.js --status
```

输出示例：
```
数据库状态:
  总记录: 156
  已转存: 23
  待转存: 133

待转存列表:
  1. 飞驰人生3 (百度)
  2. 巅峰猎杀 Apex (百度)
  ... 还有 123 部
```

### 4. 执行工作流

自动转存待处理的电影：

```bash
# 转存所有待处理电影(默认最多10部)
node auto-transfer.js

# 限制转存数量
node auto-transfer.js --limit 5

# 仅查看待转存列表(不执行)
node auto-transfer.js --dry-run

# 或使用npm脚本
npm run transfer
```

输出示例：
```
============================================================
SeedHub 自动转存
============================================================

📊 数据库状态:
   总记录: 156
   已转存: 23
   待转存: 133

📋 待转存列表 (10/133):
   1. 飞驰人生3 (百度)
   2. 巅峰猎杀 Apex (百度)
   ...

🚀 开始转存...

[1/10] 飞驰人生3
  网盘类型: 百度
  分享链接: https://pan.baidu.com/s/1xxx
  ✅ 转存成功
```

### 5. 数据库操作API

```javascript
const db = require('./db');

// 初始化(异步)
await db.initDatabase();

// 插入单条
db.insertMovie({
  title: '电影名称',
  url: 'https://...',
  panType: '百度',
  panLink: 'https://pan.baidu.com/s/...',
  extractCode: 'xxxx'
});

// 批量插入
db.insertMovies([...]);

// 查询未转存
const pending = db.getUntransferred(10);

// 标记已转存
db.markTransferred(movieId, '/目标路径');

// 统计信息
const stats = db.getStats();
// { total, transferred_count, pending_count }

// 搜索
const results = db.searchMovies('关键词');

// 关闭数据库
db.closeDatabase();
```

## 工作流程

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  scrape.js  │──────▶│   SQLite    │◀──────│ baidu_      │
│  抓取电影    │      │   数据库     │      │ transfer.js │
└─────────────┘      └─────────────┘      └─────────────┘
       │                     │                     │
       │  INSERT movies      │  SELECT untransferred│
       │  (transferred=0)    │  UPDATE transferred=1│
       └─────────────────────┴─────────────────────┘
```

## 数据文件

- **seedhub.db** - SQLite数据库文件（已加入.gitignore）
- 位置：`seedhub-monitor/seedhub.db`

## 性能参考

| 数据规模 | JSON方案 | SQLite方案 |
|---------|---------|-----------|
| 100条    | ~5KB, 即时 | ~20KB, 即时 |
| 1000条   | ~50KB, 较快 | ~50KB, 快 |
| 10000条  | ~500KB, 慢 | ~200KB, 快 |
| 查询速度 | O(n)遍历 | O(log n)索引 |

## 注意事项

1. **数据库文件**：`seedhub.db`存储在项目目录，已被.gitignore忽略
2. **并发安全**：sql.js为单进程设计，当前项目单进程运行无问题
3. **数据备份**：定期备份`seedhub.db`文件即可
4. **清理策略**：可使用`db.deleteOldMovies(90)`删除90天前的已转存数据

## 下一步计划

- [x] 修改scrape.js使用数据库存储
- [x] 创建auto-transfer.js实现自动转存
- [ ] 添加定时自动转存任务
- [ ] 添加Web界面查看数据

## 测试

测试脚本位于`temp/test-db.js`，验证：
- 数据库初始化
- 数据插入和查询
- 转存状态管理
- 数据统计功能
- 迁移脚本功能
