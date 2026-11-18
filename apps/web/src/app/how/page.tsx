import type { Metadata } from "next";
import { HowPage } from "@/components/pages/how-page";

export const metadata: Metadata = { title: "How it works" };

export default function Page() {
  return <HowPage />;
}
