/**
 * Доступ к хранилищу KPI.
 *
 * Локально и на Cloudflare Workers — sql.js (asm.js), без native addons.
 * На каждый запрос создаётся свой Database из закэшированных байтов —
 * глобальный инстанс в Workers небезопасен при параллельных запросах.
 */
import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js/dist/sql-asm.js";
import type { Database, SqlJsStatic, SqlValue } from "sql.js";

const DB_PATH = path.join(process.cwd(), "data", "warehouse.db");

export class WarehouseMissingError extends Error {
  constructor() {
    super("Хранилище данных не найдено");
    this.name = "WarehouseMissingError";
  }
}

let sqlModulePromise: Promise<SqlJsStatic> | null = null;
let dbBytes: Uint8Array | null | undefined;

function loadDbBytes(): Uint8Array | null {
  if (dbBytes !== undefined) return dbBytes;

  if (fs.existsSync(DB_PATH)) {
    dbBytes = new Uint8Array(fs.readFileSync(DB_PATH));
    return dbBytes;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const embedded = require("./warehouse.embedded") as {
      WAREHOUSE_DB_BASE64?: string;
    };
    if (embedded.WAREHOUSE_DB_BASE64) {
      dbBytes = new Uint8Array(
        Buffer.from(embedded.WAREHOUSE_DB_BASE64, "base64"),
      );
      return dbBytes;
    }
  } catch {
    /* модуль ещё не сгенерирован */
  }
  dbBytes = null;
  return null;
}

async function getSql(): Promise<SqlJsStatic> {
  if (!sqlModulePromise) sqlModulePromise = initSqlJs();
  return sqlModulePromise;
}

async function withDb<T>(fn: (database: Database) => T): Promise<T> {
  const bytes = loadDbBytes();
  if (!bytes) throw new WarehouseMissingError();
  const SQL = await getSql();
  const database = new SQL.Database(bytes);
  try {
    database.run("PRAGMA query_only = ON");
    return fn(database);
  } finally {
    database.close();
  }
}

export async function warehouseExists(): Promise<boolean> {
  return loadDbBytes() !== null;
}

function bindParams(params: Record<string, unknown>): Record<string, SqlValue> {
  const out: Record<string, SqlValue> = {};
  for (const [key, value] of Object.entries(params)) {
    const name =
      key.startsWith("@") || key.startsWith("$") || key.startsWith(":")
        ? key
        : `@${key}`;
    out[name] = value as SqlValue;
  }
  return out;
}

export async function query<T>(
  sql: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  return withDb((database) => {
    const stmt = database.prepare(sql);
    if (Object.keys(params).length > 0) {
      stmt.bind(bindParams(params));
    }
    const rows: Record<string, SqlValue>[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows as T[];
  });
}

export async function queryOne<T>(
  sql: string,
  params: Record<string, unknown> = {},
): Promise<T | undefined> {
  const rows = await query<T>(sql, params);
  return rows[0];
}
