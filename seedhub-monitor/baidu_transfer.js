#!/usr/bin/env node
/**
 * baidu_transfer.js - 百度网盘转存核心模块
 *
 * 使用方式：
 *   const { transferBaiduShare } = require('./baidu_transfer');
 *   await transferBaiduShare('https://pan.baidu.com/s/1xxx', 'abcd', '/视听娱乐/电影');
 *
 * 独立运行（命令行测试）：
 *   node baidu_transfer.js <shareUrl> [extractCode] [targetPath]
 */

const { execFileSync } = require('child_process');

// ============ 配置 ============
const CDP_PORT = 9222;
const AGENT_JS = `${process.env.APPDATA}\\npm\\node_modules\\agent-browser\\bin\\agent-browser.js`;

// execFileSync 调用 agent-browser 时的公共 env（清除 NODE_OPTIONS 避免 --use-system-ca 冲突）
const CLEAN_ENV = Object.assign({}, process.env, { NODE_OPTIONS: '' });

// ============ 基础工具函数 ============

/**
 * 调用 agent-browser 子命令（tab / open / eval 等）
 * 全部使用 execFileSync 避免 shell 转义问题
 * env 中清除 NODE_OPTIONS 避免 "--use-system-ca is not allowed" 错误
 */
function runAgent(...args) {
  try {
    return execFileSync('node', [AGENT_JS, '--cdp', String(CDP_PORT), ...args], {
      encoding: 'utf8',
      timeout: 30000,
      env: CLEAN_ENV
    });
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString().trim() : '';
    const msg = e.message || '';
    console.error(`  [agent] ${args.join(' ')} 失败: ${(stderr || msg).substring(0, 300)}`);
    return null;
  }
}

/**
 * 在浏览器中执行 JS 代码，返回结果
 */
function cdpEval(jsCode) {
  const result = runAgent('eval', jsCode);
  if (result === null) return null;
  const trimmed = result.trim();
  try { return JSON.parse(trimmed); }
  catch {
    const match = trimmed.match(/^(\[[\s\S]*\]|\{[\s\S]*\}|null|true|false|-?\d+(\.\d+)?)$/m);
    if (match) return JSON.parse(match[0]);
  }
  return trimmed;
}

/**
 * 列出所有标签页，返回解析后的数组 [{id, title, url, active}]
 */
function listTabs() {
  const output = runAgent('tab');
  if (!output) return [];
  const tabs = [];
  const lines = output.split('\n');
  for (const line of lines) {
    // 格式: "  [t5]  - " 或 "→ [t8] Title - URL" 或 "  [t7] Title - URL"
    const match = line.match(/(→?\s*)\[([^\]]+)\]\s+(.*?)(?:\s*-\s*(https?:\/\/\S*))?\s*$/);
    if (match) {
      tabs.push({
        active: match[1].trim() === '→',
        id: match[2].trim(),
        title: (match[3] || '').trim(),
        url: (match[4] || '').trim()
      });
    }
  }
  return tabs;
}

/**
 * 切换到指定标签页
 */
function switchTab(tabId) {
  return runAgent('tab', tabId) !== null;
}

/**
 * 在新标签页中打开 URL（自动切换到新标签页）
 */
function openNewTab(url) {
  return runAgent('tab', 'new', url) !== null;
}

/**
 * 在当前标签页中导航到 URL
 */
function openPage(url) {
  return runAgent('open', url) !== null;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ============ 等待工具 ============

async function waitForElement(selector, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const exists = cdpEval(`!!document.querySelector('${selector}')`);
    if (exists) return true;
    await delay(500);
  }
  return false;
}

async function waitForText(textList, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const body = cdpEval(`document.body ? document.body.innerText : ''`) || '';
    for (const t of textList) {
      if (body.includes(t)) return t;
    }
    await delay(500);
  }
  return null;
}

// ============ 交互工具 ============

function clickByText(textPatterns, tagNames = ['a', 'button', 'span', 'div']) {
  const patterns = JSON.stringify(textPatterns);
  const tags = JSON.stringify(tagNames);
  return cdpEval(`
    (function() {
      var patterns = ${patterns};
      var tags = ${tags};
      var elements = Array.from(document.querySelectorAll(tags.join(',')));
      for (var i = 0; i < patterns.length; i++) {
        for (var j = 0; j < elements.length; j++) {
          if (elements[j].textContent.trim().indexOf(patterns[i]) !== -1) {
            elements[j].click();
            return { success: true, text: elements[j].textContent.trim().substring(0, 40) };
          }
        }
      }
      return { success: false };
    })()
  `);
}

function setInputValue(selector, value) {
  const escapedValue = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return cdpEval(`
    (function() {
      var input = document.querySelector('${selector}');
      if (!input) return false;
      var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, "${escapedValue}");
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()
  `);
}

// ============ 树形目录选择 ============

function clickTreeNode(name, dblClick) {
  const nameEscaped = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return cdpEval(`
    (function() {
      var name = "${nameEscaped}";
      var nodes = document.querySelectorAll('.treeview-node');
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var txtEl = node.querySelector('.treeview-txt');
        if (txtEl && txtEl.textContent.trim() === name) {
          if (${dblClick ? 'true' : 'false'}) {
            node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
          } else {
            node.click();
          }
          return { clicked: true };
        }
      }
      return null;
    })()
  `);
}

function expandTreeNode(name) {
  const nameEscaped = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return cdpEval(`
    (function() {
      var name = "${nameEscaped}";
      var nodes = document.querySelectorAll('.treeview-node');
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var txtEl = node.querySelector('.treeview-txt');
        if (txtEl && txtEl.textContent.trim() === name) {
          var em = node.querySelector('.plus.icon-operate');
          if (em) { em.click(); return true; }
          return false;
        }
      }
      return false;
    })()
  `);
}

function clickFooterButton(nodeType) {
  return cdpEval(`
    (function() {
      var btn = document.querySelector('a[node-type="${nodeType}"]');
      if (btn) { btn.click(); return true; }
      return false;
    })()
  `);
}

function clickFooterButtonByText(btnText) {
  const textEscaped = btnText.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return cdpEval(`
    (function() {
      var footer = document.querySelector('.dialog-footer');
      if (!footer) return false;
      var links = footer.querySelectorAll('a');
      for (var i = 0; i < links.length; i++) {
        if (links[i].textContent.trim() === "${textEscaped}") {
          links[i].click();
          return true;
        }
      }
      return false;
    })()
  `);
}

// ============ 目录导航 ============

async function handleDirectoryDialog(targetPath) {
  console.log(`  📂 目标路径: ${targetPath}`);
  await waitForElement('.dialog-fileTreeDialog', 5000);
  await delay(800);

  const pathParts = targetPath.split('/').filter(p => p.trim());
  if (pathParts.length === 0) {
    console.log('  使用根目录，直接确认');
    await delay(500);
    clickFooterButton('confirm');
    await delay(2000);
    return { success: true };
  }

  // 策略：先逐级展开父目录，最后点击目标目录
  for (let i = 0; i < pathParts.length; i++) {
    const dirName = pathParts[i];
    const isLast = (i === pathParts.length - 1);
    
    console.log(`  📁 ${isLast ? '选择' : '展开'}目录: ${dirName}`);
    await delay(1000);

    if (!isLast) {
      // 对于非最后一级，尝试展开该目录
      const expanded = expandTreeNode(dirName);
      if (expanded) {
        console.log(`    ⬇️ 已展开 "${dirName}"`);
        await delay(1500);
      } else {
        // 如果无法展开，尝试单击（可能会展开）
        clickTreeNode(dirName, false);
        await delay(1500);
      }
    } else {
      // 对于最后一级，直接单击选中
      let result = clickTreeNode(dirName, false);
      
      if (!result || !result.clicked) {
        // 如果没找到，可能需要先展开
        console.log(`    ⚠️ 未找到 "${dirName}"，尝试展开父目录...`);
        // 尝试展开所有可能的父目录
        for (let j = 0; j < pathParts.length - 1; j++) {
          expandTreeNode(pathParts[j]);
        }
        await delay(1500);
        result = clickTreeNode(dirName, false);
      }
      
      if (result && result.clicked) {
        console.log(`    ✅ 已选中 "${dirName}"`);
        await delay(800);
      } else {
        console.log(`    ⚠️ 未找到 "${dirName}"，尝试新建...`);
        const created = await createFolderInDialog(dirName);
        if (!created) return { success: false, error: `无法创建目录 "${dirName}"` };
        await delay(1000);
      }
    }
  }

  console.log('  ✅ 点击"确定"...');
  await delay(500);
  const ok = clickFooterButton('confirm');
  if (!ok) { console.error('  ❌ 未找到"确定"按钮'); return { success: false, error: '未找到确定按钮' }; }
  console.log('  ✅ 已点击确定');
  await delay(3000);
  return { success: true };
}

async function createFolderInDialog(folderName) {
  console.log(`    📝 点击"新建文件夹"...`);
  const clicked = clickFooterButtonByText('新建文件夹');
  if (!clicked) { console.error('    ❌ 未找到"新建文件夹"按钮'); return false; }
  await delay(1000);

  const inputResult = cdpEval(`
    (function() {
      var inputs = document.querySelectorAll('.dialog-body input[type="text"]');
      for (var i = 0; i < inputs.length; i++) {
        var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(inputs[i], "${folderName.replace(/"/g, '\\"')}");
        inputs[i].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[i].dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    })()
  `);

  if (!inputResult) { console.error('    ❌ 无法输入文件夹名称'); return false; }
  console.log(`    ✅ 已输入: ${folderName}`);
  await delay(500);

  const confirmed = clickFooterButton('confirm');
  if (!confirmed) clickFooterButtonByText('确定');
  await delay(2000);
  console.log(`    ✅ 已创建文件夹 "${folderName}"`);
  return true;
}

// ============ 路径工具 ============

/**
 * 归一化路径为 "-" 分隔格式，去掉常见前缀后缀
 * "我的网盘/视听娱乐/电影" → "视听娱乐-电影"
 * "【全部文件-视听娱乐-电影】" → "视听娱乐-电影"
 * "/视听娱乐/SeedHub" → "视听娱乐-SeedHub"
 */
function normalizePath(p) {
  if (!p) return '';
  // 去掉前后空格
  let s = p.trim();
  // 去掉开头的 "/" 或 "\"
  s = s.replace(/^[\/\\]+/, '');
  // 去掉 "我的网盘/" 前缀
  s = s.replace(/^我的网盘[\/\\]/, '');
  // 将路径分隔符统一替换为 "-"
  s = s.replace(/[\/\\]/g, '-');
  // 去掉 "【全部文件-" 前缀和 "】" 后缀
  s = s.replace(/^【全部文件-?/, '').replace(/】$/g, '');
  // 去掉首尾的 "-"
  s = s.replace(/^-+|-+$/g, '');
  return s;
}

function getCurrentSavePath() {
  return cdpEval(`
    (function() {
      var el = document.querySelector('.save-path');
      return el ? el.textContent.trim() : null;
    })()
  `);
}

/**
 * 检查当前路径是否与目标路径匹配（后向匹配）
 * 例如：
 *   currentPath: "全部文件-我的网盘-视听娱乐-SeedHub"
 *   targetPath: "/视听娱乐/SeedHub"
 *   归一化后：current="视听娱乐-SeedHub", target="视听娱乐-SeedHub"
 *   结果：true
 * 
 * 简化策略：只要当前路径以目标路径的最后一部分结尾，就认为匹配
 */
function isPathMatch(currentPath, targetPath) {
  if (!currentPath || !targetPath) return false;
  
  const current = normalizePath(currentPath);
  const target = normalizePath(targetPath);
  
  console.log(`    [路径匹配] 当前: "${current}" | 目标: "${target}"`);
  
  // 完全匹配
  if (current === target) return true;
  
  // 后向匹配：当前路径以目标路径结尾
  if (current.endsWith('-' + target)) return true;
  
  // 简化策略：提取目标路径的最后一级文件夹名
  const targetParts = target.split('-');
  const lastFolder = targetParts[targetParts.length - 1];
  
  // 如果当前路径包含最后一级文件夹名，也认为匹配
  if (lastFolder && current.includes(lastFolder)) {
    console.log(`    [简化匹配] 找到最后一级文件夹: "${lastFolder}"`);
    return true;
  }
  
  return false;
}

function clickSaveToDiskBtn() {
  return cdpEval(`
    (function() {
      var btns = document.querySelectorAll('.g-button-right');
      for (var i = 0; i < btns.length; i++) {
        var txt = btns[i].textContent.trim();
        if (txt.indexOf('保存到网盘') !== -1 || txt.indexOf('保存到我的百度网盘') !== -1) {
          btns[i].click();
          return { success: true, text: txt };
        }
      }
      return { success: false };
    })()
  `);
}

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

async function closeSuccessDialog() {
  const closed = cdpEval(`
    (function() {
      var d = document.querySelector('.after-trans-dialog');
      if (!d) return false;
      var closeBtn = d.querySelector('.dialog-close') || d.querySelector('[node-type="close"]') || d.querySelector('.close');
      if (closeBtn) { closeBtn.click(); return 'clicked'; }
      var btns = d.querySelectorAll('a,button');
      for (var i = 0; i < btns.length; i++) {
        var txt = btns[i].textContent.trim();
        if (txt === '确定' || txt === '好') {
          btns[i].click();
          return 'clicked-ok';
        }
      }
      return false;
    })()
  `);
  if (closed) await delay(1000);
  return closed;
}

async function waitForSuccessDialog(timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const visible = cdpEval(`
      (function() {
        var d = document.querySelector('.after-trans-dialog');
        if (!d) return false;
        return window.getComputedStyle(d).display !== 'none';
      })()
    `);
    if (visible) return true;
    await delay(500);
  }
  return false;
}

// ============ 辅助 ============

function extractCodeFromUrl(url) {
  const match = url.match(/[?&]pwd=([^&"'\s]+)/i);
  return match ? match[1] : '';
}

/**
 * 确保当前标签页是百度网盘页面
 * 如果不是，尝试切换到已有的百度网盘标签页，或新建标签页
 */
async function ensureBaiduTab(targetUrl) {
  console.log('  📋 检查标签页...');
  const tabs = listTabs();
  console.log(`  发现 ${tabs.length} 个标签页`);

  // 打印标签页列表（调试用）
  for (const tab of tabs) {
    const marker = tab.active ? '→' : ' ';
    console.log(`    ${marker} [${tab.id}] ${tab.title.substring(0, 40)} ${tab.url ? '| ' + tab.url.substring(0, 60) : ''}`);
  }

  // 优先找包含 pan.baidu.com 的标签页
  const baiduTab = tabs.find(t => t.url && t.url.includes('pan.baidu.com'));
  if (baiduTab) {
    if (baiduTab.active) {
      console.log(`  ✅ 当前标签页已是百度网盘: [${baiduTab.id}]`);
      return true;
    }
    console.log(`  🔄 切换到百度网盘标签页: [${baiduTab.id}]`);
    const switched = switchTab(baiduTab.id);
    if (switched) {
      await delay(1000);
      return true;
    }
    console.error('  ❌ 切换标签页失败');
    return false;
  }

  // 没有百度网盘标签页，新建一个
  console.log('  📑 未找到百度网盘标签页，新建...');
  const created = openNewTab(targetUrl);
  if (created) {
    console.log('  ✅ 已在新标签页打开百度网盘');
    return true;
  }
  console.error('  ❌ 新建标签页失败');
  return false;
}

async function checkBaiduLogin() {
  console.log('  🔍 检测百度网盘登录状态...');
  await ensureBaiduTab('https://pan.baidu.com');
  await delay(3000);

  // 如果当前不是百度网盘页面，先导航过去
  const currentUrl = cdpEval('window.location.href');
  if (!currentUrl || !currentUrl.includes('pan.baidu.com')) {
    openPage('https://pan.baidu.com');
    await delay(4000);
  }

  const loginStatus = cdpEval(`
    (function() {
      var url = window.location.href;
      var text = document.body ? document.body.innerText : '';
      if (url.indexOf('passport.baidu.com') !== -1 || url.indexOf('login') !== -1) {
        return { loggedIn: false, reason: '未登录，已跳转到登录页' };
      }
      if (text.indexOf('登录') !== -1 && text.indexOf('注册') !== -1 && text.indexOf('个人中心') === -1) {
        return { loggedIn: false, reason: '检测到登录/注册入口' };
      }
      return { loggedIn: true };
    })()
  `);

  if (loginStatus && loginStatus.loggedIn) {
    console.log('  ✅ 百度网盘已登录');
    return true;
  } else {
    console.error(`  ❌ 百度网盘未登录: ${loginStatus ? loginStatus.reason : '未知原因'}`);
    return false;
  }
}

// ============ 主转存函数 ============

async function transferBaiduShare(shareUrl, extractCode, targetPath, options = {}) {
  const { skipLoginCheck = false } = options;

  if (!extractCode) extractCode = extractCodeFromUrl(shareUrl);
  const cleanUrl = shareUrl.split('?')[0];
  const shareId = cleanUrl.split('/s/')[1] || '';

  console.log(`\n${'='.repeat(50)}`);
  console.log(`📦 开始转存`);
  console.log(`   链接: ${shareUrl}`);
  console.log(`   提取码: ${extractCode || '(无)'}`);
  console.log(`   目标目录: ${targetPath}`);
  console.log(`${'='.repeat(50)}`);

  // Step 0: 检查登录
  if (!skipLoginCheck) {
    const loggedIn = await checkBaiduLogin();
    if (!loggedIn) return { success: false, error: '百度网盘未登录，请先手动登录' };
  }

  // Step 1: 打开分享链接
  console.log('\n[1/5] 🌐 打开分享链接...');
  await closeSuccessDialog();

  // 确保在百度网盘标签页上操作
  const tabReady = await ensureBaiduTab(cleanUrl);
  if (!tabReady) {
    return { success: false, error: '无法切换到百度网盘标签页' };
  }

  // 在当前标签页中导航到分享链接
  openPage(cleanUrl);
  console.log('  ⏳ 等待页面加载（6秒）...');
  await delay(6000);

  // 验证 URL
  const currentUrl = cdpEval('window.location.href');
  console.log(`  当前页面 URL: ${currentUrl || '(无法获取)'}`);
  
  if (currentUrl) {
    const shareIdWithoutPrefix = shareId.replace(/^1/, '');
    const isValid = currentUrl.includes(shareId) || currentUrl.includes(shareIdWithoutPrefix);
    
    if (!isValid) {
      console.error('  ❌ 页面未正确导航到目标分享链接！');
      console.error(`    期望 share ID: ${shareId}`);
      console.error(`    实际 URL: ${currentUrl}`);
      return { success: false, error: `页面导航失败，当前URL: ${currentUrl}` };
    }
    console.log('  ✅ 页面已正确加载，share ID 匹配');
  } else {
    console.log('  ⚠️  无法获取当前URL，继续执行');
  }

  // Step 2: 处理提取码
  console.log('\n[2/5] 🔑 检查提取码...');
  const needCode = cdpEval(`!!document.querySelector('input[placeholder*="提取码"], input[placeholder*="访问码"]')`);

  if (needCode) {
    if (!extractCode) { console.error('  ❌ 需要提取码但未提供'); return { success: false, error: '需要提取码' }; }
    console.log(`  输入提取码: ${extractCode}`);
    setInputValue('input[placeholder*="提取码"], input[placeholder*="访问码"]', extractCode);
    await delay(500);
    clickByText(['提取文件', '确定', '确认', '进入'], ['button', 'a']);
    await delay(3000);
    console.log('  ✅ 提取码已提交');
    console.log('  ⏳ 等待文件列表加载...');
    const listLoaded = await waitForText(['保存到网盘', '文件名', '大小'], 15000);
    if (!listLoaded) { console.error('  ❌ 文件列表加载超时'); return { success: false, error: '文件列表加载失败' }; }
    console.log(`  ✅ 文件列表已加载`);
  } else {
    console.log('  跳过（无需提取码）');
    await delay(3000);
  }

  // 检查链接有效性
  const linkText = cdpEval(`document.body ? document.body.innerText : ''`);
  if (linkText && (linkText.includes('链接已失效') || linkText.includes('已过期'))) {
    return { success: false, error: '链接已失效或已过期' };
  }

  // Step 3: 检查当前保存路径，决定是否需要修改
  console.log('\n[3/5] 📂 检查当前保存路径...');
  const currentSavePath = getCurrentSavePath();
  console.log(`  当前路径: ${currentSavePath || '(无法获取)'}`);
  console.log(`  目标路径: ${targetPath}`);
  
  const pathMatches = isPathMatch(currentSavePath, targetPath);
  console.log(`  路径匹配: ${pathMatches ? '✅ 是' : '❌ 否'}`);

  if (pathMatches) {
    // 路径匹配，直接点击"保存到网盘"
    console.log('  ✅ 路径已匹配，直接保存...');
    const saveResult = clickSaveToDiskBtn();
    if (!saveResult || !saveResult.success) {
      console.error('  ❌ 未找到"保存到网盘"按钮');
      return { success: false, error: '找不到保存到网盘按钮' };
    }
    console.log(`  ✅ 已点击: "${saveResult.text}"`);
  } else {
    // 路径不匹配，需要打开目录树选择路径
    console.log('  ⚠️ 路径不匹配，打开目录选择对话框...');
    const dialogOpened = openDirectoryDialog();
    if (!dialogOpened) {
      console.error('  ❌ 未找到 .bottom-save-path 元素');
      return { success: false, error: '找不到路径选择区域' };
    }
    console.log('  ✅ 已打开目录选择对话框');
    await delay(1500);

    const dirResult = await handleDirectoryDialog(targetPath);
    if (!dirResult.success) {
      console.error('  ❌ 目录选择失败:', dirResult.error);
      clickFooterButton('cancel');
      return { success: false, error: dirResult.error };
    }
    console.log('  ✅ 目录已选择，已点击确定（自动触发保存）');
    await delay(2000);
  }

  // Step 4: 等待保存结果
  console.log('\n[4/5] 🔄 等待保存结果...');
  const successVisible = await waitForSuccessDialog(10000);
  if (!successVisible) {
    const pageCheck = cdpEval(`(function(){ var t=document.body?document.body.innerText:''; if(t.indexOf('保存成功')!==-1||t.indexOf('转存成功')!==-1)return'success'; if(t.indexOf('已存在')!==-1)return'exists'; return'unknown'; })()`);
    if (pageCheck === 'success' || pageCheck === 'exists') {
      console.log(`  ✅ 保存成功（通过页面文本检测）`);
      return { success: true, path: targetPath };
    }
    console.error('  ❌ 保存结果对话框未出现');
    return { success: false, error: '保存结果未知，请手动确认' };
  }

  await delay(1000);
  const savedPath = getSuccessPath();
  console.log(`  保存结果路径: ${savedPath || '(未获取到)'}`);

  // Step 5: 验证保存路径
  console.log('\n[5/5] ✅ 验证保存路径...');
  if (savedPath && isPathMatch(savedPath, targetPath)) {
    console.log(`\n✅ 转存成功！文件已保存到: ${savedPath}`);
    return { success: true, path: savedPath };
  } else if (savedPath) {
    console.log(`\n⚠️ 保存路径后缀不匹配:`);
    console.log(`    期望后缀: ${targetPath}`);
    console.log(`    实际路径: ${savedPath}`);
    return { success: true, path: savedPath, warning: '路径后缀不匹配，请手动确认' };
  } else {
    console.log(`\n✅ 转存完成（无法验证路径，请手动确认）`);
    return { success: true, path: targetPath };
  }
}

// ============ 导出 ============
module.exports = {
  transferBaiduShare,
  extractCodeFromUrl,
  checkBaiduLogin,
  cdpEval,
  openPage,
  delay,
  listTabs
};

// ============ 独立运行入口 ============
if (require.main === module) {
  // 检测 Git Bash MSYS2 路径转换问题
  // Git Bash 会把 /视听娱乐/电影 转为 C:/Program Files/Git/视听娱乐/电影
  // 如果检测到被损坏的路径，用 MSYS_NO_PATHCONV=1 重新 spawn
  if (process.env.MSYSTEM && !process.env.MSYS_NO_PATHCONV) {
    const suspectArg = process.argv.find(a => a && a.includes('Program Files/Git'));
    if (suspectArg) {
      const { spawn } = require('child_process');
      const env = Object.assign({}, process.env, { MSYS_NO_PATHCONV: '1' });
      const child = spawn(process.execPath, process.argv.slice(1), {
        stdio: 'inherit',
        env: env
      });
      child.on('exit', (code) => process.exit(code || 0));
      child.on('error', (err) => {
        console.error('重新启动失败:', err.message);
        process.exit(1);
      });
      return; // 不继续执行，等子进程完成
    }
  }

  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('用法: node baidu_transfer.js <shareUrl> [extractCode] [targetPath]');
    console.log('示例: node baidu_transfer.js "https://pan.baidu.com/s/1xxx" abcd "/视听娱乐/电影"');
    process.exit(0);
  }
  const [shareUrl, extractCode, targetPath = '/自动化/电影'] = args;
  transferBaiduShare(shareUrl, extractCode, targetPath)
    .then(result => {
      console.log('\n最终结果:', JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('发生错误:', err);
      process.exit(1);
    });
}
