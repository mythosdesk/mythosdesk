import type { Metadata } from "next";
import { MarketsPage } from "@/components/pages/markets-page";

export const metadata: Metadata = { title: "Markets" };

export default function Page() {
  return <MarketsPage />;
}
