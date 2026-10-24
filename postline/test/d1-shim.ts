// Minimal D1Database stand-in backed by node:sqlite, so tests run real SQL from
// the real migration without workerd.
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

class Stmt {
  db: DatabaseSync;
  sql: string;
  params: unknown[];
  constructor(db: DatabaseSync, sql: string, params: unknown[] = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params: unknown[]) {
    return new Stmt(this.db, this.sql, params);
  }
  async first<T>() {
    return (this.db.prepare(this.sql).get(...(this.params as never[])) as T) ?? null;
  }
  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...(this.params as never[])) as T[] };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...(this.params as never[]));
    return { meta: { changes: Number(r.changes) } };
  }
}

export function makeDb(): D1Database {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir).sort()) db.exec(readFileSync(new URL(f, dir), "utf8"));
  return {
    prepare: (sql: string) => new Stmt(db, sql),
    batch: async (stmts: Stmt[]) => {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  } as unknown as D1Database;
}

export const TEST_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
