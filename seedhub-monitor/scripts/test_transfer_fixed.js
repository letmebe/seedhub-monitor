/**
 * test_transfer_fixed.js - 测试修复后的百度网盘转存流程
 * 
 * 测试场景：
 * 1. 打开带有提取码的分享链接
 * 2. 检查当前保存路径
 * 3. 如果路径匹配，直接保存
 * 4. 如果路径不匹配，打开目录树选择路径
 * 5. 验证保存结果
 */

const { transferBaiduShare } = require('./baidu_transfer');

// 测试配置
const TEST_CONFIG = {
  shareUrl: 'https://pan.baidu.com/s/1MkqhXmSWTY3--znq1wzHlw?pwd=ojmk',
  extractCode: 'ojmk',
  targetPath: '/视听娱乐/SeedHub',  // 根据实际目标路径修改
  skipLoginCheck: false
};

async function main() {
  console.log('========================================');
  console.log('  测试修复后的百度网盘转存流程');
  console.log('========================================\n');
  
  console.log('测试配置:');
  console.log(`  分享链接: ${TEST_CONFIG.shareUrl}`);
  console.log(`  提取码: ${TEST_CONFIG.extractCode}`);
  console.log(`  目标路径: ${TEST_CONFIG.targetPath}`);
  console.log(`  跳过登录检查: ${TEST_CONFIG.skipLoginCheck}`);
  console.log('');
  
  console.log('⚠️  请确保:');
  console.log('  1. Edge 浏览器已启动（调试模式，端口 9222）');
  console.log('  2. 百度网盘已登录');
  console.log('  3. 目标文件夹已存在（如 /视听娱乐/SeedHub）');
  console.log('');
  console.log('按 Ctrl+C 取消，或等待 3 秒后自动开始...\n');
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  try {
    const result = await transferBaiduShare(
      TEST_CONFIG.shareUrl,
      TEST_CONFIG.extractCode,
      TEST_CONFIG.targetPath,
      { skipLoginCheck: TEST_CONFIG.skipLoginCheck }
    );
    
    console.log('\n========================================');
    console.log('  测试结果');
    console.log('========================================');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('\n✅ 测试成功！');
      process.exit(0);
    } else {
      console.log('\n❌ 测试失败:', result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ 发生错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
