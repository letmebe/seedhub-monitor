# 发布指南

## 发布方式

本项目采用 **Git仓库分发**，适合开发者使用。

---

## 发布准备

### 1. 完善package.json

已配置：
- ✅ 项目元信息
- ✅ 依赖声明
- ✅ npm scripts
- ✅ 引擎要求（Node.js >= 14.0.0）

### 2. 更新README.md

确保包含：
- ✅ 项目介绍
- ✅ 安装步骤
- ✅ 使用方法
- ✅ 配置说明
- ✅ 故障排查

### 3. 检查.gitignore

已配置忽略：
- ✅ node_modules/
- ✅ edge-debug-profile/
- ✅ results/
- ✅ logs/
- ✅ *.db
- ✅ temp/

---

## 发布到GitHub

### 步骤1：创建GitHub仓库

```bash
# 在GitHub上创建新仓库
# 仓库名：seedhub-monitor
# 描述：SeedHub影视资源自动抓取和百度网盘转存工具
```

### 步骤2：推送代码

```bash
# 添加远程仓库
git remote add origin https://github.com/[用户名]/seedhub-monitor.git

# 推送代码
git push -u origin master

# 或推送所有分支
git push --all origin
```

### 步骤3：创建Release

```bash
# 创建标签
git tag -a v1.0.0 -m "Release v1.0.0"

# 推送标签
git push origin v1.0.0
```

在GitHub上：
1. 进入仓库 → Releases
2. Draft a new release
3. 选择标签 v1.0.0
4. 填写Release说明
5. Publish release

---

## 用户安装方式

### 方式1：克隆仓库（推荐）

```bash
# 克隆仓库
git clone https://github.com/[用户名]/seedhub-monitor.git

# 进入目录
cd seedhub-monitor

# 安装依赖
npm install

# 安装全局依赖
npm install -g agent-browser

# 启动
node start-edge.js
npm start
```

### 方式2：下载Release

```bash
# 从GitHub Releases下载zip
# 解压后：
cd seedhub-monitor
npm install
npm install -g agent-browser
node start-edge.js
npm start
```

---

## 发布检查清单

### 发布前检查

- [ ] 所有功能已测试
- [ ] 代码已提交
- [ ] README.md已更新
- [ ] package.json版本号已更新
- [ ] .gitignore配置正确
- [ ] 无敏感信息（密码、密钥等）

### 文件检查

- [ ] README.md - 完整使用说明
- [ ] package.json - 依赖正确
- [ ] .gitignore - 忽略配置正确
- [ ] docs/ - 文档完整

### 功能检查

- [ ] 抓取功能正常
- [ ] 转存功能正常
- [ ] 数据库功能正常
- [ ] Edge启动正常

---

## 版本发布说明

### v1.0.0

**功能**：
- ✅ SeedHub资源自动抓取
- ✅ 百度网盘自动转存
- ✅ SQLite数据库存储
- ✅ 增量更新检测
- ✅ 交互式选择转存
- ✅ Edge独立配置

**系统要求**：
- Node.js >= 14.0.0
- Microsoft Edge浏览器
- Windows 10/11

**依赖**：
- sql.js ^1.10.2
- agent-browser（全局）

---

## 发布后续

### 更新文档

1. 更新GitHub仓库描述
2. 添加Topics标签
3. 创建Wiki（可选）

### 维护

1. 处理Issues
2. 合并Pull Requests
3. 发布新版本

---

## 其他发布方式（可选）

### npm发布（不推荐）

```bash
# 登录npm
npm login

# 发布
npm publish
```

**注意**：本项目依赖Edge浏览器，不适合直接npm发布。

### Docker（可选）

创建Dockerfile：

```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "start-edge.js"]
```

**注意**：Edge调试模式配置复杂，不推荐容器化。

---

## 分发建议

### 适合人群

**开发者**：
- ✅ Git克隆
- ✅ 自己配置环境
- ✅ 可修改源码

**非开发者**：
- ❌ 需要基础命令行知识
- ❌ 需要配置Node.js环境
- ❌ 需要配置Edge调试模式

### 建议

对于非开发者用户，建议：
1. 提供详细安装文档
2. 提供视频教程
3. 考虑提供打包版本（使用pkg或nexe）

---

## 发布地址

推荐发布到：
- ✅ GitHub（主仓库）
- ✅ Gitee（国内镜像）
- ✅ GitLab（可选）

---

## 总结

**推荐发布流程**：

```
1. 完善代码和文档
    ↓
2. 推送到GitHub
    ↓
3. 创建Release v1.0.0
    ↓
4. 更新仓库描述和Topics
    ↓
5. 用户通过Git克隆使用
```

**用户使用流程**：

```
git clone → npm install → 配置Edge → 使用
```

**简单、直接、适合开发者！**
