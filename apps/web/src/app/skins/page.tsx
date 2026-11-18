import type { Metadata } from "next";
import { SkinsPage } from "@/components/pages/skins-page";

export const metadata: Metadata = { title: "Characters" };

export default function Page() {
  return <SkinsPage />;
}
