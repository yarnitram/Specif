import { createClient, type Client, type Row } from "@libsql/client";
import type {
  OrderType,
  StrategyRow,
  WatchlistJoined,
  UpsertStrategyInput,
  NotificationSettings,
  GeneralSettings,
} from "./types";

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
// Turso is a hosted SQLite database accessed over HTTPS/WebSocket. Because the
// database lives in Turso's cloud, the data persists across Hostinger restarts
// (unlike a local .db file, which gets wiped on every redeploy).
//
// The client is created lazily (on first live query) so that `next build` can
// import this module without trying to connect to the database — and so a
// misconfigured env var fails with a helpful message at request time instead of
// crashing the build or throwing a cryptic "URL_INVALID" at import time.
let _client: Client | null = null;

function buildClient(): Client {
  const url = process.env.TURSO_DB_URL ?? "";
  const token = process.env.TURSO_DB_TOKEN ?? "";

  if (!url) {
    throw new Error(
      "TURSO_DB_URL is not set. Add it to your environment (set it in .env.local for local dev, and in the Hostinger app's env vars for production)."
    );
  }

  if (!/^(libsql|https?|wss?|file):\/\//.test(url)) {
    throw new Error(
      `TURSO_DB_URL is invalid: "${url}". That looks like your auth token, not a database URL. ` +
        `Copy the full "libsql://YOUR_DB.REGION.turso.io" address from the Turso dashboard and put it in ` +
        `TURSO_DB_URL; put the long token in TURSO_DB_TOKEN instead.`
    );
  }

  return createClient({ url, authToken: token || undefined });
}

export const client: Client = new Proxy({} as Client, {
  get(_target, prop, receiver) {
    if (!_client) _client = buildClient();
    return Reflect.get(_client, prop, receiver);
  },
});

// ---------------------------------------------------------------------------
// Migration / seeding
// ---------------------------------------------------------------------------

let migrated = false;

export async function migrate() {
  if (migrated) return;
  await client.executeMultiple(`
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

  // Add order_type column if it doesn't exist (migration for existing DBs).
  const { rows } = await client.execute(
    "SELECT name FROM pragma_table_info('strategies')"
  );
  const hasOrderType = rows.some((r) => r.name === "order_type");
  if (!hasOrderType) {
    await client.execute(
      "ALTER TABLE strategies ADD COLUMN order_type TEXT CHECK(order_type IN ('LIMIT', 'MARKET', 'TRIGGER_LIMIT')) DEFAULT 'LIMIT'"
    );
  }

  // Pre-seed watchlist if empty.
  const countRes = await client.execute("SELECT COUNT(*) AS c FROM watchlist");
  const count = Number(countRes.rows[0]?.c ?? 0);
  if (count === 0) {
    await client.batch(
      [
        "INSERT INTO watchlist (symbol, sort_order) VALUES ('BTC_USDT', 0)",
        "INSERT INTO watchlist (symbol, sort_order) VALUES ('ETH_USDT', 1)",
        "INSERT INTO watchlist (symbol, sort_order) VALUES ('SOL_USDT', 2)",
        "INSERT INTO watchlist (symbol, sort_order) VALUES ('MX_USDT', 3)",
      ],
      "write"
    );
  }

  migrated = true;
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapStrategy(r: Row): StrategyRow {
  return {
    symbol: String(r.symbol),
    trigger_type: (r.trigger_type as "ABOVE" | "BELOW") ?? "ABOVE",
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

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

export async function listWatchlist(): Promise<WatchlistJoined[]> {
  await migrate();
  const { rows } = await client.execute(`
    SELECT
      w.id, w.symbol, w.sort_order, w.created_at,
      s.trigger_type, s.trigger_price, s.entry_price, s.tp_price, s.sl_price,
      s.order_type, s.trigger_fired, s.tp_fired, s.sl_fired, s.updated_at
    FROM watchlist w
    LEFT JOIN strategies s ON s.symbol = w.symbol
    ORDER BY w.sort_order ASC
  `);
  return rows.map((r) => ({
    id: Number(r.id),
    symbol: String(r.symbol),
    sort_order: Number(r.sort_order),
    created_at: String(r.created_at),
    strategy:
      r.trigger_type != null ? mapStrategy({ ...r, symbol: r.symbol }) : null,
  }));
}

export async function addSymbol(rawSymbol: string): Promise<WatchlistJoined> {
  await migrate();
  let symbol = rawSymbol.trim().toUpperCase();
  if (!symbol.includes("_")) {
    symbol = `${symbol}_USDT`;
  }

  const existing = (
    await client.execute({
      sql: "SELECT * FROM watchlist WHERE symbol = ?",
      args: [symbol],
    })
  ).rows[0];
  if (existing) {
    const strat = (
      await client.execute({
        sql: "SELECT * FROM strategies WHERE symbol = ?",
        args: [symbol],
      })
    ).rows[0];
    return {
      id: Number(existing.id),
      symbol: String(existing.symbol),
      sort_order: Number(existing.sort_order),
      created_at: String(existing.created_at),
      strategy: strat ? mapStrategy(strat) : null,
    };
  }

  const maxRes = await client.execute(
    "SELECT COALESCE(MAX(sort_order), -1) AS m FROM watchlist"
  );
  const nextOrder = Number(maxRes.rows[0]?.m ?? -1) + 1;
  await client.execute({
    sql: "INSERT INTO watchlist (symbol, sort_order) VALUES (?, ?)",
    args: [symbol, nextOrder],
  });

  const row = (
    await client.execute({
      sql: "SELECT * FROM watchlist WHERE symbol = ?",
      args: [symbol],
    })
  ).rows[0];
  return {
    id: Number(row.id),
    symbol: String(row.symbol),
    sort_order: Number(row.sort_order),
    created_at: String(row.created_at),
    strategy: null,
  };
}

export async function removeSymbol(symbol: string): Promise<void> {
  await migrate();
  await client.execute({
    sql: "DELETE FROM strategies WHERE symbol = ?",
    args: [symbol],
  });
  await client.execute({
    sql: "DELETE FROM watchlist WHERE symbol = ?",
    args: [symbol],
  });
}

export async function reorderSymbols(
  items: Array<{ symbol: string; sort_order: number }>
): Promise<void> {
  await migrate();
  if (items.length === 0) return;
  await client.batch(
    items.map((item) => ({
      sql: "UPDATE watchlist SET sort_order = ? WHERE symbol = ?",
      args: [item.sort_order, item.symbol],
    })),
    "write"
  );
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

export async function upsertStrategy(
  input: UpsertStrategyInput
): Promise<StrategyRow> {
  await migrate();
  await client.execute({
    sql: `
      INSERT INTO strategies
        (symbol, trigger_type, trigger_price, entry_price, tp_price, sl_price,
         order_type, trigger_fired, tp_fired, sl_fired, updated_at)
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
        updated_at = CURRENT_TIMESTAMP
    `,
    args: [
      input.symbol,
      input.triggerType,
      input.triggerPrice,
      input.entryPrice,
      input.tpPrice,
      input.slPrice,
      input.orderType,
      input.triggerFired ? 1 : 0,
      input.tpFired ? 1 : 0,
      input.slFired ? 1 : 0,
    ],
  });
  const row = (
    await client.execute({
      sql: "SELECT * FROM strategies WHERE symbol = ?",
      args: [input.symbol],
    })
  ).rows[0];
  return mapStrategy(row);
}

export async function deleteStrategy(symbol: string): Promise<void> {
  await migrate();
  await client.execute({
    sql: "DELETE FROM strategies WHERE symbol = ?",
    args: [symbol],
  });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

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
  return {
    pollIntervalSeconds: 4,
  };
}

function parseNotificationSettings(raw: string | null): NotificationSettings {
  if (!raw) return getDefaultNotificationSettings();
  try {
    return { ...getDefaultNotificationSettings(), ...JSON.parse(raw) };
  } catch {
    return getDefaultNotificationSettings();
  }
}

function parseGeneralSettings(raw: string | null): GeneralSettings {
  if (!raw) return getDefaultGeneralSettings();
  try {
    return { ...getDefaultGeneralSettings(), ...JSON.parse(raw) };
  } catch {
    return getDefaultGeneralSettings();
  }
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  await migrate();
  const row = (
    await client.execute({
      sql: "SELECT value FROM settings WHERE key = ?",
      args: [SETTINGS_KEYS.NOTIFICATIONS],
    })
  ).rows[0];
  return parseNotificationSettings(row?.value != null ? String(row.value) : null);
}

export async function setNotificationSettings(
  input: Partial<NotificationSettings>
): Promise<void> {
  await migrate();
  const merged = { ...(await getNotificationSettings()), ...input };
  await client.execute({
    sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    args: [SETTINGS_KEYS.NOTIFICATIONS, JSON.stringify(merged)],
  });
}

export async function getGeneralSettings(): Promise<GeneralSettings> {
  await migrate();
  const row = (
    await client.execute({
      sql: "SELECT value FROM settings WHERE key = ?",
      args: [SETTINGS_KEYS.GENERAL],
    })
  ).rows[0];
  return parseGeneralSettings(row?.value != null ? String(row.value) : null);
}

export async function setGeneralSettings(
  input: Partial<GeneralSettings>
): Promise<void> {
  await migrate();
  const merged = { ...(await getGeneralSettings()), ...input };
  await client.execute({
    sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    args: [SETTINGS_KEYS.GENERAL, JSON.stringify(merged)],
  });
}