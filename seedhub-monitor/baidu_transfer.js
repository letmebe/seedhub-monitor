/**
 * baidu_transfer.js - 百度网盘转存核心模块
 *
 * 使用方式：
 *   const { transferBaiduShare } = require('./baidu_transfer');
 *   await transferBaiduShare('https://pan.baidu.com/s/1xxx', 'abcd', '/自动化/电影');
 *
 * 独立运行（命令行测试）：
 *   node baidu_transfer.js <shareUrl> [extractCode] [targetPath]
 *   node baidu_transfer.js "https://pan.baidu.com/s/1aDadlUIYS1yv16MA_PicYA" ojmk "/自动化/电影"
 */

const { execSync } = require('child_process');
const path = require('path');

// ============ 配置 ============
const CDP_PORT = 9222;
const AGENT = `node "${process.env.APPDATA}\\npm\\node_modules\\agent-browser\\bin\\agent-browser.js" --cdp ${CDP_PORT}`;

// ============ 基础工具函数（与 scrape.js 保持一致） ============

function cdpEval(jsCode) {
  const escaped = jsCode.replace(/"/g, '\\"');
  const cmd = `${AGENT} eval "${escaped}"`;
  try {
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
    const trimmed = result.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const match = trimmed.match(/^\[[\s\S]*\]$|^\{[\s\S]*\}$|^null$|^true$|^false$|^-?\d+(\.\d+)?$/m);
      if (match) return JSON.parse(match[0]);
    }
    return trimmed;
  } catch (e) {
    console.error('  [cdpEval] 失败:', e.message.split('\n')[0]);
    return null;
  }
}

function openPage(url) {
  try {
    execSync(`${AGENT} open "${url}"`, { encoding: 'utf-8', timeout: 30000 });
  } catch (e) {
    console.error('  [openPage] 失败:', url);
  }
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ============ 等待工具 ============

/**
 * 等待某个选择器出现，超时返回 false
 */
async function waitForElement(selector, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const exists = cdpEval(`!!document.querySelector('${selector}')`);
    if (exists) return true;
    await delay(500);
  }
  return false;
}

/**
 * 等待页面文本出现
 */
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

/**
 * 通过文本内容查找元素并点击（多种备选文案）
 * @param {string[]} textPatterns - 候选文案列表，优先顺序
 * @param {string[]} tagNames - 要查找的标签类型
 */
function clickByText(textPatterns, tagNames = ['a', 'button', 'span', 'div']) {
  const patterns = JSON.stringify(textPatterns);
  const tags = JSON.stringify(tagNames);
  return cdpEval(`
    (function() {
      const patterns = ${patterns};
      const tags = ${tags};
      const elements = Array.from(document.querySelectorAll(tags.join(',')));
      for (const pattern of patterns) {
        const found = elements.find(el => el.textContent.trim().includes(pattern));
        if (found) {
          found.click();
          return { success: true, text: found.textContent.trim().substring(0, 40) };
        }
      }
      return { success: false };
    })()
  `);
}

/**
 * 设置输入框的值并触发事件
 */
function setInputValue(selector, value) {
  return cdpEval(`
    (function() {
      const input = document.querySelector('${selector}');
      if (!input) return false;
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, "${value}");
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()
  `);
}

// ============ 从 URL 提取码 ============

function extractCodeFromUrl(url) {
  const match = url.match(/[?&]pwd=([^&"'\s]+)/i);
  return match ? match[1] : '';
}

// ============ 检测百度网盘登录状态 ============

async function checkBaiduLogin() {
  console.log('  🔍 检测百度网盘登录状态...');
  openPage('https://pan.baidu.com');
  await delay(4000);

  const loginStatus = cdpEval(`
    (function() {
      const url = window.location.href;
      const text = document.body ? document.body.innerText : '';
      if (url.includes('passport.baidu.com') || url.includes('login')) {
        return { loggedIn: false, reason: '未登录，已跳转到登录页' };
      }
      if (text.includes('登录') && text.includes('注册') && !text.includes('个人中心')) {
        return { loggedIn: false, reason: '检测到登录/注册入口' };
      }
      return { loggedIn: true };
    })()
  `);

  if (loginStatus && loginStatus.loggedIn) {
    console.log('  ✅ 百度网盘已登录');
    return true;
  } else {
    console.error(`  ❌ 百度网盘未登录: ${loginStatus?.reason || '未知原因'}`);
    console.error('  ⚠️  请手动在 Edge 中登录百度网盘后重试');
    return false;
  }
}

// ============ 目录选择/创建 ============

/**
 * 在转存对话框中导航到目标路径（逐级进入）
 * @param {string} targetPath - 形如 "/自动化/电影"
 */
async function handleDirectoryDialog(targetPath) {
  console.log(`  📂 目标路径: ${targetPath}`);

  // 等待对话框出现（百度网盘转存对话框常见选择器）
  const dialogSelectors = [
    '.dialog-container',
    '.pan-dialog',
    '.nd-dialog',
    '[class*="dialog"]',
    '[class*="modal"]',
    '.save-path-dialog',
    '.wp-s-dialog'
  ];

  let dialogFound = false;
  for (const sel of dialogSelectors) {
    const exists = await waitForElement(sel, 2000);
    if (exists) {
      console.log(`  ✅ 发现对话框: ${sel}`);
      dialogFound = true;
      break;
    }
  }

  if (!dialogFound) {
    // 即使没找到已知选择器，也尝试继续（可能页面结构不同）
    console.log('  ⚠️  未检测到已知对话框选择器，尝试继续...');
  }

  await delay(1000);

  // 解析路径层级："/自动化/电影" -> ['自动化', '电影']
  const pathParts = targetPath.split('/').filter(p => p.trim());
  if (pathParts.length === 0) {
    console.log('  使用根目录');
    return { success: true };
  }

  // 逐层导航
  for (let i = 0; i < pathParts.length; i++) {
    const dirName = pathParts[i];
    const isLast = (i === pathParts.length - 1);
    console.log(`  📁 ${isLast ? '选择' : '进入'}目录: ${dirName}`);

    // 尝试在当前列表中找到目录
    const found = cdpEval(`
      (function() {
        const name = "${dirName}";
        // 多种可能的文件项选择器
        const selectors = [
          '.file-name', '.item-name', '.folder-name',
          '[class*="file-item"]', '[class*="folder-item"]', '[class*="list-item"]',
          'li', '.nd-list-item', '.wp-list-item'
        ];
        for (const sel of selectors) {
          const items = Array.from(document.querySelectorAll(sel));
          const target = items.find(el => el.textContent.trim() === name || el.textContent.trim().startsWith(name + '\\n'));
          if (target) {
            target.click();
            return { found: true, selector: sel };
          }
        }
        return { found: false };
      })()
    `);

    if (found && found.found) {
      console.log(`    ✅ 找到目录 "${dirName}"`);
      await delay(1000);

      // 如果不是最后一层，双击进入
      if (!isLast) {
        cdpEval(`
          (function() {
            const name = "${dirName}";
            const selectors = ['.file-name','.item-name','.folder-name','[class*="file-item"]','li'];
            for (const sel of selectors) {
              const items = Array.from(document.querySelectorAll(sel));
              const target = items.find(el => el.textContent.trim() === name || el.textContent.trim().startsWith(name + '\\n'));
              if (target) {
                target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                return;
              }
            }
          })()
        `);
        await delay(1500);
      }
    } else {
      // 目录不存在，尝试新建
      console.log(`    ⚠️  未找到目录 "${dirName}"，尝试新建...`);
      const createClicked = clickByText(['新建文件夹', '新建', '创建文件夹'], ['button', 'a', 'span']);

      if (!createClicked || !createClicked.success) {
        console.error(`    ❌ 无法新建文件夹（未找到新建按钮）`);
        return { success: false, error: `无法创建目录 "${dirName}"` };
      }

      await delay(1000);

      // 填写文件夹名称
      const inputFilled = setInputValue('input[placeholder*="文件夹"], input[type="text"]', dirName) ||
        cdpEval(`
          (function() {
            const inputs = Array.from(document.querySelectorAll('input'));
            const focused = inputs.find(i => !i.type || i.type === 'text');
            if (focused) {
              const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
              nativeSetter.call(focused, "${dirName}");
              focused.dispatchEvent(new Event('input', { bubbles: true }));
              return true;
            }
            return false;
          })()
        `);

      if (!inputFilled) {
        console.error(`    ❌ 无法输入文件夹名称`);
        return { success: false, error: `无法输入文件夹名称 "${dirName}"` };
      }

      await delay(500);
      // 确认创建
      clickByText(['确定', '确认', '创建', 'OK'], ['button', 'a']);
      await delay(2000);
      console.log(`    ✅ 已创建文件夹 "${dirName}"`);

      // 创建后选中它
      cdpEval(`
        (function() {
          const name = "${dirName}";
          const selectors = ['.file-name','.item-name','.folder-name','[class*="file-item"]','li'];
          for (const sel of selectors) {
            const items = Array.from(document.querySelectorAll(sel));
            const target = items.find(el => el.textContent.trim() === name || el.textContent.trim().startsWith(name + '\\n'));
            if (target) { target.click(); return; }
          }
        })()
      `);
      await delay(800);

      if (!isLast) {
        // 进入刚创建的目录
        cdpEval(`
          (function() {
            const name = "${dirName}";
            const selectors = ['.file-name','.item-name','.folder-name','[class*="file-item"]','li'];
            for (const sel of selectors) {
              const items = Array.from(document.querySelectorAll(sel));
              const target = items.find(el => el.textContent.trim() === name || el.textContent.trim().startsWith(name + '\\n'));
              if (target) {
                target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                return;
              }
            }
          })()
        `);
        await delay(1500);
      }
    }
  }

  return { success: true };
}

// ============ 主转存函数 ============

/**
 * 百度网盘分享链接转存
 * @param {string} shareUrl - 分享链接（支持 ?pwd=xxx 格式）
 * @param {string} extractCode - 提取码（若 URL 中已含则可不传）
 * @param {string} targetPath - 目标路径，如 "/自动化/电影"
 * @param {object} options - 选项
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
async function transferBaiduShare(shareUrl, extractCode = '', targetPath = '/自动化', options = {}) {
  const { skipLoginCheck = false } = options;

  // 从 URL 中补全提取码
  if (!extractCode) {
    extractCode = extractCodeFromUrl(shareUrl);
  }

  // 清理 URL 中的提取码参数，保留纯分享链接
  const cleanUrl = shareUrl.split('?')[0];

  console.log(`\n${'='.repeat(50)}`);
  console.log(`📦 开始转存`);
  console.log(`   链接: ${shareUrl}`);
  console.log(`   提取码: ${extractCode || '(无)'}`);
  console.log(`   目标目录: ${targetPath}`);
  console.log(`${'='.repeat(50)}`);

  // Step 0: 检查登录状态
  if (!skipLoginCheck) {
    const loggedIn = await checkBaiduLogin();
    if (!loggedIn) {
      return { success: false, error: '百度网盘未登录，请先手动登录' };
    }
  }

  // Step 1: 打开分享链接
  console.log('\n[1/5] 🌐 打开分享链接...');
  openPage(cleanUrl);
  await delay(5000);

  // Step 2: 处理提取码弹窗
  console.log('[2/5] 🔑 检查提取码...');
  const needCode = cdpEval(`
    !!(document.querySelector('input[placeholder*="提取码"], input[placeholder*="访问码"], input[placeholder*="密码"]'))
  `);

  if (needCode) {
    if (!extractCode) {
      console.error('  ❌ 需要提取码但未提供');
      return { success: false, error: '需要提取码' };
    }
    console.log(`  输入提取码: ${extractCode}`);

    // 输入提取码
    setInputValue(
      'input[placeholder*="提取码"], input[placeholder*="访问码"], input[placeholder*="密码"]',
      extractCode
    );
    await delay(500);

    // 点击提交
    const submitClicked = clickByText(['提取文件', '确定', '确认', '进入', 'OK'], ['button', 'a']);
    if (!submitClicked || !submitClicked.success) {
      // 尝试直接找 submit 按钮
      cdpEval(`document.querySelector('button[type="submit"]')?.click()`);
    }
    await delay(3000);
    console.log('  ✅ 提取码已提交');
  } else {
    console.log('  跳过（无需提取码）');
  }

  // 检查链接是否有效
  const linkStatus = cdpEval(`
    (function() {
      const text = document.body ? document.body.innerText : '';
      if (text.includes('链接已失效') || text.includes('已过期') || text.includes('分享已取消')) {
        return { valid: false, reason: '链接已失效' };
      }
      if (text.includes('不存在')) {
        return { valid: false, reason: '链接不存在' };
      }
      if (text.includes('访问次数已满')) {
        return { valid: false, reason: '访问次数已满' };
      }
      return { valid: true };
    })()
  `);

  if (linkStatus && !linkStatus.valid) {
    console.error(`  ❌ ${linkStatus.reason}`);
    return { success: false, error: linkStatus.reason };
  }

  // Step 3: 点击转存按钮
  console.log('[3/5] 💾 点击转存按钮...');
  await delay(2000);

  const saveBtn = clickByText(
    ['转存', '保存到网盘', '保存到我的网盘', '存到我的网盘', '保存'],
    ['a', 'button', 'span', 'div']
  );

  if (!saveBtn || !saveBtn.success) {
    // 截图当前页面文字辅助排查
    const pageText = cdpEval(`document.body ? document.body.innerText.substring(0, 500) : ''`);
    console.error('  ❌ 未找到转存按钮');
    console.error('  页面内容片段:', pageText);
    return { success: false, error: '找不到转存按钮' };
  }

  console.log(`  ✅ 已点击: "${saveBtn.text}"`);
  await delay(3000);

  // Step 4: 处理目录选择对话框
  console.log('[4/5] 📂 选择目标目录...');
  const dirResult = await handleDirectoryDialog(targetPath);

  if (!dirResult.success) {
    console.error('  ❌ 目录处理失败:', dirResult.error);
    return { success: false, error: dirResult.error };
  }

  console.log('  ✅ 目录已选择');
  await delay(1000);

  // Step 5: 确认转存
  console.log('[5/5] ✅ 确认转存...');
  const confirmBtn = clickByText(
    ['确定', '保存', '确认', '完成'],
    ['button', 'a', 'span']
  );

  if (!confirmBtn || !confirmBtn.success) {
    console.error('  ❌ 未找到确认按钮');
    return { success: false, error: '找不到确认按钮' };
  }

  console.log(`  ✅ 已点击: "${confirmBtn.text}"`);
  await delay(5000);

  // 检测转存结果
  const resultText = await waitForText(
    ['转存成功', '保存成功', '已存在', '转存失败', '保存失败', '超出'],
    8000
  );

  if (resultText && (resultText.includes('成功'))) {
    console.log(`\n✅ 转存成功！已保存到: ${targetPath}`);
    return { success: true, path: targetPath };
  } else if (resultText && resultText.includes('已存在')) {
    console.log(`\n⚠️  文件已存在于: ${targetPath}（视为成功）`);
    return { success: true, path: targetPath, note: '文件已存在' };
  } else if (resultText) {
    console.error(`\n❌ 转存失败: ${resultText}`);
    return { success: false, error: resultText };
  } else {
    // 兜底：检查页面
    const finalCheck = cdpEval(`
      (function() {
        const text = document.body ? document.body.innerText : '';
        if (text.includes('转存成功') || text.includes('保存成功')) return 'success';
        if (text.includes('已存在')) return 'exists';
        return 'unknown';
      })()
    `);
    if (finalCheck === 'success' || finalCheck === 'exists') {
      console.log(`\n✅ 转存完成（${finalCheck}）`);
      return { success: true, path: targetPath };
    }
    console.log(`\n⚠️  转存状态未知，请手动确认`);
    return { success: false, error: '转存状态未知，请手动确认' };
  }
}

// ============ 导出 ============
module.exports = {
  transferBaiduShare,
  extractCodeFromUrl,
  checkBaiduLogin,
  cdpEval,
  openPage,
  delay
};

// ============ 独立运行入口 ============
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('用法: node baidu_transfer.js <shareUrl> [extractCode] [targetPath]');
    console.log('示例: node baidu_transfer.js "https://pan.baidu.com/s/1xxx" abcd "/自动化/电影"');
    process.exit(0);
  }

  const [shareUrl, extractCode = '', targetPath = '/自动化/电影'] = args;

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
