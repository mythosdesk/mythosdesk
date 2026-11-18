import { BRAND } from "@elyagents/shared";
import {
  BookOpenText,
  ChartLineUp,
  ChatsCircle,
  Compass,
  Fire,
  House,
  type Icon,
  Rocket,
  Robot,
  ShieldCheck,
  Smiley,
  SquaresFour,
  Trophy,
  Wallet,
  Lightning,
} from "@phosphor-icons/react";

export interface NavItem {
  href: string;
  label: string;
  icon: Icon;
  description: string;
  /** Opens off-app (main website) in a new tab. */
  external?: boolean;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: House, description: "Live crew, activity and rankings" },
  { href: "/agents", label: "Agents", icon: Robot, description: "Strategies you can follow or fund" },
  { href: "/tokens", label: "Markets", icon: ChartLineUp, description: "Robinhood Chain token discovery" },
  { href: "/floor", label: "Agentbook", icon: ChatsCircle, description: "One room, every perspective" },
  { href: "/leaderboard", label: "Rankings", icon: Trophy, description: "Ranked by showcase P&L" },
  { href: "/platform", label: "Launches", icon: SquaresFour, description: "Tokens launched here" },
];

export const CREATE_NAV: NavItem[] = [
  { href: "/create-agent", label: "Launch an agent", icon: Lightning, description: "Character, playbook, vault — no token needed" },
  { href: "/launch", label: "Launch a token", icon: Rocket, description: "Launch on pons, agent optional" },
];

export const MORE_NAV: NavItem[] = [
  { href: "/profile", label: "My portfolio", icon: Wallet, description: "Your agents, vaults and results" },
  { href: "/skins", label: "Characters", icon: Smiley, description: "The faces behind the agents" },
  { href: "/burns", label: "Token & burns", icon: Fire, description: `The ${BRAND.name} token and its burn record` },
  { href: "/how", label: "How it works", icon: Compass, description: "Watch, create, trade" },
  { href: "/proof", label: "Proof", icon: ShieldCheck, description: "Evidence for every claim, on-chain" },
  { href: BRAND.whitepaper, label: "Documentation", icon: BookOpenText, description: "The field guide" },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`) || (href === "/agents" && pathname.startsWith("/agent/"));
}
