"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { TrendingDown, TrendingUp, X } from "lucide-react";
import type {
  StrategyRow,
  TickerData,
  WatchlistJoined,
  OrderType,
  Position,
  TriggerDirection,
} from "@/lib/db";
import { cn, formatPrice, sideMismatch } from "@/lib/utils";

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

  // Side + direction are derived from the live price at save time (see `derived`
  // below); these hold manual overrides on top of that.
  const [overrides, setOverrides] = useState<{
    position?: Position;
    direction?: TriggerDirection;
  }>({});

  /**
   * The rule the alarm arms with, snapshotted from the live price when saved:
   *   last price ABOVE the trigger -> wait for a drop to it (BELOW, LONG)
   *   last price BELOW the trigger -> wait for a rise to it (ABOVE, SHORT)
   */
  const derived = useMemo(() => {
    const t = form.triggerPrice === "" ? null : Number(form.triggerPrice);
    const lp = tick?.lastPrice ?? null;
    if (t == null || lp == null || !Number.isFinite(t) || !Number.isFinite(lp)) return null;
    const direction: TriggerDirection = lp >= t ? "BELOW" : "ABOVE";
    return {
      lastPrice: lp,
      triggerPrice: t,
      direction,
      position: (direction === "BELOW" ? "LONG" : "SHORT") as Position,
    };
  }, [form.triggerPrice, tick?.lastPrice]);

  const effectivePosition: Position =
    overrides.position ?? derived?.position ?? strategy?.position ?? "LONG";
  const effectiveDirection: TriggerDirection =
    overrides.direction ?? derived?.direction ?? strategy?.trigger_direction ?? "BOTH";
  const positionIsAuto = overrides.position == null && derived != null;
  const directionIsAuto = overrides.direction == null && derived != null;

  const mismatch = sideMismatch(
    effectivePosition,
    form.entryPrice === "" ? null : Number(form.entryPrice),
    form.tpPrice === "" ? null : Number(form.tpPrice),
    form.slPrice === "" ? null : Number(form.slPrice)
  );

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
    // A trigger has to know which way price must cross. That comes from the live
    // price at save time - or from an explicit direction override.
    if (form.triggerPrice !== "" && derived == null && overrides.direction == null) {
      toast.error("Waiting for a live price — pick a trigger direction to override");
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
          position: effectivePosition,
          triggerDirection: effectiveDirection,
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
      setOverrides({});
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
            placeholder="Trigger price (level to watch)"
            value={form.triggerPrice}
            onChange={(e) => set("triggerPrice", e.target.value)}
            inputMode="decimal"
            className={inputCls}
          />
          {/* The rule this trigger arms with, snapshotted from the live price at save time */}
          <p className="mt-2 text-[11px] font-mono leading-relaxed text-slate-500">
            {derived ? (
              <>
                Last <span className="text-slate-300">{formatPrice(derived.lastPrice, 6)}</span> is{" "}
                <span className={derived.direction === "BELOW" ? "text-rose" : "text-emerald"}>
                  {derived.direction === "BELOW" ? "above" : "below"}
                </span>{" "}
                trigger <span className="text-slate-300">{formatPrice(derived.triggerPrice, 6)}</span>{" "}
                → fires when price crosses{" "}
                <span className="text-slate-300">
                  {derived.direction === "BELOW" ? "DOWN to" : "UP to"}{" "}
                  {formatPrice(derived.triggerPrice, 6)}
                </span>{" "}
                · <span className="text-slate-300">{effectivePosition}</span>
              </>
            ) : (
              <>Waiting for a live price to auto-detect the direction — pick one below to override.</>
            )}
          </p>
        </div>

        {/* Position + trigger direction (auto-derived, overridable) */}
        <div className="mb-5 rounded-xl border border-borderline bg-surface/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-xs font-semibold text-slate-400">Position</label>
            {positionIsAuto ? (
              <span className="text-[10px] font-mono text-slate-500">auto from live price</span>
            ) : overrides.position ? (
              <button
                onClick={() => setOverrides((o) => ({ ...o, position: undefined }))}
                className="text-[10px] font-mono text-emerald transition hover:underline"
              >
                reset to auto
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["LONG", "SHORT"] as const).map((side) => {
              const active = effectivePosition === side;
              const Icon = side === "LONG" ? TrendingUp : TrendingDown;
              return (
                <button
                  key={side}
                  onClick={() => setOverrides((o) => ({ ...o, position: side }))}
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

          <div className="mb-2 mt-4 flex items-center justify-between">
            <label className="block text-xs font-semibold text-slate-400">Trigger Direction</label>
            {directionIsAuto ? (
              <span className="text-[10px] font-mono text-slate-500">auto from live price</span>
            ) : overrides.direction ? (
              <button
                onClick={() => setOverrides((o) => ({ ...o, direction: undefined }))}
                className="text-[10px] font-mono text-emerald transition hover:underline"
              >
                reset to auto
              </button>
            ) : null}
          </div>
          <select
            value={effectiveDirection}
            onChange={(e) => setOverrides((o) => ({ ...o, direction: e.target.value as TriggerDirection }))}
            className={selectCls}
          >
            <option value="BELOW">Below — fires when price drops to the trigger</option>
            <option value="ABOVE">Above — fires when price rises to the trigger</option>
            <option value="BOTH">Either direction</option>
          </select>

          {mismatch ? <p className="mt-2 text-[11px] font-mono text-amber-400">⚠ {mismatch}</p> : null}
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