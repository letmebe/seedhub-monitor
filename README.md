# SeedHub 监控项目 - 技术总结

## 项目概述
自动抓取 SeedHub 影视资源并更新到仓库。

## 环境配置
- **系统**: Windows 10/11
- **浏览器**: Microsoft Edge（远程调试模式）
- **Node.js**: v17.4.0
- **agent-browser**: CDP 控制工具

## 关键问题与解决

### 问题 1: agent-browser 在 Windows 下的引号转义
**现象**: `cdpEval` 执行 JS 代码时返回 `null` 或解析错误

**原因**: 
- Windows `cmd.exe` 对引号处理与 bash 不同
- 多行 JS 代码中的换行符导致命令行解析错误
- 双引号嵌套需要多层转义

**解决方案**:
```javascript
// ❌ 错误：多行 + 双引号（Windows 下失败）
const jsCode = `
  Array.from(document.querySelectorAll(".content a[href*="/movies/"]"))
    .filter(a => a.querySelector('img'))
`;
const escaped = jsCode.replace(/"/g, '\\"');
// 结果：换行符导致语法错误

// ✅ 正确：单行 + 单引号
const jsCode = "Array.from(document.querySelectorAll('.content a[href*=\"/movies/\"]')).filter(a=>a.querySelector('img')).map(a=>({title:a.querySelector('img')?.alt}))";
```

**关键规则**:
1. JS 代码必须写成单行（无换行符）
2. JS 代码内部使用单引号 `'`
3. 外层用双引号包裹整个 JS 代码
4. 如果 JS 代码中必须使用双引号，用 `\"` 转义

### 问题 2: 中转页解析
**现象**: 能获取中转链接，但无法提取实际的网盘链接

**原因**:
- 中转页 `https://www.seedhub.cc/link_start/?redirect_to=pan_id_xxx` 是通过 JavaScript 动态生成的
- `document.querySelector('a[href*="pan.baidu"]')` 无法找到元素（因为链接不在 DOM 中）

**解决方案**:
从中转页 HTML 源码中提取 `var panLink` 变量：
```javascript
const html = cdpEval("document.documentElement.outerHTML");
const matchLink = html.match(/var panLink\s*=\s*["']([^"']+)["']/);
if (matchLink) {
  const panLink = matchLink[1];  // 例如: "https://drive.uc.cn/s/39375245d1a64"
}
```

### 问题 3: 网盘类型识别
**发现**: SeedHub 提供多种网盘链接：
- 百度网盘：`pan.baidu.com`
- UC 网盘：`drive.uc.cn`
- 夸克网盘：`pan.quark.cn`
- 迅雷网盘：`pan.xunlei.com`

**当前支持**: 通用提取 `var panLink` 变量，不区分网盘类型

## 文件结构
```
seedhub-monitor/
├── scrape.js          # 主抓取脚本
├── schedule.bat       # 定时任务脚本
├── start-browser.bat # 启动 Edge 调试模式
├── package.json      # 项目配置
└── results/         # 抓取结果目录
    └── YYYY-MM-DD.json
```

## 使用方法

### 开发模式
```bash
# 1. 启动 Edge 调试模式
cd "C:\Users\yinwe\WorkBuddy\2026-05-06-task-1\seedhub-monitor"
.\start-browser.bat

# 2. 运行抓取脚本
node scrape.js
```

### 定时模式
```bash
# 运行 schedule.bat（每小时执行一次）
.\schedule.bat
```

## 输出格式
```json
{
  "timestamp": "2026-05-06T17:18:55.191Z",
  "movies": [
    {
      "title": "飞驰人生3",
      "url": "https://www.seedhub.cc/movies/134742/",
      "baiduLink": "https://drive.uc.cn/s/39375245d1a64",
      "extractCode": ""
    }
  ]
}
```

## 注意事项
1. **Edge 调试端口**: 必须先启动 Edge 远程调试（`--remote-debugging-port=9222`）
2. **网盘链接有效期**: 中转链接 `redirect_to=pan_id_xxx` 可能是一次性的
3. **提取码**: UC 网盘通常无提取码，百度网盘可能有 `?pwd=xxx` 参数
4. **反爬虫**: SeedHub 可能有访问频率限制，建议间隔 ≥ 3 秒

## 待优化
- [ ] 支持更多网盘类型（阿里云盘、天翼云盘等）
- [ ] 自动发送到 Telegram/邮件通知
- [ ] 增量更新（只抓取新电影）
- [ ] 错误重试机制
