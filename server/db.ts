import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type Client, type InValue } from "@libsql/client";

/**
 * Banco libSQL: arquivo local no computador (desenvolvimento) ou Turso na nuvem (Render),
 * trocando só o endereço. O disco do Render é apagado a cada reinício, por isso a nuvem usa o Turso.
 */
export type Row = Record<string, unknown>;
export type DatabaseTarget = string | { url: string; authToken?: string };

export type Db = {
  get<T = Row>(sql: string, ...args: InValue[]): Promise<T | undefined>;
  all<T = Row>(sql: string, ...args: InValue[]): Promise<T[]>;
  run(sql: string, ...args: InValue[]): Promise<{ changes: number; lastInsertRowid: number }>;
  /** Vários comandos de uma vez, tudo ou nada (importação). */
  batch(statements: Array<{ sql: string; args: InValue[] }>): Promise<void>;
  kind: "arquivo" | "turso";
  close(): void;
};

/** Cada entrada roda uma única vez. Nunca edite uma migração publicada: acrescente uma nova. */
const MIGRATIONS = [
  `CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    passwordHash TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    tokenHash TEXT PRIMARY KEY,
    userId INTEGER NOT NULL,
    expiresAt INTEGER NOT NULL
  );
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    time TEXT,
    vehicle TEXT NOT NULL,
    plate TEXT NOT NULL,
    serviceType TEXT NOT NULL CHECK (serviceType IN ('retirada', 'assistencia', 'instalacao')),
    serviceValue INTEGER NOT NULL,
    km REAL NOT NULL DEFAULT 0,
    kmRate INTEGER NOT NULL DEFAULT 0,
    city TEXT,
    reference TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'agendada' CHECK (status IN ('agendada', 'concluida')),
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );
  CREATE INDEX orders_date_idx ON orders(date);`,
];

export async function openDatabase(target: DatabaseTarget): Promise<Db> {
  let client: Client;
  if (typeof target === "string") {
    const file = resolve(target);
    mkdirSync(dirname(file), { recursive: true });
    client = createClient({ url: pathToFileURL(file).href });
  } else {
    client = createClient(target);
  }

  const db: Db = {
    kind: typeof target === "string" ? "arquivo" : "turso",
    async get<T>(sql: string, ...args: InValue[]) {
      const result = await client.execute({ sql, args });
      return result.rows[0] as T | undefined;
    },
    async all<T>(sql: string, ...args: InValue[]) {
      const result = await client.execute({ sql, args });
      return result.rows as unknown as T[];
    },
    async run(sql: string, ...args: InValue[]) {
      const result = await client.execute({ sql, args });
      return { changes: result.rowsAffected, lastInsertRowid: Number(result.lastInsertRowid ?? 0) };
    },
    async batch(statements) {
      if (statements.length) await client.batch(statements, "write");
    },
    close: () => client.close(),
  };

  await client.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const current = Number((await db.get<{ v: number }>("SELECT MAX(version) AS v FROM schema_version"))?.v ?? 0);
  for (let i = current; i < MIGRATIONS.length; i++) {
    await client.executeMultiple(`BEGIN; ${MIGRATIONS[i]} INSERT INTO schema_version (version) VALUES (${i + 1}); COMMIT;`);
  }
  return db;
}
