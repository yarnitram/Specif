"use client";

import { useState } from "react";
import { toast } from "sonner";
import { TrendingDown, TrendingUp, X } from "lucide-react";
import type { OrderType, Position, TradeAlertType, TradeRow } from "@/lib/db";
import { cn, formatPrice, formatUtcTimestamp, pctFromEntry, sideMismatch } from "@/lib/utils";

type TradeModalProps = {
  trade: TradeRow;
  onClose: () => void;
  onSaved: (trade: TradeRow) => void;
};

const alertLabels: Record<TradeAlertType, { label: string; className: string }> = {
  TRIGGER: { label: "Trigger", className: "text-amber-400" },
  TP: { label: "Take Profit", className: "text-emerald" },
  SL: { label: "Stop Loss", className: "text-rose" },
};

const inputCls =
  "w-full rounded-lg border border-borderline bg-base/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none transition focus:border-emerald/50";

const selectCls = `${inputCls} appearance-none`;

/** "" clears the field (sent as null), otherwise the parsed number. */
function toNum(v: string): number | null {
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Side-aware move from entry to a level (positive = in profit for that side). */
function MoveBox({ label, value }: { label: string; value: number | null }) {
  const positive = value != null && value > 0;
  const negative = value != null && value < 0;
  return (
    <div className="rounded-lg border border-borderline bg-surface/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div
        className={cn(
          "font-mono text-sm font-semibold tabular-nums",
          positive ? "text-emerald" : negative ? "text-rose" : "text-slate-100"
        )}
      >
        {value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`}
      </div>
    </div>
  );
}

/**
 * Editor for a recorded trade. The alarm engine's capture (symbol, which alert
 * fired, when, and the last price it saw) stays visible at the top as context;
 * everything else can be corrected here.
 */
export default function TradeModal({ trade, onClose, onSaved }: TradeModalProps) {
  const [form, setForm] = useState({
    position: trade.position as Position,
    orderType: trade.order_type as OrderType,
    alertType: trade.alert_type as TradeAlertType,
    leverage: trade.leverage != null ? String(trade.leverage) : "",
    lastPrice: trade.last_price != null ? String(trade.last_price) : "",
    entryPrice: trade.entry_price != null ? String(trade.entry_price) : "",
    tpPrice: trade.tp_price != null ? String(trade.tp_price) : "",
    slPrice: trade.sl_price != null ? String(trade.sl_price) : "",
    margin: trade.margin != null ? String(trade.margin) : "",
  });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const entry = toNum(form.entryPrice);
  const tp = toNum(form.tpPrice);
  const sl = toNum(form.slPrice);
  const mismatch = sideMismatch(form.position, entry, tp, sl);
  const tpMove = pctFromEntry(form.position, entry, tp);
  const slMove = pctFromEntry(form.position, entry, sl);
  const capture = alertLabels[trade.alert_type] ?? alertLabels.TRIGGER;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/trades/${trade.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          position: form.position,
          orderType: form.orderType,
          alertType: form.alertType,
          leverage: toNum(form.leverage),
          lastPrice: toNum(form.lastPrice),
          entryPrice: entry,
          tpPrice: tp,
          slPrice: sl,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to update trade");
      toast.success(`${trade.symbol} trade updated`);
      onSaved(json.data as TradeRow);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update trade");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-borderline bg-[#0b1020] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-mono text-lg font-bold text-slate-100">{trade.symbol}</h2>
            <p className="text-xs text-slate-500">Trade Details</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition hover:bg-surface hover:text-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* What the alarm engine recorded - context, always read-only */}
        <div className="mb-5 rounded-xl border border-borderline bg-surface/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            Captured by the alarm engine
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
            <span className={cn("font-semibold", capture.className)}>{capture.label}</span>
            <span className="text-slate-400">{formatUtcTimestamp(trade.created_at)}</span>
            <span className="text-slate-400">last {formatPrice(trade.last_price, 6)}</span>
          </div>
        </div>

        {/* Position */}
        <div className="mb-5 rounded-xl border border-borderline bg-surface/40 p-3">
          <label className="mb-2 block text-xs font-semibold text-slate-400">Position</label>
          <div className="grid grid-cols-2 gap-2">
            {(["LONG", "SHORT"] as const).map((side) => {
              const active = form.position === side;
              const Icon = side === "LONG" ? TrendingUp : TrendingDown;
              return (
                <button
                  key={side}
                  onClick={() => setForm((prev) => ({ ...prev, position: side }))}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 font-mono text-sm font-bold transition",
                    active
                      ? side === "LONG"
                        ? "border-emerald/50 bg-emerald/10 text-emerald"
                        : "border-rose/50 bg-rose/10 text-rose"
                      : "border-borderline bg-base/60 text-slate-400 hover:text-slate-200"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {side}
                </button>
              );
            })}
          </div>
        </div>

        {/* Order type + which alarm this row came from */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-400">Order Type</span>
            <select
              value={form.orderType}
              onChange={(e) => set("orderType", e.target.value)}
              className={selectCls}
            >
              <option value="LIMIT">Limit</option>
              <option value="MARKET">Market</option>
              <option value="TRIGGER_LIMIT">Trigger Limit</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-400">Alert</span>
            <select
              value={form.alertType}
              onChange={(e) => set("alertType", e.target.value)}
              className={selectCls}
            >
              <option value="TRIGGER">Trigger</option>
              <option value="TP">Take Profit</option>
              <option value="SL">Stop Loss</option>
            </select>
          </label>
        </div>

        {/* Prices + leverage */}
        <div className="mb-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-400">Leverage</span>
              <input
                placeholder="0"
                value={form.leverage}
                onChange={(e) => set("leverage", e.target.value)}
                inputMode="decimal"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-400">Last Price</span>
              <input
                placeholder="0.000000"
                value={form.lastPrice}
                onChange={(e) => set("lastPrice", e.target.value)}
                inputMode="decimal"
                className={inputCls}
              />
            </label>
          </div>
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

        {/* Distance from entry, side-aware */}
        {tpMove != null || slMove != null ? (
          <div className="mb-5 grid grid-cols-2 gap-2">
            <MoveBox label="TP from entry" value={tpMove} />
            <MoveBox label="SL from entry" value={slMove} />
          </div>
        ) : null}

        {mismatch ? <p className="mb-4 text-[11px] font-mono text-amber-400">⚠ {mismatch}</p> : null}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-lg bg-emerald px-4 py-2.5 text-sm font-bold text-black transition hover:bg-emerald/90 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-borderline bg-base/60 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:text-slate-100 disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
