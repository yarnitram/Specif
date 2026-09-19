import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

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
// Database initialization
// ---------------------------------------------------------------------------

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "terminal.db");

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

export function migrate() {
  db.exec(`
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
  `);

  // Add order_type column if it doesn't exist (migration for existing DBs)
  const columns = db.prepare("PRAGMA table_info(strategies)").all() as { name: string }[];
  const hasOrderType = columns.some((c) => c.name === "order_type");
  if (!hasOrderType) {
    db.exec("ALTER TABLE strategies ADD COLUMN order_type TEXT CHECK(order_type IN ('LIMIT', 'MARKET', 'TRIGGER_LIMIT')) DEFAULT 'LIMIT'");
  }

  // Pre-seed watchlist if empty
  const count = (db.prepare("SELECT COUNT(*) AS c FROM watchlist").get() as { c: number }).c;
  if (count === 0) {
    const seed = db.prepare(
      "INSERT INTO watchlist (symbol, sort_order) VALUES (?, ?)"
    );
    const seedList = ["BTC_USDT", "ETH_USDT", "SOL_USDT", "MX_USDT"];
    db.exec("BEGIN");
    try {
      seedList.forEach((symbol, idx) => seed.run(symbol, idx));
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

export function listWatchlist(): WatchlistJoined[] {
  migrate();
  const rows = db
    .prepare("SELECT * FROM watchlist ORDER BY sort_order ASC")
    .all() as WatchlistRow[];
  const strategyStmt = db.prepare("SELECT * FROM strategies WHERE symbol = ?");
  return rows.map((row) => {
    const s = strategyStmt.get(row.symbol) as StrategyRow | undefined;
    return {
      ...row,
      strategy: s && "symbol" in s ? ({ ...s } as StrategyRow) : null,
    };
  });
}

export function addSymbol(rawSymbol: string): WatchlistJoined {
  migrate();
  let symbol = rawSymbol.trim().toUpperCase();
  if (!symbol.includes("_")) {
    symbol = `${symbol}_USDT`;
  }
  const existing = db.prepare("SELECT * FROM watchlist WHERE symbol = ?").get(symbol);
  if (existing) {
    const strat = db.prepare("SELECT * FROM strategies WHERE symbol = ?").get(symbol) as StrategyRow | undefined;
    return {
      ...existing,
      strategy: strat && "symbol" in strat ? ({ ...strat } as StrategyRow) : null,
    } as WatchlistJoined;
  }
  const maxOrder = (
    db.prepare("SELECT MAX(sort_order) AS m FROM watchlist").get() as { m: number | null }
  ).m;
  const nextOrder = maxOrder == null ? 0 : maxOrder + 1;
  const info = db
    .prepare("INSERT INTO watchlist (symbol, sort_order) VALUES (?, ?)")
    .run(symbol, nextOrder);
  const row = db
    .prepare("SELECT * FROM watchlist WHERE id = ?")
    .get(Number(info.lastInsertRowid)) as WatchlistRow;
  return { ...row, strategy: null };
}

export function removeSymbol(symbol: string) {
  migrate();
  db.prepare("DELETE FROM watchlist WHERE symbol = ?").run(symbol);
}

export function reorderSymbols(items: Array<{ symbol: string; sort_order: number }>) {
  migrate();
  const stmt = db.prepare("UPDATE watchlist SET sort_order = ? WHERE symbol = ?");
  db.exec("BEGIN");
  try {
    items.forEach((item) => stmt.run(item.sort_order, item.symbol));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
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

export function upsertStrategy(input: UpsertStrategyInput): StrategyRow {
  migrate();
  db.prepare(
    `INSERT INTO strategies
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
      updated_at = CURRENT_TIMESTAMP`
  ).run(
    input.symbol,
    input.triggerType,
    input.triggerPrice ?? null,
    input.entryPrice ?? null,
    input.tpPrice ?? null,
    input.slPrice ?? null,
    input.orderType,
    input.triggerFired ? 1 : 0,
    input.tpFired ? 1 : 0,
    input.slFired ? 1 : 0
  );
  return { ...(db.prepare("SELECT * FROM strategies WHERE symbol = ?").get(input.symbol) as StrategyRow) };
}

export function deleteStrategy(symbol: string) {
  migrate();
  db.prepare("DELETE FROM strategies WHERE symbol = ?").run(symbol);
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

export type GeneralSettings = {
  pollIntervalSeconds: number;
};

function getDefaultGeneralSettings(): GeneralSettings {
  return {
    pollIntervalSeconds: 4,
  };
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

function parseNotificationSettings(raw: string | null): NotificationSettings {
  if (!raw) return getDefaultNotificationSettings();
  try {
    const parsed = JSON.parse(raw);
    return { ...getDefaultNotificationSettings(), ...parsed };
  } catch {
    return getDefaultNotificationSettings();
  }
}

export function getNotificationSettings(): NotificationSettings {
  migrate();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(SETTINGS_KEYS.NOTIFICATIONS) as { value: string } | undefined;
  return parseNotificationSettings(row?.value ?? null);
}

export function setNotificationSettings(input: Partial<NotificationSettings>) {
  migrate();
  const current = getNotificationSettings();
  const merged = { ...current, ...input };
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run(SETTINGS_KEYS.NOTIFICATIONS, JSON.stringify(merged));
}

export function getGeneralSettings(): GeneralSettings {
  migrate();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(SETTINGS_KEYS.GENERAL) as { value: string } | undefined;
  return parseGeneralSettings(row?.value ?? null);
}

export function setGeneralSettings(input: Partial<GeneralSettings>) {
  migrate();
  const current = getGeneralSettings();
  const merged = { ...current, ...input };
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run(SETTINGS_KEYS.GENERAL, JSON.stringify(merged));
}

export default db;
