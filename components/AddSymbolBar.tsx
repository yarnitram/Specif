"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Search, Flame, Sparkles, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type MexcSymbolInfo = {
  symbol: string;
  baseCoin: string;
  displayNameEn: string;
  isHot: boolean;
  isNew: boolean;
};

type AddSymbolBarProps = {
  onAdd: (symbol: string) => Promise<void>;
};

export default function AddSymbolBar({ onAdd }: AddSymbolBarProps) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<MexcSymbolInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [busySymbol, setBusySymbol] = useState<string | null>(null);
  const [addedSymbol, setAddedSymbol] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchToken = useRef(0);

  // Load suggestions from the MEXC symbol catalog.
  const loadSuggestions = useCallback(async (query: string) => {
    const token = ++searchToken.current;
    setLoading(true);
    try {
      const q = query.trim();
      const res = await fetch(
        `/api/mexc/symbols${q ? `?search=${encodeURIComponent(q)}` : ""}`
      );
      const json = await res.json();
      if (token !== searchToken.current) return; // stale response
      if (res.ok && Array.isArray(json.data)) {
        setSuggestions(json.data);
      } else {
        setSuggestions([]);
      }
    } catch {
      if (token === searchToken.current) setSuggestions([]);
    } finally {
      if (token === searchToken.current) setLoading(false);
    }
  }, []);

  // Debounced search as the user types.
  useEffect(() => {
    const t = setTimeout(() => {
      loadSuggestions(value);
    }, value ? 150 : 0);
    return () => clearTimeout(t);
  }, [value, loadSuggestions]);

  // Reset highlight when the list changes.
  useEffect(() => {
    setHighlight(0);
  }, [suggestions, value]);

  // Close the picker when clicking outside the widget.
  useEffect(() => {
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, []);

  const filtered = useMemo(() => suggestions, [suggestions]);

  async function handlePick(symbol: string) {
    if (busySymbol) return;
    setBusySymbol(symbol);
    try {
      await onAdd(symbol);
      setAddedSymbol(symbol);
      setValue("");
      setOpen(false);
      setTimeout(() => setAddedSymbol(null), 1500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add symbol");
    } finally {
      setBusySymbol(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[highlight];
      if (item) void handlePick(item.symbol);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  function handleFocus() {
    setOpen(true);
    if (suggestions.length === 0) void loadSuggestions(value);
  }

  return (
    <div className="relative" ref={containerRef}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-borderline bg-surface/60 px-3 py-2 backdrop-blur transition",
          open ? "border-emerald/40" : "border-borderline"
        )}
      >
        <Search className="h-4 w-4 text-slate-500" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder="Search tokens to add…"
          className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-500 outline-none font-mono"
          spellCheck={false}
        />
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
        ) : (
          <span className="text-[11px] text-slate-600 font-mono">
            {filtered.length}
          </span>
        )}
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-80 overflow-y-auto rounded-xl border border-borderline bg-[#0b1020] py-1 shadow-2xl">
          {loading && suggestions.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading tokens…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-500">
              No matching tokens.
            </div>
          ) : (
            filtered.map((s, i) => {
              const isHighlighted = i === highlight;
              const isBusy = busySymbol === s.symbol;
              const isAdded = addedSymbol === s.symbol;
              return (
                <button
                  key={s.symbol}
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => void handlePick(s.symbol)}
                  disabled={isBusy}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition",
                    isHighlighted ? "bg-surface" : "bg-transparent"
                  )}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        "font-mono text-sm font-semibold",
                        isAdded ? "text-emerald" : "text-slate-100"
                      )}
                    >
                      {s.symbol}
                    </span>
                    {s.isHot ? (
                      <span className="inline-flex items-center gap-0.5 rounded bg-rose/10 px-1 py-px text-[9px] font-bold text-rose font-mono">
                        <Flame className="h-2.5 w-2.5" /> HOT
                      </span>
                    ) : null}
                    {s.isNew ? (
                      <span className="inline-flex items-center gap-0.5 rounded bg-blue-500/10 px-1 py-px text-[9px] font-bold text-blue-400 font-mono">
                        <Sparkles className="h-2.5 w-2.5" /> NEW
                      </span>
                    ) : null}
                  </span>
                  {isBusy ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />
                  ) : isAdded ? (
                    <Check className="h-4 w-4 shrink-0 text-emerald" />
                  ) : (
                    <span className="shrink-0 text-[10px] text-slate-600 font-mono">+</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}