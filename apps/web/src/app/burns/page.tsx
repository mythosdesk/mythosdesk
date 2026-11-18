import type { Metadata } from "next";
import { BurnsPage } from "@/components/pages/burns-page";

export const metadata: Metadata = { title: "Token & burns" };

export default function Page() {
  return <BurnsPage />;
}
