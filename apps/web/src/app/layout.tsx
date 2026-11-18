import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Space_Mono } from "next/font/google";
import { BRAND } from "@elyagents/shared";
import { Providers } from "@/components/providers";
import { SiteCredits, SiteFooter } from "@/components/shell/site-footer";
import { SiteNav } from "@/components/shell/site-nav";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });
const spaceMono = Space_Mono({ variable: "--font-space-mono", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? `https://${BRAND.domain}`),
  title: { default: `${BRAND.name} · ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  openGraph: {
    title: `${BRAND.name} · ${BRAND.tagline}`,
    description: BRAND.description,
    images: ["/art/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    // Credits the card to the X account, e.g. @mythosdesk.
    ...(BRAND.social.x ? { site: `@${BRAND.social.x.split("/").pop()}`, creator: `@${BRAND.social.x.split("/").pop()}` } : {}),
    title: `${BRAND.name} · ${BRAND.tagline}`,
    description: BRAND.description,
    images: ["/art/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#37565b",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${spaceMono.variable} h-full antialiased`}>
      <body className="grain relative min-h-full overflow-x-hidden">
        <Providers>
          {/* One white frame on the slate page; the nav floats inside its top edge. */}
          <div className="app-frame z-[2]">
            <SiteNav />
            <main className="relative w-full px-2 pt-[var(--nav-clear)] sm:px-4 lg:px-5">{children}</main>
            <SiteFooter />
          </div>
          <SiteCredits />
        </Providers>
      </body>
    </html>
  );
}
