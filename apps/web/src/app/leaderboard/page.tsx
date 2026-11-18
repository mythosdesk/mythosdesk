import type { Metadata } from "next";
import { LeaderboardPage } from "@/components/pages/leaderboard-page";

export const metadata: Metadata = { title: "Rankings" };

export default function Page() {
  return <LeaderboardPage />;
}
