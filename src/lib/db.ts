import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DB_PATH = path.join(process.cwd(), "data", "warehouse.db");

let instance: Database.Database | null = null;

export class WarehouseMissingError extends Error {
  constructor() {
    super("Хранилище данных не найдено");
    this.name = "WarehouseMissingError";
  }
}

export function warehouseExists(): boolean {
  return fs.existsSync(DB_PATH);
}

export function db(): Database.Database {
  if (!warehouseExists()) throw new WarehouseMissingError();
  if (!instance) {
    instance = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    instance.pragma("query_only = true");
  }
  return instance;
}

export function query<T>(sql: string, params: Record<string, unknown> = {}): T[] {
  return db().prepare(sql).all(params) as T[];
}

export function queryOne<T>(sql: string, params: Record<string, unknown> = {}): T | undefined {
  return db().prepare(sql).get(params) as T | undefined;
}
