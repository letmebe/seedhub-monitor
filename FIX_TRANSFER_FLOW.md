# 百度网盘转存功能修复说明（2026-05-08）

## 问题描述

之前的实现存在流程错误，导致转存功能无法正常工作。

### 原错误流程
```
Step 1: 打开分享链接
Step 2: 处理提取码
Step 3: ❌ 总是打开目录选择对话框
Step 4: ❌ 点击"保存到网盘"按钮
Step 5: 等待保存结果
```

**问题**：
1. 无论当前路径是否匹配，都打开目录树（不必要的操作）
2. 点击目录树的"确定"后，又尝试点击"保存到网盘"（实际上"确定"已自动触发保存）

---

## 修复后的正确流程

```
Step 1: 打开分享链接
        ↓
Step 2: 处理提取码（如果需要）
        ↓
Step 3: ✅ 检查 .save-path 的当前路径
        ↓
    ┌─── 路径匹配？ ───┐
    │                 │
   YES               NO
    │                 │
    ↓                 ↓
直接点击          点击 .bottom-save-path
"保存到网盘"       打开目录树对话框
    │                 │
    │                 ↓
    │            在树中选择目标路径
    │                 │
    │                 ↓
    │            点击"确定"（自动保存）
    │                 │
    └────────┬────────┘
             ↓
Step 4: 等待保存结果对话框
        ↓
Step 5: ✅ 验证 .info-section-more-btn 的路径
```

---

## 关键修改点

### 1. 路径检查逻辑（Step 3）

**修改前**：
```javascript
// ❌ 总是打开目录选择对话框
const dialogOpened = openDirectoryDialog();
await handleDirectoryDialog(targetPath);
```

**修改后**：
```javascript
// ✅ 先检查当前路径
const currentSavePath = getCurrentSavePath();
const pathMatches = isPathMatch(currentSavePath, targetPath);

if (pathMatches) {
  // 路径匹配，直接保存
  clickSaveToDiskBtn();
} else {
  // 路径不匹配，打开目录树选择
  openDirectoryDialog();
  await handleDirectoryDialog(targetPath);
  // 注意：点击"确定"后会自动触发保存，无需再点"保存到网盘"
}
```

### 2. 路径匹配函数优化

**新增功能**：
- 支持更灵活的路径格式（"全部文件"、"我的网盘"等前缀）
- 使用后向匹配（suffix match）避免前缀干扰
- 添加调试日志便于排查问题

**示例**：
```javascript
// 归一化示例
normalizePath("全部文件-我的网盘-视听娱乐-SeedHub") 
  → "视听娱乐-SeedHub"

normalizePath("/视听娱乐/SeedHub") 
  → "视听娱乐-SeedHub"

// 匹配示例
isPathMatch("全部文件-我的网盘-视听娱乐-SeedHub", "/视听娱乐/SeedHub")
  → true  ✅

isPathMatch("全部文件-我的网盘-自动化-电影", "/视听娱乐/SeedHub")
  → false ❌
```

### 3. 步骤编号调整

由于合并了部分步骤，步骤编号从 5 步调整为：
- Step 1: 打开分享链接
- Step 2: 处理提取码
- Step 3: 检查路径并决定操作（分支逻辑）
- Step 4: 等待保存结果
- Step 5: 验证保存路径

---

## 关键技术点

### 1. 当前路径获取

```javascript
function getCurrentSavePath() {
  return cdpEval(`
    (function() {
      var el = document.querySelector('.save-path');
      return el ? el.textContent.trim() : null;
    })()
  `);
}
```

**注意**：`.save-path` 显示的是**上次保存的路径**，不是当前选中的路径。

### 2. 目录选择对话框

```javascript
function openDirectoryDialog() {
  return cdpEval(`
    (function() {
      var el = document.querySelector('.bottom-save-path');
      if (!el) return false;
      el.click();
      return true;
    })()
  `);
}
```

点击 `.bottom-save-path` 后会弹出 `.dialog-fileTreeDialog` 对话框。

### 3. 保存按钮

```javascript
function clickSaveToDiskBtn() {
  return cdpEval(`
    (function() {
      var btns = document.querySelectorAll('.g-button-right');
      for (var i = 0; i < btns.length; i++) {
        var txt = btns[i].textContent.trim();
        if (txt.indexOf('保存到网盘') !== -1 || 
            txt.indexOf('保存到我的百度网盘') !== -1) {
          btns[i].click();
          return { success: true, text: txt };
        }
      }
      return { success: false };
    })()
  `);
}
```

**重要**：按钮文字是"保存到网盘"或"保存到我的百度网盘"，**不是**"转存"。

### 4. 保存结果验证

```javascript
function getSuccessPath() {
  return cdpEval(`
    (function() {
      var dialog = document.querySelector('.after-trans-dialog');
      if (!dialog) return null;
      var btn = dialog.querySelector('.info-section-more-btn');
      return btn ? btn.textContent.trim() : null;
    })()
  `);
}
```

**关键验证**：`.info-section-more-btn` 的文本必须与目标路径后向匹配。

---

## 测试方法

### 方式一：使用测试脚本

```bash
node test_transfer_fixed.js
```

测试脚本会：
1. 自动打开指定的分享链接
2. 执行完整的转存流程
3. 输出详细的日志信息
4. 返回成功/失败结果

### 方式二：手动测试

1. **准备环境**：
   ```bash
   # 启动 Edge 调试模式
   node start-edge.js
   
   # 或手动启动
   start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222
   ```

2. **登录百度网盘**：
   - 在 Edge 中访问 https://pan.baidu.com
   - 确保已登录

3. **运行转存脚本**：
   ```bash
   node baidu_transfer.js "https://pan.baidu.com/s/xxx?pwd=xxx" "提取码" "/目标/路径"
   ```

4. **观察日志**：
   - 查看路径匹配结果
   - 确认是否打开了目录树
   - 检查保存结果对话框

---

## 常见问题

### Q1: 为什么有时打开目录树，有时直接保存？

**A**: 这取决于 `.save-path` 显示的当前路径是否与目标路径匹配。
- 如果匹配 → 直接保存（更快）
- 如果不匹配 → 打开目录树选择路径

### Q2: 点击目录树的"确定"后，还需要点击"保存到网盘"吗？

**A**: **不需要**！点击"确定"后会自动触发保存，页面会直接弹出成功对话框。

### Q3: 如何确认保存到了正确的路径？

**A**: 检查 `.after-trans-dialog` 对话框中的 `.info-section-more-btn` 按钮文本，它应该包含目标路径的后缀。

例如：
- 目标路径：`/视听娱乐/SeedHub`
- 实际路径：`全部文件-我的网盘-视听娱乐-SeedHub`
- 归一化后：`视听娱乐-SeedHub` vs `视听娱乐-SeedHub`
- 结果：✅ 匹配

### Q4: 路径匹配失败怎么办？

**A**: 检查以下几点：
1. 目标文件夹是否已创建
2. 路径分隔符是否正确（使用 `/` 或 `\`）
3. 查看日志中的 `[路径匹配]` 输出，确认归一化后的路径
4. 手动在浏览器中检查 `.save-path` 和 `.info-section-more-btn` 的文本

---

## 修改文件清单

| 文件 | 修改内容 |
|-----|---------|
| `baidu_transfer.js` | 修复转存流程，优化路径匹配函数 |
| `test_transfer_fixed.js` | 新增测试脚本 |

---

## 下一步计划

1. ✅ 修复转存流程（已完成）
2. ⏳ 测试验证（待执行）
3. ⏳ 集成到 scrape.js（第二阶段）
4. ⏳ 清理临时文件
5. ⏳ 更新文档

---

## 参考资源

- [工作日志 2026-05-08](../.workbuddy/memory/2026-05-08.md)
- [fix_save_path_v28.js](./fix_save_path_v28.js) - 成功的测试版本
- [seedhub-monitor-guide.md](./seedhub-monitor-guide.md) - 完整使用文档
