// Balance checks on the client: the latest check per wallet and what it means
// for the wallet now (matched, off, due again, never checked).

import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { differenceInCalendarDays } from "date-fns";

export interface WalletCheck {
  id: string;
  walletId: string;
  checkedAt: number;
  bankBalance: string;
  appBalance: string;
  source: "manual" | "statement";
}

export const WALLET_CHECKS_KEY = ["wallet-checks"];
/** A matching check is fresh for this long; after that the wallet is due again. */
export const CHECK_FRESH_DAYS = 30;

export function useWalletChecks() {
  return useQuery<WalletCheck[]>({
    queryKey: WALLET_CHECKS_KEY,
    queryFn: () => invoke<WalletCheck[]>("get_wallet_checks"),
  });
}

export type CheckState =
  | { kind: "never" }
  | { kind: "ok"; check: WalletCheck; days: number }
  | { kind: "due"; check: WalletCheck; days: number }
  | { kind: "off"; check: WalletCheck; days: number; diff: number };

/** diff = Budgettier − bank at the time of the check. */
export function checkState(check: WalletCheck | undefined, now = new Date()): CheckState {
  if (!check) return { kind: "never" };
  const days = differenceInCalendarDays(now, new Date(check.checkedAt));
  const diff = Math.round((parseFloat(check.appBalance) - parseFloat(check.bankBalance)) * 100) / 100;
  if (Math.abs(diff) >= 0.01) return { kind: "off", check, days, diff };
  return days > CHECK_FRESH_DAYS ? { kind: "due", check, days } : { kind: "ok", check, days };
}

/** Wallets that are idle and empty (e.g. a history wallet) don't need checking. */
export function needsChecking(wallet: any, transactions: any[], now = new Date()): boolean {
  if (Math.abs(parseFloat(wallet.balance || "0")) >= 0.01) return true;
  const since = now.getTime() - 90 * 86400000;
  return transactions.some(
    (t) => !t.isOpening && new Date(t.date).getTime() >= since && [t.walletId, t.fromWalletId, t.toWalletId].includes(wallet.id),
  );
}
