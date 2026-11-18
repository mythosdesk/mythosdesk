import type { Metadata } from "next";
import { Suspense } from "react";
import { CreateAgentPage } from "@/components/pages/create-agent-page";

export const metadata: Metadata = { title: "Launch an agent" };

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton mt-10 h-[70vh] rounded-[1.75rem]" />}>
      <CreateAgentPage />
    </Suspense>
  );
}
