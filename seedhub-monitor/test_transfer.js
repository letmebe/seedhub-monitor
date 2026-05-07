/**
 * test_transfer.js - 百度网盘转存功能测试脚本
 *
 * 用途：
 *   使用真实的百度网盘分享链接测试 baidu_transfer.js 核心模块
 *
 * 运行前置条件：
 *   1. Edge 浏览器以 CDP 调试模式运行（端口 9222）
 *      或运行 start-browser.bat 自动启动
 *   2. Edge 中已登录百度网盘账户
 *
 * 运行方式：
 *   node test_transfer.js
 *   node test_transfer.js --url "https://pan.baidu.com/s/1xxx" --code abcd --path "/自动化/电影"
 *   node test_transfer.js --skip-login  # 跳过登录检测（已知已登录时使用）
 */

const { transferBaiduShare, checkBaiduLogin, extractCodeFromUrl } = require('./baidu_transfer');
const { execSync } = require('child_process');

// ============ 参数解析 ============
const args = process.argv.slice(2);

function getArg(name, defaultVal = '') {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultVal;
  return args[idx + 1] || defaultVal;
}

const skipLogin = args.includes('--skip-login');

// 支持命令行覆盖，默认使用真实测试链接
const testUrl = getArg('--url', 'https://pan.baidu.com/s/1aDadlUIYS1yv16MA_PicYA');
const testCode = getArg('--code', 'ojmk');
const testPath = getArg('--path', '/自动化/电影');

// ============ 检查 Edge 是否以调试模式运行 ============
function isEdgeRunning() {
  try {
    const result = execSync('netstat -ano | findstr ":9222"', { encoding: 'utf-8' });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

// ============ 主测试函数 ============
async function main() {
  console.log('====================================');
  console.log('  百度网盘转存功能测试');
  console.log('====================================');
  console.log(`测试链接: ${testUrl}`);
  console.log(`提取码:   ${testCode || '(无)'}`);
  console.log(`目标路径: ${testPath}`);
  console.log('====================================\n');

  // 检查 Edge 运行状态
  if (!isEdgeRunning()) {
    console.error('❌ Edge 未在调试模式运行（端口 9222）');
    console.error('   请先运行 start-browser.bat 启动 Edge 调试模式');
    process.exit(1);
  }
  console.log('✅ Edge 调试模式运行中\n');

  // 执行转存
  const result = await transferBaiduShare(testUrl, testCode, testPath, {
    skipLoginCheck: skipLogin
  });

  // 输出结果
  console.log('\n====================================');
  console.log('测试结果:');
  console.log(JSON.stringify(result, null, 2));
  console.log('====================================');

  if (result.success) {
    console.log('\n✅ 测试通过！转存功能正常工作');
  } else {
    console.log(`\n❌ 测试失败: ${result.error}`);
    console.log('\n排查建议:');
    if (result.error === '百度网盘未登录，请先手动登录') {
      console.log('  → 在 Edge 中访问 pan.baidu.com 并登录，然后重试');
    } else if (result.error === '找不到转存按钮') {
      console.log('  → 百度网盘页面结构可能已更新，请检查页面内容');
      console.log('  → 尝试手动打开链接，观察页面上的按钮名称');
    } else if (result.error === '需要提取码') {
      console.log('  → 运行时提供 --code 参数: node test_transfer.js --code <提取码>');
    } else if (result.error?.includes('失效') || result.error?.includes('不存在')) {
      console.log('  → 分享链接已失效，换一个测试链接');
    } else {
      console.log('  → 查看上方日志了解详细信息');
    }
  }

  process.exit(result.success ? 0 : 1);
}

main().catch(err => {
  console.error('\n❌ 测试发生异常:', err.message);
  process.exit(1);
});
