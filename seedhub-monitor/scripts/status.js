#!/usr/bin/env node
const db = require('../db');

async function showStatus() {
  console.log('='.repeat(60));
  console.log('SeedHub 数据库状态');
  console.log('='.repeat(60));
  
  await db.initDatabase();
  
  const stats = db.getStats();
  console.log('\n📊 统计信息:');
  console.log(`   总记录: ${stats.total}`);
  console.log(`   已转存: ${stats.transferred_count}`);
  console.log(`   待转存: ${stats.pending_count}`);
  
  if (stats.pending_count > 0) {
    console.log('\n📋 待转存列表:');
    const pending = db.getUntransferred(10);
    pending.forEach((movie, i) => {
      console.log(`   ${i + 1}. ${movie.title} (${movie.pan_type})`);
    });
    
    if (stats.pending_count > 10) {
      console.log(`   ... 还有 ${stats.pending_count - 10} 部`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  db.closeDatabase();
}

showStatus().catch(console.error);
