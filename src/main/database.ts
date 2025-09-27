import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'node:path';
import type { TranscriptQuery, TranscriptRecord } from '../shared/types';

export class TranscriptDatabase {
  private db: Database.Database;

  constructor() {
    const dbPath = join(app.getPath('userData'), 'voxneo.db');
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS transcripts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          text TEXT NOT NULL,
          lang TEXT,
          duration_ms INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          device TEXT
        )`
      )
      .run();
  }

  insert(record: Omit<TranscriptRecord, 'id' | 'createdAt'>): number {
    const stmt = this.db.prepare(
      `INSERT INTO transcripts (text, lang, duration_ms, device)
       VALUES (@text, @lang, @duration_ms, @device)`
    );
    const info = stmt.run({
      text: record.text,
      lang: record.lang,
      duration_ms: record.durationMs,
      device: record.device
    });
    return Number(info.lastInsertRowid);
  }

  list(query: TranscriptQuery): { data: TranscriptRecord[]; total: number } {
    const { page, pageSize, search } = query;
    const offset = (page - 1) * pageSize;
    const where: string[] = [];
    const params: Record<string, unknown> = {};

    if (search) {
      where.push('(text LIKE @search OR lang LIKE @search OR device LIKE @search)');
      params.search = `%${search}%`;
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = this.db
      .prepare(
        `SELECT id, text, lang, duration_ms as durationMs, datetime(created_at) as createdAt, device
         FROM transcripts
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit: pageSize, offset }) as TranscriptRecord[];

    const totalRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM transcripts ${whereClause}`)
      .get(params) as { count: number };

    return { data: rows, total: totalRow?.count ?? 0 };
  }

  exportAll(): TranscriptRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, text, lang, duration_ms as durationMs, datetime(created_at) as createdAt, device
         FROM transcripts
         ORDER BY created_at DESC`
      )
      .all() as TranscriptRecord[];
    return rows;
  }
}
