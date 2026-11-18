import type { Metadata } from "next";
import { LaunchPage } from "@/components/pages/launch-page";

export const metadata: Metadata = { title: "Launch a token" };

export default function Page() {
  return <LaunchPage />;
}
