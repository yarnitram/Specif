"use client";

import { useState } from "react";
import TradesTable from "@/components/TradesTable";
import TradeModal from "@/components/TradeModal";
import type { TradeRow } from "@/lib/db";

type TradesClientProps = {
  initialTrades: TradeRow[];
  visibleColumns: string[];
};

export default function TradesClient({ initialTrades, visibleColumns }: TradesClientProps) {
  const [editingTrade, setEditingTrade] = useState<TradeRow | null>(null);

  function handleEdit(trade: TradeRow) {
    setEditingTrade(trade);
  }

  function handleClose() {
    setEditingTrade(null);
  }

  function handleSaved() {
    setEditingTrade(null);
  }

  return (
    <>
      <TradesTable
        initialTrades={initialTrades}
        visibleColumns={visibleColumns}
        onEdit={handleEdit}
      />
      {editingTrade && (
        <TradeModal trade={editingTrade} onClose={handleClose} onSaved={handleSaved} />
      )}
    </>
  );
}