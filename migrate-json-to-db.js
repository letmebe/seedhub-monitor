const fs = require('fs');
const path = require('path');
const db = require('./db');

const RESULTS_DIR = path.join(__dirname, 'results');

function migrateFromJson(jsonPath) {
  console.log('\n开始迁移:', jsonPath);
  
  if (!fs.existsSync(jsonPath)) {
    console.error('文件不存在:', jsonPath);
    return { success: false, error: '文件不存在' };
  }
  
  const content = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(content);
  
  if (!data.movies || !Array.isArray(data.movies)) {
    console.error('无效的数据格式:', jsonPath);
    return { success: false, error: '无效的数据格式' };
  }
  
  const count = db.insertMovies(data.movies);
  
  console.log(`迁移完成: ${count}/${data.movies.length} 条新记录`);
  return { 
    success: true, 
    total: data.movies.length, 
    inserted: count 
  };
}

async function migrateAllJsonFiles() {
  console.log('='.repeat(60));
  console.log('JSON数据迁移到SQLite');
  console.log('='.repeat(60));
  
  await db.initDatabase();
  
  if (!fs.existsSync(RESULTS_DIR)) {
    console.error('结果目录不存在:', RESULTS_DIR);
    return;
  }
  
  const files = fs.readdirSync(RESULTS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();
  
  console.log(`\n找到 ${files.length} 个JSON文件`);
  
  let totalFiles = 0;
  let totalMovies = 0;
  let totalInserted = 0;
  
  for (const file of files) {
    const jsonPath = path.join(RESULTS_DIR, file);
    const result = migrateFromJson(jsonPath);
    
    if (result.success) {
      totalFiles++;
      totalMovies += result.total;
      totalInserted += result.inserted;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('迁移汇总:');
  console.log(`  处理文件: ${totalFiles}/${files.length}`);
  console.log(`  总电影数: ${totalMovies}`);
  console.log(`  新插入数: ${totalInserted}`);
  console.log(`  重复跳过: ${totalMovies - totalInserted}`);
  
  const stats = db.getStats();
  console.log('\n数据库统计:');
  console.log(`  总记录数: ${stats.total}`);
  console.log(`  已转存数: ${stats.transferred_count}`);
  console.log(`  待转存数: ${stats.pending_count}`);
  console.log('='.repeat(60));
  
  db.closeDatabase();
}

async function testDatabase() {
  console.log('\n测试数据库功能...\n');
  
  await db.initDatabase();
  
  console.log('1. 插入测试数据');
  db.insertMovie({
    title: '测试电影',
    url: 'https://test.com',
    panType: '百度',
    panLink: 'https://pan.baidu.com/s/test',
    extractCode: 'test'
  });
  
  console.log('2. 查询统计');
  const stats = db.getStats();
  console.log('统计:', stats);
  
  console.log('3. 查询未转存');
  const untransferred = db.getUntransferred(5);
  console.log(`未转存: ${untransferred.length} 条`);
  
  console.log('4. 搜索电影');
  const searchResults = db.searchMovies('测试');
  console.log(`搜索结果: ${searchResults.length} 条`);
  
  db.closeDatabase();
  console.log('\n测试完成!');
}

if (process.argv.includes('--test')) {
  testDatabase();
} else {
  migrateAllJsonFiles();
}

module.exports = { migrateFromJson, migrateAllJsonFiles };
