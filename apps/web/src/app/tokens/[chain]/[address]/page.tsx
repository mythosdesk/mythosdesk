import type { Metadata } from "next";
import { Suspense } from "react";
import { TokenPage } from "@/components/pages/token-page";

export const metadata: Metadata = { title: "Token" };

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton mt-10 h-[70vh] rounded-[1.75rem]" />}>
      <TokenPage />
    </Suspense>
  );
}
