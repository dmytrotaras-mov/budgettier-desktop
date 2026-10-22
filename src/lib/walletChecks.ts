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

/** Signed effect of a transaction on a wallet's balance. */
export function effectOn(t: any, walletId: string): number {
  const a = parseFloat(t.amount);
  if (t.type === "income") return t.walletId === walletId ? a : 0;
  if (t.type === "expense") return t.walletId === walletId ? -a : 0;
  return (t.toWalletId === walletId ? a : 0) - (t.fromWalletId === walletId ? a : 0);
}

/** A wallet's balance from the given transactions, up to and including `at`. */
export function balanceAt(walletId: string, transactions: any[], at: number): number {
  let sum = 0;
  for (const t of transactions) if (new Date(t.date).getTime() <= at) sum += effectOn(t, walletId);
  return Math.round(sum * 100) / 100;
}

/**
 * diff = Budgettier − bank at the time of the check. With `transactions`, the
 * Budgettier side is recomputed from today's history, so editing an old
 * transaction shows up as "off" instead of keeping a stale ✓.
 */
export function checkState(check: WalletCheck | undefined, now = new Date(), transactions?: any[]): CheckState {
  if (!check) return { kind: "never" };
  const days = differenceInCalendarDays(now, new Date(check.checkedAt));
  const app = transactions ? balanceAt(check.walletId, transactions, check.checkedAt) : parseFloat(check.appBalance);
  const diff = Math.round((app - parseFloat(check.bankBalance)) * 100) / 100;
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

export interface CheckpointImpact {
  walletId: string;
  check: WalletCheck;
  /** Budgettier − bank at the check after the change. */
  newDiff: number;
}

/**
 * Which matching balance checks a change would break: `before` is the stored
 * transaction, `after` the edited one (null = deleted). Only wallets whose
 * balance at the check time actually changes count — editing a category or a
 * note never warns.
 */
export function checkpointImpact(checks: WalletCheck[], transactions: any[], before: any, after: any | null): CheckpointImpact[] {
  const touched = new Set(
    [before, after].filter(Boolean).flatMap((t: any) => [t.walletId, t.fromWalletId, t.toWalletId]).filter(Boolean),
  );
  const out: CheckpointImpact[] = [];
  for (const check of checks) {
    if (!touched.has(check.walletId)) continue;
    const state = checkState(check, new Date(), transactions);
    if (state.kind !== "ok" && state.kind !== "due") continue; // only checks that currently match
    const at = check.checkedAt;
    const part = (t: any | null) => (t && new Date(t.date).getTime() <= at ? effectOn(t, check.walletId) : 0);
    const delta = Math.round((part(after) - part(before)) * 100) / 100;
    if (Math.abs(delta) >= 0.01) out.push({ walletId: check.walletId, check, newDiff: delta });
  }
  return out;
}
