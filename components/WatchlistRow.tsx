"use client";

import { Settings2, Trash2, Flame, Zap } from "lucide-react";
import type { StrategyRow, TickerData, WatchlistJoined, OrderType, TriggerDirection } from "@/lib/db";
import { cn, formatPercent, formatPrice, formatVolume } from "@/lib/utils";
import PositionBadge from "./PositionBadge";

type WatchlistRowProps = {
  row: WatchlistJoined;
  tick: TickerData | undefined;
  onEdit: (row: WatchlistJoined) => void;
  onRemove: (row: WatchlistJoined) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  isDragging?: boolean;
};

function ChangeBadge({ value }: { value: number | undefined }) {
  if (value === undefined || Number.isNaN(value)) {
    return <span className="font-mono text-xs text-slate-600">—</span>;
  }
  const positive = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold font-mono tabular-nums",
        positive ? "bg-emerald/10 text-emerald" : "bg-rose/10 text-rose"
      )}
    >
      {positive ? "+" : ""}
      {formatPercent(value)}
    </span>
  );
}

function FiredBadge({ label, fired }: { label: string; fired: boolean }) {
  if (!fired) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 font-mono">
      <Flame className="h-3 w-3" />
      {label}
    </span>
  );
}

const orderTypeColors: Record<OrderType, string> = {
  LIMIT: "bg-blue/10 text-blue",
  MARKET: "bg-purple/10 text-purple",
  TRIGGER_LIMIT: "bg-orange/10 text-orange",
};

/** Arrow showing which crossing of the trigger arms the alarm. */
const directionGlyph: Record<TriggerDirection, string> = {
  ABOVE: "↑",
  BELOW: "↓",
  BOTH: "↕",
};

const directionHint: Record<TriggerDirection, string> = {
  ABOVE: "Fires when price crosses UP to the trigger",
  BELOW: "Fires when price crosses DOWN to the trigger",
  BOTH: "Fires on a cross in either direction",
};

export default function WatchlistRow({ row, tick, onEdit, onRemove, dragHandleProps, isDragging }: WatchlistRowProps) {
  const strategy: StrategyRow | null = row.strategy;

  // Alert status: "Triggered" if any alarm fired, "Ongoing" if strategy exists but nothing fired
  const anyFired = strategy && (strategy.trigger_fired || strategy.tp_fired || strategy.sl_fired);
  const hasStrategy = !!strategy;

  return (
    <tr
      className={cn(
        "group border-t border-borderline transition-colors",
        isDragging ? "opacity-50" : "hover:bg-surface/40"
      )}
    >
      {/* Symbol + drag handle */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            {...dragHandleProps}
            draggable={true}
            title="Drag to reorder"
            className="cursor-grab text-slate-600 opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
          >
            ⠿
          </button>
          <span className="font-mono text-sm font-semibold text-slate-100">{row.symbol}</span>
        </div>
      </td>

      {/* Position (auto-derived from the live price when the strategy is saved) */}
      <td className="hidden px-4 py-3 text-center sm:table-cell">
        <PositionBadge position={strategy?.position} />
      </td>

      {/* 24h change */}
      <td className="px-4 py-3 text-right">
        <ChangeBadge value={tick?.riseFallRate} />
      </td>

      {/* 24H Volume */}
      <td className="hidden px-4 py-3 text-right font-mono text-sm tabular-nums text-slate-300 sm:table-cell">
        {tick ? formatVolume(tick.amount24) : "—"}
      </td>

      {/* Last price */}
      <td className="px-4 py-3 text-right">
        <span className="font-mono text-sm tabular-nums text-slate-100">
          {tick ? formatPrice(tick.lastPrice, 6) : "—"}
        </span>
      </td>

      {/* Trigger price + the crossing that will fire it */}
      <td className="px-4 py-3 text-center">
        {strategy && strategy.trigger_price != null ? (
          <div className="flex items-center justify-center gap-1.5">
            <span className="font-mono text-sm tabular-nums text-emerald">
              {formatPrice(strategy.trigger_price, 6)}
            </span>
            <span
              title={directionHint[strategy.trigger_direction] ?? directionHint.BOTH}
              className="font-mono text-xs text-slate-500"
            >
              {directionGlyph[strategy.trigger_direction] ?? directionGlyph.BOTH}
            </span>
          </div>
        ) : (
          <span className="font-mono text-xs text-slate-600">—</span>
        )}
      </td>

      {/* Alerts status */}
      <td className="px-4 py-3 text-center">
        {hasStrategy ? (
          anyFired ? (
            <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold font-mono bg-rose/10 text-rose">
              Triggered
            </span>
          ) : (
            <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold font-mono bg-emerald/10 text-emerald">
              Ongoing
            </span>
          )
        ) : (
          <span className="font-mono text-xs text-slate-600">—</span>
        )}
      </td>

      {/* Order Type */}
      <td className="px-4 py-3 text-center">
        {hasStrategy ? (
          <span className={cn(
            "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold font-mono",
            orderTypeColors[strategy.order_type as OrderType] || "bg-slate/10 text-slate-400"
          )}>
            <Zap className="h-3 w-3 mr-1" />
            {strategy.order_type.replace("_", " ")}
          </span>
        ) : (
          <span className="font-mono text-xs text-slate-600">—</span>
        )}
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => onEdit(row)}
            title="Strategy"
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-surface hover:text-emerald"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => onRemove(row)}
            title="Remove"
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose/10 hover:text-rose"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}