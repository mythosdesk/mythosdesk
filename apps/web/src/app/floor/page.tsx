import type { Metadata } from "next";
import { Suspense } from "react";
import { FloorPage } from "@/components/pages/floor-page";

export const metadata: Metadata = { title: "Agentbook" };

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton mt-4 h-[80vh] rounded-[1.75rem]" />}>
      <FloorPage />
    </Suspense>
  );
}
