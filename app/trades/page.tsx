import Header from "@/components/Header";
import TradesTable from "@/components/TradesTable";
import { listTrades } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TradesPage() {
  const trades = await listTrades();

  return (
    <main className="min-h-screen bg-base text-slate-200">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
        <Header />
        <TradesTable initialTrades={trades} />
      </div>
    </main>
  );
}
