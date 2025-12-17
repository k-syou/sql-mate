import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Vercel 환경에서는 /tmp 디렉토리 사용 (쓰기 가능)
// 로컬 환경에서는 data 디렉토리 사용
const isVercel = process.env.VERCEL === "1" || process.env.VERCEL_ENV;
const dbPath = isVercel
  ? path.join("/tmp", "sqlmate.db")
  : path.join(process.cwd(), "data", "sqlmate.db");
const dbDir = path.dirname(dbPath);

// 데이터 디렉토리 생성 (로컬 환경에서만)
if (!isVercel && !fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");

    // 초기 스키마 생성
    db.exec(`
      CREATE TABLE IF NOT EXISTS datasets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS schemas (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        schema_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS dataset_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS dataset_group_members (
        group_id TEXT NOT NULL,
        dataset_id TEXT NOT NULL,
        PRIMARY KEY (group_id, dataset_id),
        FOREIGN KEY (group_id) REFERENCES dataset_groups(id),
        FOREIGN KEY (dataset_id) REFERENCES datasets(id)
      );
    `);

    // 기존 테이블에 컬럼이 없으면 추가 (마이그레이션)
    try {
      const tableInfo = db
        .prepare(
          `
        SELECT sql FROM sqlite_master WHERE type='table' AND name='datasets'
      `
        )
        .get() as { sql: string } | undefined;

      if (tableInfo) {
        if (!tableInfo.sql.includes("table_name")) {
          db.exec(`ALTER TABLE datasets ADD COLUMN table_name TEXT;`);
        }
        if (!tableInfo.sql.includes("pii_action")) {
          db.exec(`ALTER TABLE datasets ADD COLUMN pii_action TEXT;`);
        }
        if (!tableInfo.sql.includes("pii_columns")) {
          db.exec(`ALTER TABLE datasets ADD COLUMN pii_columns TEXT;`);
        }
      }

      // dataset_groups 테이블 생성 확인
      const groupsTableInfo = db
        .prepare(
          `
        SELECT name FROM sqlite_master WHERE type='table' AND name='dataset_groups'
      `
        )
        .get();

      if (!groupsTableInfo) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS dataset_groups (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          
          CREATE TABLE IF NOT EXISTS dataset_group_members (
            group_id TEXT NOT NULL,
            dataset_id TEXT NOT NULL,
            PRIMARY KEY (group_id, dataset_id),
            FOREIGN KEY (group_id) REFERENCES dataset_groups(id),
            FOREIGN KEY (dataset_id) REFERENCES datasets(id)
          );
        `);
      }
    } catch (e) {
      // 컬럼이 이미 존재하거나 다른 오류인 경우 무시
      console.warn("마이그레이션 중 오류 (무시 가능):", e);
    }
  }
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
