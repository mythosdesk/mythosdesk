import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentDetailPage } from "@/components/pages/agent-detail-page";

export const metadata: Metadata = { title: "Agent" };

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton mt-10 h-[70vh] rounded-[1.75rem]" />}>
      <AgentDetailPage />
    </Suspense>
  );
}
