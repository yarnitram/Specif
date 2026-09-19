import type { Client as RemoteClient, Config as RemoteConfig } from "@libsql/client";

// SQL bound-parameter values we ever pass. `number | string | boolean | null`
// is assignable to @libsql/client's InValue, so these fit both backends.
type SqlArg = number | string | boolean | null;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TickerData = {
  lastPrice: number;
  riseFallRate: number;
  fairPrice: number;
  indexPrice: number;
  amount24: number;
  holdVol: number;
  fundingRate: number;
  high24Price: number;
  lower24Price: number;
};

export type WatchlistRow = {
  id: number;
  symbol: string;
  sort_order: number;
  created_at: string;
};

export type OrderType = "LIMIT" | "MARKET" | "TRIGGER_LIMIT";

export type StrategyRow = {
  symbol: string;
  trigger_type: "ABOVE" | "BELOW";
  trigger_price: number | null;
  entry_price: number | null;
  tp_price: number | null;
  sl_price: number | null;
  order_type: OrderType;
  trigger_fired: number;
  tp_fired: number;
  sl_fired: number;
  updated_at: string;
};

export type WatchlistJoined = WatchlistRow & {
  strategy: StrategyRow | null;
};

// ---------------------------------------------------------------------------
// Backend selection
// ---------------------------------------------------------------------------
// Two storage backends share the same schema and SQL:
//
//  * REMOTE (Turso / libSQL) - used when TURSO_DB_URL is set. The database
//    lives in Turso's cloud, so data PERSISTS across Hostinger restarts
//    (a local .db file on shared hosting gets wiped on every redeploy).
//  * LOCAL (node:sqlite) - used when TURSO_DB_URL is NOT set (local dev,
//    or a VPS with a real disk).
//
// Safety rules (this is what made the earlier Turso attempt fail at build):
//  1. Nothing touches process.env or creates a client at module-import time.
//  2. The client is created lazily on the FIRST live query, inside getDb().
//  3. Errors (missing/invalid URL) throw at request time, never at build time.
//  4. @libsql/client is listed in next.config.mjs serverExternalPackages so
//     it is never bundled into the browser build.
//
type Backend = "remote" | "local";

// Keeps TS happy whichever backend is active without importing node:sqlite
// eagerly (it must stay a server-only dependency).
type LocalDb = {
  exec(sql: string): unknown;
  prepare(sql: string): {
    run(...args: unknown[]): { lastInsertRowid: number | bigint };
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
};

let backend: Backend | null = null;
// createClient() returns a Client synchronously and opens no socket until the
// first execute(); we still create it lazily so module import never touches it.
let remoteClient: ReturnType<typeof import("@libsql/client").createClient> | null = null;
let localDb: LocalDb | null = null;

function getRemoteClientConfig(): RemoteConfig | null {
  const url = process.env.TURSO_DB_URL ?? "";
  if (!url) return null;
  // Sanity check: an auth token is NOT a valid libsql/http(s)/ws URL. Give a
  // helpful message instead of the client's cryptic "URL_INVALID".
  if (!/^(libsql|https?|wss?|file):\/\//.test(url)) {
    throw new Error(
      `TURSO_DB_URL looks like a token, not a database URL: "${url}". ` +
        `Copy the full "libsql://YOUR_DB.REGION.turso.io" address from the Turso dashboard ` +
        `into TURSO_DB_URL, and put the long token in TURSO_DB_TOKEN.`
    );
  }
  return { url, authToken: process.env.TURSO_DB_TOKEN || undefined };
}

function ensureInitialized(): Backend {
  if (backend) return backend;
  const cfg = getRemoteClientConfig();
  backend = cfg ? "remote" : "local";

  if (backend === "local") {
    // Lazy require so node:sqlite is only loaded on Node (never bundled/browser).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");

    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const db = new DatabaseSync(path.join(dataDir, "terminal.db")) as unknown as LocalDb;
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    localDb = db;
  }
  return backend;
}

async function getDb(): Promise<Backend> {
  const b = ensureInitialized();
  if (b === "remote" && !remoteClient) {
    const { createClient } = await import("@libsql/client");
    const cfg = getRemoteClientConfig();
    if (!cfg) {
      // Race-safe: backend was set to remote but env disappeared; fall back.
      backend = "local";
      return ensureInitialized();
    }
    remoteClient = createClient(cfg);
  }
  return b;
}

// ---------------------------------------------------------------------------
// Small helpers to normalize result shapes across the two backends
// ---------------------------------------------------------------------------

type RemoteRow = Record<string, unknown> & { [k: number]: unknown };

function remoteRows(rs: { rows: unknown[] }): RemoteRow[] {
  return (rs.rows as RemoteRow[]).map((r) => Object.assign({}, r));
}

function asWatchlistRow(r: Record<string, unknown>): WatchlistRow {
  return {
    id: Number(r.id),
    symbol: String(r.symbol),
    sort_order: Number(r.sort_order),
    created_at: String(r.created_at),
  };
}

function asStrategyRow(r: Record<string, unknown>): StrategyRow {
  return {
    symbol: String(r.symbol),
    trigger_type: (r.trigger_type as StrategyRow["trigger_type"]) ?? "ABOVE",
    trigger_price: r.trigger_price == null ? null : Number(r.trigger_price),
    entry_price: r.entry_price == null ? null : Number(r.entry_price),
    tp_price: r.tp_price == null ? null : Number(r.tp_price),
    sl_price: r.sl_price == null ? null : Number(r.sl_price),
    order_type: (r.order_type as OrderType) ?? "LIMIT",
    trigger_fired: Number(r.trigger_fired ?? 0),
    tp_fired: Number(r.tp_fired ?? 0),
    sl_fired: Number(r.sl_fired ?? 0),
    updated_at: String(r.updated_at ?? ""),
  };
}

function toStrategyRow(r: unknown): StrategyRow | null {
  if (!r || typeof r !== "object") return null;
  const rec = r as Record<string, unknown>;
  if (rec.symbol === undefined || rec.symbol === null) return null;
  return asStrategyRow(rec);
}

const migrationSql = `
CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT UNIQUE NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS strategies (
  symbol TEXT PRIMARY KEY,
  trigger_type TEXT CHECK(trigger_type IN ('ABOVE', 'BELOW')) DEFAULT 'ABOVE',
  trigger_price REAL,
  entry_price REAL,
  tp_price REAL,
  sl_price REAL,
  order_type TEXT CHECK(order_type IN ('LIMIT', 'MARKET', 'TRIGGER_LIMIT')) DEFAULT 'LIMIT',
  trigger_fired BOOLEAN DEFAULT 0,
  tp_fired BOOLEAN DEFAULT 0,
  sl_fired BOOLEAN DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (symbol) REFERENCES watchlist(symbol) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

async function migrate() {
  const b = await getDb();
  if (b === "remote") {
    const client = remoteClient!;
    await client.executeMultiple(migrationSql);
  } else {
    (localDb as LocalDb).exec(migrationSql);
  }

  // Add order_type column if missing (migration for existing DBs).
  const hasOrderType = await hasColumn("strategies", "order_type");
  if (!hasOrderType) {
    const sql =
      "ALTER TABLE strategies ADD COLUMN order_type TEXT CHECK(order_type IN ('LIMIT', 'MARKET', 'TRIGGER_LIMIT')) DEFAULT 'LIMIT'";
    if (b === "remote") await remoteClient!.execute(sql);
    else (localDb as LocalDb).exec(sql);
  }

  // Pre-seed watchlist if empty.
  const count = await queryCount("SELECT COUNT(*) AS c FROM watchlist");
  if (count === 0) {
    const seedList = ["BTC_USDT", "ETH_USDT", "SOL_USDT", "MX_USDT"];
    await runInTransaction(
      seedList.map((symbol, idx) => ({
        sql: "INSERT INTO watchlist (symbol, sort_order) VALUES (?, ?)",
        args: [symbol, idx],
      }))
    );
  }
}

async function hasColumn(table: string, column: string): Promise<boolean> {
  const b = await getDb();
  if (b === "remote") {
    const rs = await remoteClient!.execute({ sql: `PRAGMA table_info(${table})`, args: [] });
    return remoteRows(rs).some((r) => String(r.name) === column);
  }
  const rows = (localDb as LocalDb)
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

async function queryCount(sql: string): Promise<number> {
  const b = await getDb();
  if (b === "remote") {
    const rs = await remoteClient!.execute(sql);
    const rows = remoteRows(rs);
    return rows.length ? Number(rows[0].c) : 0;
  }
  return Number(((localDb as LocalDb).prepare(sql).get() as { c: number }).c);
}

async function runInTransaction(stmts: Array<{ sql: string; args?: SqlArg[] }>) {
  const b = await getDb();
  if (b === "remote") {
    await remoteClient!.batch(stmts.map((s) => ({ sql: s.sql, args: s.args })), "write");
  } else {
    const db = localDb as LocalDb;
    db.exec("BEGIN");
    try {
      for (const s of stmts) db.prepare(s.sql).run(...(s.args ?? []));
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listWatchlist(): Promise<WatchlistJoined[]> {
  await getDb();
  await migrate();
  const b = backend;
  const watchRows: WatchlistRow[] = [];

  if (b === "remote") {
    const client = remoteClient!;
    const rs = await client.execute("SELECT * FROM watchlist ORDER BY sort_order ASC");
    watchRows.push(...remoteRows(rs).map(asWatchlistRow));
  } else {
    const db = localDb as LocalDb;
    const rows = db.prepare("SELECT * FROM watchlist ORDER BY sort_order ASC").all() as WatchlistRow[];
    watchRows.push(...rows);
  }

  const strategyStmt = b === "remote" ? null : (localDb as LocalDb).prepare("SELECT * FROM strategies WHERE symbol = ?");
  const result: WatchlistJoined[] = [];
  for (const row of watchRows) {
    let strategy: StrategyRow | null = null;
    if (b === "remote") {
      const rs = await remoteClient!.execute({ sql: "SELECT * FROM strategies WHERE symbol = ?", args: [row.symbol] });
      const rows = remoteRows(rs);
      strategy = rows.length ? asStrategyRow(rows[0]) : null;
    } else {
      strategy = toStrategyRow(strategyStmt!.get(row.symbol));
    }
    result.push({ ...row, strategy });
  }
  return result;
}

export async function addSymbol(rawSymbol: string): Promise<WatchlistJoined> {
  await migrate();
  let symbol = rawSymbol.trim().toUpperCase();
  if (!symbol.includes("_")) {
    symbol = `${symbol}_USDT`;
  }
  const b = backend;

  if (b === "remote") {
    const client = remoteClient!;
    const existingRs = await client.execute({ sql: "SELECT * FROM watchlist WHERE symbol = ?", args: [symbol] });
    const existing = remoteRows(existingRs)[0];
    if (existing) {
      const sRs = await client.execute({ sql: "SELECT * FROM strategies WHERE symbol = ?", args: [symbol] });
      const sRows = remoteRows(sRs);
      return { ...asWatchlistRow(existing), strategy: sRows.length ? asStrategyRow(sRows[0]) : null };
    }
    const maxRs = await client.execute("SELECT MAX(sort_order) AS m FROM watchlist");
    const maxRow = remoteRows(maxRs)[0];
    const nextOrder = maxRow?.m == null ? 0 : Number(maxRow.m) + 1;
    const ins = await client.execute({ sql: "INSERT INTO watchlist (symbol, sort_order) VALUES (?, ?)", args: [symbol, nextOrder] });
    const newRowRs = await client.execute({ sql: "SELECT * FROM watchlist WHERE id = ?", args: [Number(ins.lastInsertRowid)] });
    const newRow = remoteRows(newRowRs)[0];
    return { ...asWatchlistRow(newRow), strategy: null };
  }

  const db = localDb as LocalDb;
  const existing = db.prepare("SELECT * FROM watchlist WHERE symbol = ?").get(symbol) as Record<string, unknown> | undefined;
  if (existing) {
    const strat = db.prepare("SELECT * FROM strategies WHERE symbol = ?").get(symbol);
    return { ...asWatchlistRow(existing), strategy: toStrategyRow(strat) };
  }
  const max = (db.prepare("SELECT MAX(sort_order) AS m FROM watchlist").get() as { m: number | null }).m;
  const nextOrder = max == null ? 0 : max + 1;
  const info = db.prepare("INSERT INTO watchlist (symbol, sort_order) VALUES (?, ?)").run(symbol, nextOrder);
  const row = db.prepare("SELECT * FROM watchlist WHERE id = ?").get(Number(info.lastInsertRowid)) as Record<string, unknown>;
  return { ...asWatchlistRow(row), strategy: null };
}

export async function removeSymbol(symbol: string): Promise<void> {
  await migrate();
  const b = backend;
  if (b === "remote") {
    await remoteClient!.execute({ sql: "DELETE FROM watchlist WHERE symbol = ?", args: [symbol] });
  } else {
    (localDb as LocalDb).prepare("DELETE FROM watchlist WHERE symbol = ?").run(symbol);
  }
}

export async function reorderSymbols(items: Array<{ symbol: string; sort_order: number }>): Promise<void> {
  await migrate();
  const b = backend;
  const stmts = items.map((item) => ({
    sql: "UPDATE watchlist SET sort_order = ? WHERE symbol = ?",
    args: [item.sort_order, item.symbol],
  }));
  if (b === "remote") {
    await remoteClient!.batch(stmts, "write");
  } else {
    const db = localDb as LocalDb;
    db.exec("BEGIN");
    try {
      for (const item of items) db.prepare("UPDATE watchlist SET sort_order = ? WHERE symbol = ?").run(item.sort_order, item.symbol);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

export type UpsertStrategyInput = {
  symbol: string;
  triggerType: "ABOVE" | "BELOW";
  triggerPrice: number | null;
  entryPrice: number | null;
  tpPrice: number | null;
  slPrice: number | null;
  orderType: OrderType;
  triggerFired: boolean;
  tpFired: boolean;
  slFired: boolean;
};

const upsertSql = `INSERT INTO strategies
    (symbol, trigger_type, trigger_price, entry_price, tp_price, sl_price, order_type, trigger_fired, tp_fired, sl_fired, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
   ON CONFLICT(symbol) DO UPDATE SET
    trigger_type = excluded.trigger_type,
    trigger_price = excluded.trigger_price,
    entry_price = excluded.entry_price,
    tp_price = excluded.tp_price,
    sl_price = excluded.sl_price,
    order_type = excluded.order_type,
    trigger_fired = excluded.trigger_fired,
    tp_fired = excluded.tp_fired,
    sl_fired = excluded.sl_fired,
    updated_at = CURRENT_TIMESTAMP`;

export async function upsertStrategy(input: UpsertStrategyInput): Promise<StrategyRow> {
  await migrate();
  const b = backend;
  const args: SqlArg[] = [
    input.symbol,
    input.triggerType,
    input.triggerPrice ?? null,
    input.entryPrice ?? null,
    input.tpPrice ?? null,
    input.slPrice ?? null,
    input.orderType,
    input.triggerFired ? 1 : 0,
    input.tpFired ? 1 : 0,
    input.slFired ? 1 : 0,
  ];
  if (b === "remote") {
    await remoteClient!.execute({ sql: upsertSql, args });
    const rs = await remoteClient!.execute({ sql: "SELECT * FROM strategies WHERE symbol = ?", args: [input.symbol] });
    const rows = remoteRows(rs);
    return asStrategyRow(rows[0]);
  }
  (localDb as LocalDb).prepare(upsertSql).run(...args);
  const row = (localDb as LocalDb).prepare("SELECT * FROM strategies WHERE symbol = ?").get(input.symbol);
  return toStrategyRow(row) as StrategyRow;
}

export async function deleteStrategy(symbol: string): Promise<void> {
  await migrate();
  const b = backend;
  if (b === "remote") {
    await remoteClient!.execute({ sql: "DELETE FROM strategies WHERE symbol = ?", args: [symbol] });
  } else {
    (localDb as LocalDb).prepare("DELETE FROM strategies WHERE symbol = ?").run(symbol);
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type NotificationSettings = {
  desktopEnabled: boolean;
  desktopTitle?: string;
  desktopBody?: string;
  discordEnabled: boolean;
  discordWebhookUrl?: string;
  discordUsername?: string;
  discordAvatarUrl?: string;
};

export type GeneralSettings = {
  pollIntervalSeconds: number;
};

const SETTINGS_KEYS = {
  NOTIFICATIONS: "notifications",
  GENERAL: "general",
} as const;

function getDefaultNotificationSettings(): NotificationSettings {
  return {
    desktopEnabled: false,
    desktopTitle: "MEXC Alert",
    desktopBody: "{symbol} · {type} hit at {price}",
    discordEnabled: false,
    discordWebhookUrl: "",
    discordUsername: "MEXC Terminal",
    discordAvatarUrl: "",
  };
}

function getDefaultGeneralSettings(): GeneralSettings {
  return { pollIntervalSeconds: 4 };
}

function parseNotificationSettings(raw: string | null): NotificationSettings {
  if (!raw) return getDefaultNotificationSettings();
  try {
    const parsed = JSON.parse(raw);
    return { ...getDefaultNotificationSettings(), ...parsed };
  } catch {
    return getDefaultNotificationSettings();
  }
}

function parseGeneralSettings(raw: string | null): GeneralSettings {
  if (!raw) return getDefaultGeneralSettings();
  try {
    const parsed = JSON.parse(raw);
    return { ...getDefaultGeneralSettings(), ...parsed };
  } catch {
    return getDefaultGeneralSettings();
  }
}

async function getSettingValue(key: string): Promise<string | null> {
  const b = await getDb();
  if (b === "remote") {
    const rs = await remoteClient!.execute({ sql: "SELECT value FROM settings WHERE key = ?", args: [key] });
    const rows = remoteRows(rs);
    return rows.length ? String(rows[0].value) : null;
  }
  const row = (localDb as LocalDb).prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

async function setSettingValue(key: string, value: string): Promise<void> {
  const b = await getDb();
  if (b === "remote") {
    await remoteClient!.execute({ sql: "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", args: [key, value] });
  } else {
    (localDb as LocalDb).prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
  }
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  await migrate();
  return parseNotificationSettings(await getSettingValue(SETTINGS_KEYS.NOTIFICATIONS));
}

export async function setNotificationSettings(input: Partial<NotificationSettings>): Promise<void> {
  await migrate();
  const current = await getNotificationSettings();
  const merged = { ...current, ...input };
  await setSettingValue(SETTINGS_KEYS.NOTIFICATIONS, JSON.stringify(merged));
}

export async function getGeneralSettings(): Promise<GeneralSettings> {
  await migrate();
  return parseGeneralSettings(await getSettingValue(SETTINGS_KEYS.GENERAL));
}

export async function setGeneralSettings(input: Partial<GeneralSettings>): Promise<void> {
  await migrate();
  const current = await getGeneralSettings();
  const merged = { ...current, ...input };
  await setSettingValue(SETTINGS_KEYS.GENERAL, JSON.stringify(merged));
}