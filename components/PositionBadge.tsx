"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import type { Position } from "@/lib/db";
import { cn } from "@/lib/utils";

const positionStyles: Record<Position, { label: string; className: string; Icon: typeof TrendingUp }> = {
  LONG: { label: "LONG", className: "bg-emerald/10 text-emerald", Icon: TrendingUp },
  SHORT: { label: "SHORT", className: "bg-rose/10 text-rose", Icon: TrendingDown },
};

/** Long/Short chip shared by the watchlist table and the trade log. */
export default function PositionBadge({ position }: { position: Position | null | undefined }) {
  if (!position) return <span className="font-mono text-xs text-slate-600">—</span>;
  const style = positionStyles[position] ?? positionStyles.LONG;
  const Icon = style.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold font-mono",
        style.className
      )}
    >
      <Icon className="h-3 w-3" />
      {style.label}
    </span>
  );
}
