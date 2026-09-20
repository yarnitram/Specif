# Specif

A full-stack, real-time crypto watchlist & strategy planning terminal.
Built with **Next.js** (App Router), **TypeScript**, **Tailwind CSS**, and **SQLite** (`node:sqlite` locally,
Turso/libSQL in production for persistent, hosted storage).

Live price data streams from the **MEXC Futures WebSocket** endpoint (`wss://contract.mexc.com/ws`) and
drives a real-time alarm engine that fires toast alerts when a strategy's trigger / TP / SL levels are hit.

---

## Quick Start

```bash
npm install
npm run dev        # start dev server  -> http://localhost:3000
```

Production build:

```bash
npm run build
npm run start
```

Without any Turso env vars the app uses a **local** SQLite database auto-created at `data/terminal.db`
(WAL mode), pre-seeded with `BTC_USDT`, `ETH_USDT`, `SOL_USDT`, `MX_USDT` on first run. Use this for local
dev or a VPS with a persistent disk.

For **shared hosting (Hostinger) and any deployment where the local disk is wiped on redeploy**, set the
Turso env vars (see `.env.example`) so the app uses **Turso — a hosted, persistent SQLite database** instead
of a local file:

```bash
cp .env.example .env.local   # then fill in your Turso URL + token
```

The backend is chosen automatically at request time: if `TURSO_DB_URL` is set it uses Turso, otherwise it
falls back to local `node:sqlite`. The client is created lazily on the first query, so `next build` never
touches the database.

---

## Features

- **Real-time watchlist** — live last price, 24h change (emerald/rose badges), fair price, funding rate per pair.
- **Add / remove pairs** — symbols are normalized (uppercase, `_USDT` suffix appended: `DOGE` → `DOGE_USDT`).
- **Drag & drop reorder** — persisted to the DB in a single transaction.
- **Strategy planning modal** — live tick metrics plus entry, take-profit, stop-loss and a trigger price. **Long/Short**
  is derived from where the live price sits relative to the trigger when you save, and both the side and the trigger
  direction can be overridden.
- **Direction-aware alarm engine** — the trigger fires only on the crossing it was armed with (set a trigger while price
  is above it and it waits for a drop to the level, and vice versa), TP/SL are mirrored for shorts, toasts fire once per
  target and the fired flags persist to the DB so alarms don't re-trigger.
- **Automatic trade log** — every fired alarm (trigger / TP / SL) appends a row to the **Trades** page with the symbol,
  last price, MEXC max leverage, order type, entry, take-profit and stop-loss. The page re-pulls the log every 5s and
  each entry can be deleted.
- **WebSocket manager hook** — auto-reconnects with exponential backoff and re-subscribes as the watchlist changes.
- **Dark terminal UI** (`#080b11`) with glassmorphism cards, monospace pricing, and smooth transitions.

---

## Project Structure

```
app/
  page.tsx                  Main terminal page (server) -> renders <Terminal/>
  layout.tsx                Root layout + metadata
  globals.css               Tailwind + dark theme + grid backdrop
  api/
    watchlist/route.ts          GET, POST
    watchlist/[symbol]/route.ts DELETE
    watchlist/reorder/route.ts  PUT
    strategy/route.ts           POST (upsert)
    strategy/[symbol]/route.ts  GET, DELETE
    trades/route.ts             GET (list), POST (append a fired alarm)
    trades/[id]/route.ts        DELETE
  trades/page.tsx           Trades page (server) -> renders <TradesTable/>
components/
  Terminal.tsx              Client orchestrator + real-time alarm engine
  Header.tsx                Shared header + nav links
  AddSymbolBar.tsx          Search input + add button
  WatchlistTable.tsx        Table with drag-and-drop reordering
  WatchlistRow.tsx          Row with pricing, badges, actions
  StrategyModal.tsx         Drawer with live metrics + strategy inputs
  TradesTable.tsx           Trade log table (Symbol, Position, Last, Leverage, Order Type, Entry, TP, SL)
  PositionBadge.tsx         Long/Short chip shared by the watchlist and the trade log
hooks/
  useMexcWebsocket.ts       MEXC WS manager (reconnect backoff, subscriptions)
lib/
  db.ts                     SQLite schema, migrations, queries (node:sqlite local OR Turso/libSQL remote)
  utils.ts                  cn() helper, price/percent formatting
types/
  global.d.ts               Ambient CSS module declarations
```

---

## API Reference

| Method | Endpoint                          | Description                                          |
| ------ | --------------------------------- | ---------------------------------------------------- |
| GET    | `/api/watchlist`                  | List watchlist joined with strategies, by sort order |
| POST   | `/api/watchlist`                  | Add a pair (`{ symbol }`), normalized                |
| DELETE | `/api/watchlist/[symbol]`         | Remove a pair (cascades to strategies)               |
| PUT    | `/api/watchlist/reorder`          | `{ items: [{symbol, sort_order}] }` reorder atomically |
| POST   | `/api/strategy`                   | Upsert a strategy record                             |
| GET    | `/api/strategy/[symbol]`          | Fetch a strategy                                     |
| DELETE | `/api/strategy/[symbol]`          | Delete a strategy                                    |
| GET    | `/api/trades`                     | List the trade log (newest first)                    |
| POST   | `/api/trades`                     | Append a trade row for a fired alarm (leverage resolved from MEXC) |
| DELETE | `/api/trades/[id]`                | Delete a single trade-log row                        |

---

## Database Schema

```sql
CREATE TABLE watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT UNIQUE NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE strategies (
  symbol TEXT PRIMARY KEY,
  trigger_type TEXT CHECK(trigger_type IN ('ABOVE','BELOW')) DEFAULT 'ABOVE',
  trigger_price REAL,
  entry_price REAL,
  tp_price REAL,
  sl_price REAL,
  order_type TEXT CHECK(order_type IN ('LIMIT','MARKET','TRIGGER_LIMIT')) DEFAULT 'LIMIT',
  position TEXT CHECK(position IN ('LONG','SHORT')) DEFAULT 'LONG',
  trigger_direction TEXT CHECK(trigger_direction IN ('ABOVE','BELOW','BOTH')) DEFAULT 'BOTH',
  trigger_fired BOOLEAN DEFAULT 0,
  tp_fired BOOLEAN DEFAULT 0,
  sl_fired BOOLEAN DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (symbol) REFERENCES watchlist(symbol) ON DELETE CASCADE
);

-- Trade log: appended by the client alarm engine via POST /api/trades whenever
-- a trigger / TP / SL alarm fires. No FK to watchlist: the log is history and
-- survives removing the pair.
CREATE TABLE trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  alert_type TEXT CHECK(alert_type IN ('TRIGGER','TP','SL')) DEFAULT 'TRIGGER',
  last_price REAL,
  leverage REAL,
  order_type TEXT CHECK(order_type IN ('LIMIT','MARKET','TRIGGER_LIMIT')) DEFAULT 'LIMIT',
  position TEXT CHECK(position IN ('LONG','SHORT')) DEFAULT 'LONG',
  entry_price REAL,
  tp_price REAL,
  sl_price REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_trades_created_at ON trades (created_at DESC);
```

Database runs with `journal_mode = WAL` and foreign keys enabled.

---

## How Alerts Work

Prices are polled from MEXC (`GET /api/mexc/tickers`) every `pollIntervalSeconds` (Settings → General, default 4s). The
alarm engine in `components/Terminal.tsx` re-evaluates every strategy on each poll and compares consecutive samples.

### Trigger: the direction is snapshotted at save time

When a strategy is saved, the app compares the **live last price (LP)** with the trigger price `T` and stores which
crossing will arm the alarm in `strategies.trigger_direction`:

| At save time | Stored  | Auto position | Fires when the sampled last price… |
| ------------ | ------- | ------------- | ---------------------------------- |
| `LP > T`     | `BELOW` | `LONG`        | crosses **down to** `T` or below — `prev > T && last <= T` |
| `LP < T`     | `ABOVE` | `SHORT`       | crosses **up to** `T` or above — `prev < T && last >= T` |
| `LP == T`    | `BELOW` | `LONG`        | treated as "above" |

The modal spells this out before you save — *"Last 63,412.50 is above trigger 63,000 → fires when price crosses DOWN to
63,000 · LONG"* — and both values can be overridden (`Below` / `Above` / `Either direction`, and the Long/Short toggle).

The direction is deliberately **frozen at save time**: re-deriving it on every poll would make *"fire when price crosses
to the other side of where it is now"* identical to firing on a cross in either direction, which is the old behaviour.

### Take profit / stop loss

TP and SL are level checks on the **fair (mark) price**, mirrored per side:

| Position | Take profit  | Stop loss    |
| -------- | ------------ | ------------ |
| `LONG`   | `fair >= tp` | `fair <= sl` |
| `SHORT`  | `fair <= tp` | `fair >= sl` |

Because they are level checks rather than crossings, a level that is already breached when the page loads fires on the
first poll. (Before Long/Short existed, a short's TP — which sits *below* entry — fired instantly and its SL could never
fire.)

### One-shot alarms and re-arming

Each level has its own `*_fired` flag. When one fires the client toasts, sends the desktop/Discord notification, appends
a row to the trade log, then POSTs the flag so it never re-triggers — across reloads too. Saving the strategy again
resets all three flags and re-snapshots the direction.

### Caveats

- **Poll resolution.** A spike that crosses and returns between two polls is invisible; `high24Price` / `lower24Price`
  are in the ticker payload but unused.
- **The first poll can never trigger.** A crossing needs two samples, so the earliest a trigger can fire is the second
  poll after load (~4–8s).
- **Being past the level is not a crossing.** If price is already beyond the trigger when you save, nothing fires until
  it crosses back over the level.
- **Migrated rows.** Strategies saved before this feature get `trigger_direction = 'BOTH'` (either direction, the
  original behaviour) and `position = 'LONG'`; simply saving them from the modal adopts the new snapshot.

---

## Notes

- **Storage backend:** `lib/db.ts` runs on **Turso (hosted SQLite)** when `TURSO_DB_URL` is set, otherwise on
  local `node:sqlite`. This is what keeps your data persistent on Hostinger shared hosting, where a local
  `.db` file gets wiped on every redeploy.
- `@libsql/client` (the Turso SDK) is externalized from the bundle via `serverExternalPackages` in
  `next.config.mjs` — it runs server-side only.
- The Turso client is created **lazily on first query**, so `next build` has no DB requirement and missing
  env vars produce a clear error at request time instead of crashing the build.
- All prices/percentages use monospace `font-mono` with tabular numerals.
- Positive change = **Emerald** (`#10b981`), negative = **Rose** (`#f43f5e`).