import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import logger from '../utils/logger.js';

if (!existsSync('data')) {
  mkdirSync('data', { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || './data/shop.db';
const db = new Database(dbPath);

// Enable WAL mode for better concurrency and performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    queue_number TEXT NOT NULL,
    customer_name TEXT,
    customer_line_id TEXT,
    items TEXT NOT NULL DEFAULT '[]',
    total_price REAL NOT NULL DEFAULT 0,
    pickup_time TEXT,
    status TEXT NOT NULL DEFAULT 'waiting'
      CHECK (status IN ('waiting', 'making', 'done', 'cancelled')),
    priority_score REAL NOT NULL DEFAULT 0,
    note TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    raw_message TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
  CREATE INDEX IF NOT EXISTS idx_orders_priority ON orders(priority_score DESC, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date(created_at));
`);

logger.info(`Database initialized at ${dbPath}`);

export default db;
