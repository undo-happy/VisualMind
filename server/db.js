import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, 'visualmind.db'), { timeout: 5000 });
db.pragma('journal_mode = WAL');

// Initialize tables
export function init() {
  db.exec(`CREATE TABLE IF NOT EXISTS maps (
    id TEXT PRIMARY KEY,
    userId TEXT,
    tree TEXT,
    text TEXT,
    formatted TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS usage_quota (
    userId TEXT,
    date TEXT,
    count INTEGER,
    PRIMARY KEY (userId, date)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS fsrs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mapId TEXT,
    userId TEXT,
    path TEXT,
    stability REAL,
    difficulty REAL,
    due TEXT,
    UNIQUE(mapId, userId, path)
  )`);
}

init();

export const insertMapStmt = db.prepare('INSERT INTO maps (id, userId, tree, text, formatted) VALUES (?, ?, ?, ?, ?)');
export const selectMapsStmt = db.prepare('SELECT id FROM maps WHERE userId = ?');
export const selectMapsPagedStmt = db.prepare('SELECT id FROM maps WHERE userId = ? ORDER BY rowid DESC LIMIT ? OFFSET ?');
export const selectMapStmt = db.prepare('SELECT * FROM maps WHERE id = ? AND userId = ?');
export const selectMapByIdStmt = db.prepare('SELECT * FROM maps WHERE id = ?');
export const selectAllMapsStmt = db.prepare('SELECT id, userId FROM maps');
export const updateMapStmt = db.prepare('UPDATE maps SET tree = ?, text = ?, formatted = ? WHERE id = ? AND userId = ?');
export const updateMapAdminStmt = db.prepare('UPDATE maps SET tree = ?, text = ?, formatted = ? WHERE id = ?');
export const deleteMapStmt = db.prepare('DELETE FROM maps WHERE id = ? AND userId = ?');
export const deleteMapAdminStmt = db.prepare('DELETE FROM maps WHERE id = ?');
export const getQuotaStmt = db.prepare('SELECT count FROM usage_quota WHERE userId = ? AND date = ?');
export const upsertQuotaStmt = db.prepare(`INSERT INTO usage_quota (userId, date, count) VALUES (?, ?, 1)
  ON CONFLICT(userId, date) DO UPDATE SET count = count + 1`);
export const selectDueCardsStmt = db.prepare('SELECT mapId, path, due FROM fsrs WHERE userId = ? AND due <= ?');
export const selectCardStmt = db.prepare('SELECT * FROM fsrs WHERE userId = ? AND mapId = ? AND path = ?');
export const insertCardStmt = db.prepare(`
  INSERT INTO fsrs (mapId, userId, path, stability, difficulty, due)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(mapId, userId, path) DO NOTHING
`);
export const updateCardStmt = db.prepare('UPDATE fsrs SET stability = ?, difficulty = ?, due = ? WHERE id = ?');
export const deleteCardsByMapStmt = db.prepare('DELETE FROM fsrs WHERE mapId = ? AND userId = ?');

export default db;
