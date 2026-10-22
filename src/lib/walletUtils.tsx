// How a wallet looks: its own color and emoji if the user picked them,
// otherwise its type's default color and icon. Used everywhere a wallet shows.

import { Banknote, Building2, ChartLine, CreditCard, PiggyBank } from "lucide-react";
import { EntityIcon } from "@/components/ui/entity-icon";

export const WALLET_TYPES: Record<string, { label: string; icon: typeof Banknote; color: string }> = {
  bank: { label: "Bank", icon: Building2, color: "#2a78d6" },
  cash: { label: "Cash", icon: Banknote, color: "#eda100" },
  savings: { label: "Savings", icon: PiggyBank, color: "#1baf7a" },
  investment: { label: "Investments", icon: ChartLine, color: "#6250d6" },
  credit: { label: "Credit card", icon: CreditCard, color: "#64748b" },
};

export const walletType = (type: string) => WALLET_TYPES[type] ?? WALLET_TYPES.cash;

export interface WalletLookInput {
  type: string;
  color?: string | null;
  emoji?: string | null;
}

export const walletColor = (w: WalletLookInput) => w.color || walletType(w.type).color;

/** Emojis that suit money places, shown first in the wallet icon picker. */
export const WALLET_EMOJI: [string, string][] = [
  ["🏦", "bank"], ["💳", "card credit debit"], ["💶", "euro cash"], ["💵", "dollar cash"],
  ["💰", "money bag"], ["👛", "purse wallet"], ["👝", "pouch"], ["🐷", "piggy savings"],
  ["📈", "investments stocks"], ["🪙", "coin crypto"], ["💎", "gem"], ["🏧", "atm"],
  ["🔐", "safe locked"], ["💼", "work business"], ["🏠", "home"], ["✈️", "travel"],
  ["🎁", "gifts"], ["👩", "partner"], ["👶", "kids"], ["🌍", "abroad"],
];

/** The wallet's icon tile: emoji if set, else the type's icon in the wallet's color. */
export function WalletIcon({ wallet, size = 36 }: { wallet: WalletLookInput; size?: number }) {
  const color = walletColor(wallet);
  const Icon = walletType(wallet.type).icon;
  return (
    <EntityIcon
      emoji={wallet.emoji || <Icon size={Math.round(size * 0.47)} color={color} />}
      color={color}
      size={size}
    />
  );
}
