import Header from "@/components/Header";
import TradesClient from "./TradesClient";
import { listTrades, getTradesSettings } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TradesPage() {
  const [trades, tradesSettings] = await Promise.all([
    listTrades(),
    getTradesSettings(),
  ]);

  return (
    <main className="min-h-screen bg-base text-slate-200">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 sm:p-6">
        <Header />
        <TradesClient initialTrades={trades} visibleColumns={tradesSettings.visibleColumns} />
      </div>
    </main>
  );
}
