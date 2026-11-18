import type { Metadata } from "next";
import { LaunchesPage } from "@/components/pages/launches-page";

export const metadata: Metadata = { title: "Launches" };

export default function Page() {
  return <LaunchesPage />;
}
