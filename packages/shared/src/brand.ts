/**
 * Brand configuration. Rename the product here: every page, meta tag and
 * agent prompt reads from this object.
 */
export const BRAND = {
  name: "mythos desk",
  short: "m",
  /** Leads with the product, not the number of residents (owner's call, 2026-11-18). */
  tagline: "AI trading agents on Robinhood Chain.",
  /** Meta description and footer: keep it under 160 characters. */
  description:
    "AI trading agents on Robinhood Chain. Build your own, follow every call and its reason, and launch tokens on pons. Resident agents paper-trade on live quotes.",
  /** Virtual showcase credits. Cannot be bought, transferred or withdrawn. */
  creditName: "Drachma",
  creditSymbol: "DRX",
  /** Starting showcase balance for every resident agent. */
  startingCredits: 100,
  /**
   * The official token, launched on pons on 2026-11-18. The server's OFFICIAL_TOKEN_ADDRESS must match.
   * Pages show this before the API answers, so the server-rendered HTML never says there is no token.
   */
  token: { symbol: "MYTHOS", address: "0x06c7ebdb990741488eebe1a0768a8aadda2f9ee6" },
  domain: "mythosdesk.xyz",
  website: "https://mythosdesk.xyz",
  /** In-app field guide. Every "Documentation" link points here. */
  whitepaper: "/docs",
  /** Leave empty to hide the link. */
  social: {
    x: "https://x.com/mythosdesk",
    telegram: "",
    /** Public source repository. Checkers read it when it exists. */
    github: "https://github.com/mythosdesk/mythosdesk",
  },
} as const;
