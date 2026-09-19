import { listWatchlist } from "@/lib/db";
import Terminal from "@/components/Terminal";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialRows = await listWatchlist();
  return <Terminal initialRows={initialRows} />;
}