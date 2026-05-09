# SeedHub 影视资源监控系统

自动抓取SeedHub影视资源并支持交互式转存到百度网盘。

## 项目结构

这是CodeArts工作目录，项目代码位于 `seedhub-monitor/` 子目录。

```
.
├── seedhub-monitor/      # 项目主代码
│   ├── scrape.js         # 抓取模块
│   ├── select-transfer.js # 交互式转存
│   ├── browser-manager.js # 浏览器管理
│   ├── db.js             # 数据库模块
│   └── ...
├── .gitignore
└── README.md             # 本文件
```

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/letmebe/seedhub-monitor.git
cd seedhub-monitor/seedhub-monitor

# 安装依赖
npm install
npm install -g agent-browser

# 下载便携版浏览器
npm run download-chrome

# 启动浏览器并登录百度网盘
npm run start-chrome

# 一键运行（抓取+转存）
npm start
```

## 详细文档

请查看 [seedhub-monitor/README.md](./seedhub-monitor/README.md) 获取完整使用说明。

## 功能特性

- ✅ 自动抓取 SeedHub 电影资源
- ✅ SQLite数据库增量存储
- ✅ 交互式选择转存
- ✅ 百度网盘自动转存
- ✅ 便携版Chromium支持

## License

MIT
