Markdown
# Blueprint: MEXC Futures Terminal (Next.js + SQLite3)

Build a full-stack real-time crypto watchlist and strategy planning terminal using Next.js (App Router), TypeScript, Tailwind CSS, and SQLite3.

---

## 1. Stack & Dependencies

- **Framework:** Next.js (App Router, Server Actions / API Routes)
- **Language:** TypeScript
- **Styling:** Tailwind CSS (Dark theme: `#080b11` base)
- **Database:** SQLite3 via `better-sqlite3` (with `drizzle-orm` or raw SQL helper)
- **Icons:** `lucide-react`
- **Toasts:** `sonner`

Install standard dependencies:
`npm install better-sqlite3 lucide-react sonner clsx tailwind-merge`
`npm install -D @types/better-sqlite3`

---

## 2. Database Schema (`lib/db.ts`)

Initialize SQLite database with WAL mode enabled (`db.pragma('journal_mode = WAL');`). Run these migrations on start:

```sql
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
  trigger_fired BOOLEAN DEFAULT 0,
  tp_fired BOOLEAN DEFAULT 0,
  sl_fired BOOLEAN DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (symbol) REFERENCES watchlist(symbol) ON DELETE CASCADE
);
Pre-seed watchlist with ["BTC_USDT", "ETH_USDT", "SOL_USDT", "MX_USDT"] if empty.

3. API Routes (/app/api/...)
Create the following REST endpoints returning JSON:

GET /api/watchlist

Fetches all watchlist symbols joined with their strategy records.

Return ordered by sort_order ASC.

POST /api/watchlist

Body: { symbol: string }

Normalize string: ensure uppercase, add _USDT suffix if no underscore is present (e.g., DOGE -> DOGE_USDT).

Calculate max sort_order + 1 and insert into watchlist.

DELETE /api/watchlist/[symbol]

Deletes entry from watchlist (cascades to strategies).

PUT /api/watchlist/reorder

Body: { items: Array<{ symbol: string, sort_order: number }> }

Updates sort_order across all items in a single transaction.

POST /api/strategy

Body: { symbol, triggerType, triggerPrice, entryPrice, tpPrice, slPrice, triggerFired, tpFired, slFired }

Upserts record into strategies.

DELETE /api/strategy/[symbol]

Deletes row in strategies for given symbol.

4. WebSocket Manager Hook (hooks/useMexcWebsocket.ts)
Create a custom client hook to maintain a live feed with MEXC Futures WS:

Endpoint: wss://contract.mexc.com/ws

Subscriptions: When symbols array changes, send:

JSON
{
  "method": "sub.ticker",
  "param": { "symbol": "BTC_USDT" }
}
State Structure: Store tick updates by symbol in a reactive map:

TypeScript
type TickerData = {
  lastPrice: number;
  riseFallRate: number;
  fairPrice: number;
  indexPrice: number;
  amount24: number;
  holdVol: number;
  fundingRate: number;
  high24Price: number;
  lower24Price: number;
}
Reconnect automatically with backoff if disconnected.

5. Components Architecture
app/page.tsx: Main terminal page container.

components/Header.tsx: Displays title, WebSocket connection badge, and quick stats.

components/AddSymbolBar.tsx: Search input + button to add new pairs.

components/WatchlistTable.tsx: Client component displaying table rows, handling drag-and-drop reordering.

components/WatchlistRow.tsx: Individual table row with monospace pricing, 24h change color badges (emerald/rose), active trigger badges, and action buttons.

components/StrategyModal.tsx: Modal drawer showing live tick metrics and inputs for entry, TP, SL, and trigger alarms.

6. Real-time Strategy Alarm Engine
In the main client component or hook:

Listen to tick updates for each symbol.

Compare live lastPrice against triggerPrice (ABOVE / BELOW).

Compare live fairPrice against tpPrice and slPrice.

If a target is hit and _fired is false:

Trigger a Toast alert (sonner).

Call POST /api/strategy setting fired = true to prevent infinite toast triggers.

7. UI Design Guidelines
Dark terminal aesthetic (bg-[#080b11], cards #0f172a, borders #1e293b).

Monospace font (font-mono) for all prices, percentages, and tickers.

Color codes: Emerald (#10b981) for positive change, Rose (#f43f5e) for negative.

Responsive design with smooth transitions and glassmorphism backdrops.