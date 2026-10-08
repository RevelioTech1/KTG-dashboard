/**
 * Доступ к хранилищу KPI.
 *
 * Локально и на Cloudflare Workers — sql.js (asm.js), без native addons.
 * Файл БД либо читается с диска (Node), либо из warehouse.embedded.ts (Workers).
 */
import fs from "node:fs";
import path from "node:path";
// asm.js: без WASM, стабильно в workerd / OpenNext.
import initSqlJs from "sql.js/dist/sql-asm.js";
import type { Database, SqlValue } from "sql.js";

const DB_PATH = path.join(process.cwd(), "data", "warehouse.db");

export class WarehouseMissingError extends Error {
  constructor() {
    super("Хранилище данных не найдено");
    this.name = "WarehouseMissingError";
  }
}

let dbPromise: Promise<Database | null> | null = null;

function loadDbBytes(): Uint8Array | null {
  if (fs.existsSync(DB_PATH)) {
    return new Uint8Array(fs.readFileSync(DB_PATH));
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const embedded = require("./warehouse.embedded") as {
      WAREHOUSE_DB_BASE64?: string;
    };
    if (embedded.WAREHOUSE_DB_BASE64) {
      return new Uint8Array(Buffer.from(embedded.WAREHOUSE_DB_BASE64, "base64"));
    }
  } catch {
    /* модуль ещё не сгенерирован — нормально до npm run embed-db */
  }
  return null;
}

async function openDb(): Promise<Database | null> {
  const bytes = loadDbBytes();
  if (!bytes) return null;
  const SQL = await initSqlJs();
  const database = new SQL.Database(bytes);
  database.run("PRAGMA query_only = ON");
  return database;
}

function getDbPromise(): Promise<Database | null> {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

export async function warehouseExists(): Promise<boolean> {
  return (await getDbPromise()) !== null;
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
  const database = await getDbPromise();
  if (!database) throw new WarehouseMissingError();

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
}

export async function queryOne<T>(
  sql: string,
  params: Record<string, unknown> = {},
): Promise<T | undefined> {
  const rows = await query<T>(sql, params);
  return rows[0];
}
