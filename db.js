const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'seedhub.db');
let db = null;
let SQL = null;

async function initDatabase() {
  if (db) return db;
  
  SQL = await initSqlJs();
  
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('数据库已加载:', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('数据库已创建:', DB_PATH);
  }
  
  db.run(`
    CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT,
      pan_type TEXT,
      pan_link TEXT,
      extract_code TEXT,
      transferred INTEGER DEFAULT 0,
      transfer_time TEXT,
      transfer_path TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(title, pan_type)
    )
  `);
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_transferred ON movies(transferred)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_pan_type ON movies(pan_type)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_created_at ON movies(created_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_title ON movies(title)`);
  
  saveDatabase();
  
  return db;
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function getDb() {
  return db;
}

function closeDatabase() {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
    console.log('数据库连接已关闭');
  }
}

function insertMovie(movie) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO movies (title, url, pan_type, pan_link, extract_code)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  stmt.run([
    movie.title,
    movie.url,
    movie.panType,
    movie.panLink,
    movie.extractCode
  ]);
  
  const changes = db.getRowsModified();
  saveDatabase();
  return changes > 0;
}

function insertMovies(movies) {
  let count = 0;
  for (const movie of movies) {
    if (insertMovie(movie)) {
      count++;
    }
  }
  return count;
}

function upsertMovie(movie) {
  const stmt = db.prepare(`
    SELECT id, pan_link, transferred FROM movies 
    WHERE title = ? AND pan_type = ?
  `);
  
  stmt.bind([movie.title, movie.panType]);
  
  let existing = null;
  if (stmt.step()) {
    existing = stmt.getAsObject();
  }
  stmt.free();
  
  if (!existing) {
    const insertStmt = db.prepare(`
      INSERT INTO movies (title, url, pan_type, pan_link, extract_code)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    insertStmt.run([
      movie.title,
      movie.url,
      movie.panType,
      movie.panLink,
      movie.extractCode
    ]);
    insertStmt.free();
    
    saveDatabase();
    return { action: 'inserted', reason: '新电影' };
  }
  
  if (existing.transferred === 1) {
    return { action: 'skipped', reason: '已转存' };
  }
  
  if (existing.pan_link === movie.panLink) {
    return { action: 'skipped', reason: '链接相同' };
  }
  
  const now = new Date().toISOString();
  db.run(`
    UPDATE movies 
    SET pan_link = ?, extract_code = ?, url = ?, updated_at = ?
    WHERE id = ?
  `, [movie.panLink, movie.extractCode, movie.url, now, existing.id]);
  
  saveDatabase();
  return { action: 'updated', reason: '链接更新', oldLink: existing.pan_link };
}

function upsertMovies(movies) {
  const results = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    details: []
  };
  
  for (const movie of movies) {
    const result = upsertMovie(movie);
    
    if (result.action === 'inserted') results.inserted++;
    else if (result.action === 'updated') results.updated++;
    else results.skipped++;
    
    results.details.push({
      title: movie.title,
      ...result
    });
  }
  
  return results;
}

function getUntransferred(limit = 100) {
  const stmt = db.prepare(`
    SELECT * FROM movies 
    WHERE transferred = 0 
    ORDER BY created_at DESC 
    LIMIT ?
  `);
  
  stmt.bind([limit]);
  
  const results = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push(row);
  }
  stmt.free();
  
  return results;
}

function markTransferred(id, transferPath) {
  const now = new Date().toISOString();
  
  db.run(`
    UPDATE movies 
    SET transferred = 1, 
        transfer_time = ?, 
        transfer_path = ?, 
        updated_at = ?
    WHERE id = ?
  `, [now, transferPath, now, id]);
  
  const changes = db.getRowsModified();
  saveDatabase();
  return changes > 0;
}

function getStats() {
  const stmt = db.prepare(`
    SELECT 
      COUNT(*) as total,
      COALESCE(SUM(CASE WHEN transferred = 1 THEN 1 ELSE 0 END), 0) as transferred_count,
      COALESCE(SUM(CASE WHEN transferred = 0 THEN 1 ELSE 0 END), 0) as pending_count
    FROM movies
  `);
  
  stmt.step();
  const result = stmt.getAsObject();
  stmt.free();
  
  return result;
}

function searchMovies(keyword, limit = 20) {
  const stmt = db.prepare(`
    SELECT * FROM movies 
    WHERE title LIKE ? 
    ORDER BY created_at DESC 
    LIMIT ?
  `);
  
  stmt.bind([`%${keyword}%`, limit]);
  
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  
  return results;
}

function getMoviesByDate(date, limit = 100) {
  const stmt = db.prepare(`
    SELECT * FROM movies 
    WHERE DATE(created_at) = DATE(?) 
    ORDER BY created_at DESC 
    LIMIT ?
  `);
  
  stmt.bind([date, limit]);
  
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  
  return results;
}

function deleteOldMovies(daysOld = 90) {
  db.run(`
    DELETE FROM movies 
    WHERE transferred = 1 
    AND DATE(created_at) < DATE('now', ? || ' days')
  `, [`-${daysOld}`]);
  
  const changes = db.getRowsModified();
  saveDatabase();
  return changes;
}

module.exports = {
  initDatabase,
  getDb,
  closeDatabase,
  insertMovie,
  insertMovies,
  upsertMovie,
  upsertMovies,
  getUntransferred,
  markTransferred,
  getStats,
  searchMovies,
  getMoviesByDate,
  deleteOldMovies
};
