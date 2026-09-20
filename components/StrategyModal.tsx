"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import type { StrategyRow, TickerData, WatchlistJoined, OrderType } from "@/lib/db";
import { cn, formatPrice } from "@/lib/utils";

type StrategyModalProps = {
  row: WatchlistJoined;
  tick: TickerData | undefined;
  onClose: () => void;
  onSaved: (row: WatchlistJoined) => void;
};

const emptyForm = {
  triggerPrice: "",
  entryPrice: "",
  tpPrice: "",
  slPrice: "",
  orderType: "LIMIT" as OrderType,
};

export default function StrategyModal({ row, tick, onClose, onSaved }: StrategyModalProps) {
  const strategy: StrategyRow | null = row.strategy;

  const [form, setForm] = useState(() => ({
    triggerPrice: strategy?.trigger_price != null ? String(strategy.trigger_price) : "",
    entryPrice: strategy?.entry_price != null ? String(strategy.entry_price) : "",
    tpPrice: strategy?.tp_price != null ? String(strategy.tp_price) : "",
    slPrice: strategy?.sl_price != null ? String(strategy.sl_price) : "",
    orderType: (strategy?.order_type as OrderType) ?? "LIMIT",
  }));
  const [saving, setSaving] = useState(false);
  const [maxLeverage, setMaxLeverage] = useState<number | null>(null);

  // Load the MEXC max leverage for this contract.
  useEffect(() => {
    let cancelled = false;
    setMaxLeverage(null);
    const controller = new AbortController();
    fetch(`/api/mexc/leverage?symbol=${encodeURIComponent(row.symbol)}`, {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) {
          setMaxLeverage(json.data == null ? null : Number(json.data));
        }
      })
      .catch(() => {
        /* leave null on failure or cancel */
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [row.symbol]);

  // Resync form when an existing strategy loads later.
  useEffect(() => {
    if (strategy) {
      setForm({
        triggerPrice: strategy.trigger_price != null ? String(strategy.trigger_price) : "",
        entryPrice: strategy.entry_price != null ? String(strategy.entry_price) : "",
        tpPrice: strategy.tp_price != null ? String(strategy.tp_price) : "",
        slPrice: strategy.sl_price != null ? String(strategy.sl_price) : "",
        orderType: (strategy.order_type as OrderType) ?? "LIMIT",
      });
    }
  }, [row.symbol, strategy]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (form.triggerPrice === "" && form.tpPrice === "" && form.slPrice === "") {
      toast.error("Set at least one of trigger, TP or SL price");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: row.symbol,
          triggerPrice: form.triggerPrice === "" ? null : Number(form.triggerPrice),
          entryPrice: form.entryPrice === "" ? null : Number(form.entryPrice),
          tpPrice: form.tpPrice === "" ? null : Number(form.tpPrice),
          slPrice: form.slPrice === "" ? null : Number(form.slPrice),
          orderType: form.orderType,
          // reset fired flags on save so alarms re-arm with new targets
          triggerFired: false,
          tpFired: false,
          slFired: false,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save strategy");
      toast.success("Strategy saved");
      onSaved({ ...row, strategy: json.data });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save strategy");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      const res = await fetch(`/api/strategy/${encodeURIComponent(row.symbol)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to remove strategy");
      toast.success("Strategy removed");
      onSaved({ ...row, strategy: null });
      setForm({ ...emptyForm });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove strategy");
    } finally {
      setSaving(false);
    }
  }

  const live = tick;

  const inputCls =
    "w-full rounded-lg border border-borderline bg-base/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none transition focus:border-emerald/50";

  const selectCls =
    "w-full rounded-lg border border-borderline bg-base/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none transition focus:border-emerald/50 appearance-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-borderline bg-[#0b1020] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-mono text-lg font-bold text-slate-100">{row.symbol}</h2>
            <p className="text-xs text-slate-500">Strategy Planning</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 transition hover:bg-surface hover:text-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Live tick metrics */}
        <div className="mb-6 grid grid-cols-2 gap-2">
          <Metric label="Last" value={live ? formatPrice(live.lastPrice) : "—"} accent />
          <Metric label="Fair" value={live ? formatPrice(live.fairPrice) : "—"} />
          <Metric label="Leverage" value={maxLeverage != null ? `${maxLeverage}x` : "—"} />
          <Metric
            label="24h Change"
            value={live ? (live.riseFallRate >= 0 ? "+" : "") + (live.riseFallRate * 100).toFixed(2) + "%" : "—"}
            accent={live ? live.riseFallRate >= 0 : false}
            inverse
          />
        </div>

        {/* Trigger alarm */}
        <div className="mb-5 rounded-xl border border-borderline bg-surface/40 p-3">
          <label className="mb-2 block text-xs font-semibold text-slate-400">Trigger Alarm</label>
          <input
            placeholder="Trigger price (fires on cross in either direction)"
            value={form.triggerPrice}
            onChange={(e) => set("triggerPrice", e.target.value)}
            inputMode="decimal"
            className={inputCls}
          />
        </div>

        {/* Order Type */}
        <div className="mb-5 rounded-xl border border-borderline bg-surface/40 p-3">
          <label className="mb-2 block text-xs font-semibold text-slate-400">Order Type</label>
          <select
            value={form.orderType}
            onChange={(e) => set("orderType", e.target.value as OrderType)}
            className={selectCls}
          >
            <option value="LIMIT">Limit Order</option>
            <option value="MARKET">Market Order</option>
            <option value="TRIGGER_LIMIT">Trigger Limit Order</option>
          </select>
        </div>

        {/* Prices */}
        <div className="mb-6 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-400">Entry Price</span>
            <input
              placeholder="0.000000"
              value={form.entryPrice}
              onChange={(e) => set("entryPrice", e.target.value)}
              inputMode="decimal"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-emerald">Take Profit (TP)</span>
            <input
              placeholder="0.000000"
              value={form.tpPrice}
              onChange={(e) => set("tpPrice", e.target.value)}
              inputMode="decimal"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-rose">Stop Loss (SL)</span>
            <input
              placeholder="0.000000"
              value={form.slPrice}
              onChange={(e) => set("slPrice", e.target.value)}
              inputMode="decimal"
              className={inputCls}
            />
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-lg bg-emerald px-4 py-2.5 text-sm font-bold text-black transition hover:bg-emerald/90 disabled:opacity-40"
          >
            {saving ? "Saving…" : strategy ? "Save Strategy" : "Create Strategy"}
          </button>
          {strategy ? (
            <button
              onClick={handleClear}
              disabled={saving}
              className="rounded-lg border border-rose/40 bg-rose/10 px-4 py-2.5 text-sm font-semibold text-rose transition hover:bg-rose/20 disabled:opacity-40"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
  inverse,
}: {
  label: string;
  value: string;
  accent?: boolean;
  inverse?: boolean;
}) {
  const positive = accent && !inverse;
  const negative = accent && inverse;
  return (
    <div className="rounded-lg border border-borderline bg-surface/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div
        className={cn(
          "font-mono text-sm font-semibold tabular-nums",
          positive ? "text-emerald" : negative ? "text-rose" : "text-slate-100"
        )}
      >
        {value}
      </div>
    </div>
  );
}