"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { TickerData, WatchlistJoined, StrategyRow } from "@/lib/db";
import WatchlistRow from "./WatchlistRow";

type SortOption = "none" | "alerts" | "orderType" | "position" | "symbol" | "change24h" | "lastPrice" | "triggerPrice";

type WatchlistTableProps = {
  rows: WatchlistJoined[];
  ticks: Record<string, TickerData>;
  onReorder: (items: Array<{ symbol: string; sort_order: number }>) => Promise<void>;
  onEdit: (row: WatchlistJoined) => void;
  onRemove: (row: WatchlistJoined) => void;
};

function rowMatchesSearch(row: WatchlistJoined, query: string): boolean {
  const q = query.toLowerCase();
  if (!q) return true;

  // Symbol match
  if (row.symbol.toLowerCase().includes(q)) return true;

  const s: StrategyRow | null = row.strategy;
  if (!s) return false;

  // Strategy price fields (match numeric substrings like "123.45" or "0.001")
  const priceFields = [
    s.trigger_price,
    s.entry_price,
    s.tp_price,
    s.sl_price,
  ].filter((v): v is number => v != null);

  if (priceFields.some((p) => p.toString().includes(q))) return true;

  // Alert status keywords
  const statusKeywords: Record<string, boolean> = {
    triggered: !!s.trigger_fired,
    tp: !!s.tp_fired,
    sl: !!s.sl_fired,
    fired: !!s.trigger_fired || !!s.tp_fired || !!s.sl_fired,
    armed: !s.trigger_fired && (s.trigger_price != null || s.tp_price != null || s.sl_price != null),
    active: s.trigger_price != null || s.tp_price != null || s.sl_price != null,
    // Side + the crossing the trigger is armed with
    long: s.position === "LONG",
    short: s.position === "SHORT",
    above: s.trigger_direction === "ABOVE",
    below: s.trigger_direction === "BELOW",
    both: s.trigger_direction === "BOTH",
  };

  return Object.entries(statusKeywords).some(([kw, active]) => active && kw.includes(q));
}

export default function WatchlistTable({ rows, ticks, onReorder, onEdit, onRemove }: WatchlistTableProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragSymbol, setDragSymbol] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("none");
  const dragOverIndex = useRef<number | null>(null);
  const dragOverSymbol = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dragPreviewRef = useRef<HTMLDivElement | null>(null);

  // Debounce search (150ms)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(searchQuery), 150);
    return () => clearTimeout(id);
  }, [searchQuery]);

  // Cmd/Ctrl + K to focus search
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const filteredRows = useMemo(() => {
    let result = rows.filter((row) => rowMatchesSearch(row, debouncedQuery));
    
    // Sort
    if (sortOption !== "none") {
      result = [...result].sort((a, b) => {
        const tickA = ticks[a.symbol];
        const tickB = ticks[b.symbol];
        const sA = a.strategy;
        const sB = b.strategy;
        
        let valA: string | number = "";
        let valB: string | number = "";
        
        switch (sortOption) {
          case "alerts":
            // Sort: Triggered (2) > Ongoing (1) > No strategy/blank (0)
            const aAnyFired = sA && (sA.trigger_fired || sA.tp_fired || sA.sl_fired);
            const bAnyFired = sB && (sB.trigger_fired || sB.tp_fired || sB.sl_fired);
            valA = aAnyFired ? 2 : sA ? 1 : 0;
            valB = bAnyFired ? 2 : sB ? 1 : 0;
            break;
          case "orderType":
            valA = sA?.order_type ?? "";
            valB = sB?.order_type ?? "";
            break;
          case "position":
            // LONG (2) > SHORT (1) > no strategy (0)
            valA = sA?.position === "LONG" ? 2 : sA?.position === "SHORT" ? 1 : 0;
            valB = sB?.position === "LONG" ? 2 : sB?.position === "SHORT" ? 1 : 0;
            break;
          case "symbol":
            valA = a.symbol;
            valB = b.symbol;
            break;
          case "change24h":
            valA = tickA?.riseFallRate ?? -Infinity;
            valB = tickB?.riseFallRate ?? -Infinity;
            break;
          case "lastPrice":
            valA = tickA?.lastPrice ?? -Infinity;
            valB = tickB?.lastPrice ?? -Infinity;
            break;
          case "triggerPrice":
            valA = sA?.trigger_price ?? -Infinity;
            valB = sB?.trigger_price ?? -Infinity;
            break;
        }
        
        if (valA < valB) return 1; // Descending by default for numeric
        if (valA > valB) return -1;
        return 0;
      });
    }
    
    return result;
  }, [rows, ticks, debouncedQuery, sortOption]);

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: "none", label: "Default (Manual Order)" },
    { value: "alerts", label: "Alerts (Triggered → Ongoing → None)" },
    { value: "orderType", label: "Order Type" },
    { value: "position", label: "Position (Long → Short → None)" },
    { value: "symbol", label: "Symbol (A-Z)" },
    { value: "change24h", label: "24h Change (High to Low)" },
    { value: "lastPrice", label: "Last Price (High to Low)" },
    { value: "triggerPrice", label: "Trigger Price (High to Low)" },
  ];

  function handleDrop() {
    // Clean up drag preview
    if (dragPreviewRef.current) {
      dragPreviewRef.current.remove();
      dragPreviewRef.current = null;
    }
    
    if (dragSymbol == null || dragOverSymbol.current == null || dragSymbol === dragOverSymbol.current) {
      setDragIndex(null);
      setDragSymbol(null);
      dragOverIndex.current = null;
      dragOverSymbol.current = null;
      return;
    }
    // Find indices in the original rows array
    const fromIndex = rows.findIndex((r) => r.symbol === dragSymbol);
    const toIndex = rows.findIndex((r) => r.symbol === dragOverSymbol.current);
    if (fromIndex === -1 || toIndex === -1) {
      setDragIndex(null);
      setDragSymbol(null);
      dragOverIndex.current = null;
      dragOverSymbol.current = null;
      return;
    }
    const next = [...rows];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    const ordered = next.map((row, i) => ({ symbol: row.symbol, sort_order: i }));
    void onReorder(ordered).catch(() => {});
    setDragIndex(null);
    setDragSymbol(null);
    dragOverIndex.current = null;
    dragOverSymbol.current = null;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-borderline bg-surface/40 backdrop-blur">
      {/* Search input + Sort dropdown */}
      <div className="p-4 border-b border-borderline">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative max-w-xs w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search symbols, prices, or status…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2 rounded-lg border border-borderline bg-base/60 text-sm text-slate-100 outline-none focus:border-emerald/50 placeholder:text-slate-500"
              aria-label="Search watchlist"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-200 transition-colors"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="w-full sm:w-auto">
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="w-full sm:w-48 px-3 py-2 rounded-lg border border-borderline bg-base/60 text-sm text-slate-100 outline-none focus:border-emerald/50 cursor-pointer appearance-none bg-no-repeat bg-right pr-8"
              style={{
                backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
                backgroundPosition: "right 8px center",
              }}
              aria-label="Sort watchlist"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {debouncedQuery && (
          <p className="mt-2 text-[11px] text-slate-500 font-mono">
            {filteredRows.length} of {rows.length} symbols
          </p>
        )}
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-borderline text-left text-[11px] uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3 font-semibold">Symbol</th>
            <th className="hidden px-4 py-3 text-center font-semibold sm:table-cell">Position</th>
            <th className="px-4 py-3 text-right font-semibold">24h Change</th>
            <th className="hidden px-4 py-3 text-right font-semibold sm:table-cell">24H Volume</th>
            <th className="px-4 py-3 text-right font-semibold">Last Price</th>
            <th className="px-4 py-3 text-center font-semibold">Trigger</th>
            <th className="px-4 py-3 text-center font-semibold">Alerts</th>
            <th className="px-4 py-3 text-center font-semibold">Order Type</th>
            <th className="px-4 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr className="pointer-events-none">
            <td className="sr-only" />
          </tr>
          {filteredRows.map((row, i) => {
            const handleProps = {
              onDragStart: (e: React.DragEvent<HTMLButtonElement>) => {
                e.dataTransfer.effectAllowed = "move";
                setDragIndex(i);
                setDragSymbol(row.symbol);

                // Create custom drag preview (clone of the row)
                const button = e.currentTarget;
                const rowElement = button.closest("tr");
                if (rowElement) {
                  const clone = rowElement.cloneNode(true) as HTMLTableRowElement;
                  // Style the clone for drag preview
                  clone.style.position = "absolute";
                  clone.style.top = "-9999px";
                  clone.style.left = "-9999px";
                  clone.style.opacity = "0.9";
                  clone.style.pointerEvents = "none";
                  clone.style.zIndex = "9999";
                  // Remove any drag handlers from the clone to avoid issues
                  clone.querySelectorAll("[draggable]").forEach((el) => el.removeAttribute("draggable"));
                  document.body.appendChild(clone);
                  dragPreviewRef.current = clone;

                  // Set custom drag image (offset so cursor is near the drag handle)
                  const rect = button.getBoundingClientRect();
                  const rowRect = rowElement.getBoundingClientRect();
                  const offsetX = rect.left - rowRect.left + rect.width / 2;
                  const offsetY = rect.top - rowRect.top + rect.height / 2;
                  e.dataTransfer.setDragImage(clone, offsetX, offsetY);
                }
              },
              onDragOver: (e: React.DragEvent) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                dragOverIndex.current = i;
                dragOverSymbol.current = row.symbol;
              },
              onDragEnd: (e: React.DragEvent) => {
                // Clean up drag preview
                if (dragPreviewRef.current) {
                  dragPreviewRef.current.remove();
                  dragPreviewRef.current = null;
                }
                handleDrop();
              },
              onDrop: (e: React.DragEvent) => {
                e.preventDefault();
                dragOverIndex.current = i;
                dragOverSymbol.current = row.symbol;
                handleDrop();
              },
            };
            return (
              <WatchlistRow
                key={row.symbol}
                row={row}
                tick={ticks[row.symbol]}
                onEdit={onEdit}
                onRemove={onRemove}
                dragHandleProps={handleProps}
                isDragging={dragIndex === i}
              />
            );
          })}
        </tbody>
      </table>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
          <div className="text-3xl">📡</div>
          <p className="text-sm text-slate-500">Watchlist is empty. Add a pair to get started.</p>
        </div>
      ) : null}
    </div>
  );
}