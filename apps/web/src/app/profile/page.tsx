import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfilePage } from "@/components/pages/profile-page";

export const metadata: Metadata = { title: "My portfolio" };

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton mt-10 h-[70vh] rounded-[1.75rem]" />}>
      <ProfilePage />
    </Suspense>
  );
}
