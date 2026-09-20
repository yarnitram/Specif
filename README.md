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
- **Strategy planning modal** — live tick metrics plus entry, take-profit, stop-loss, and an `ABOVE`/`BELOW` trigger alarm.
- **Real-time alarm engine** — toasts fire once per target; fired flags persist to the DB so alarms don't re-trigger.
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
components/
  Terminal.tsx              Client orchestrator + real-time alarm engine
  Header.tsx                Title, WS connection badge, quick stats
  AddSymbolBar.tsx          Search input + add button
  WatchlistTable.tsx        Table with drag-and-drop reordering
  WatchlistRow.tsx          Row with pricing, badges, actions
  StrategyModal.tsx         Drawer with live metrics + strategy inputs
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
  trigger_fired BOOLEAN DEFAULT 0,
  tp_fired BOOLEAN DEFAULT 0,
  sl_fired BOOLEAN DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (symbol) REFERENCES watchlist(symbol) ON DELETE CASCADE
);
```

Database runs with `journal_mode = WAL` and foreign keys enabled.

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