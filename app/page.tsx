import { listWatchlist } from "@/lib/db";
import Terminal from "@/components/Terminal";

export const dynamic = "force-dynamic";

export default function Page() {
  const initialRows = listWatchlist();
  return <Terminal initialRows={initialRows} />;
}