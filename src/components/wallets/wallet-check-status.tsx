// One line under a wallet's name saying whether it matches the bank.

import { format } from "date-fns";
import { Check, AlertCircle, Clock } from "lucide-react";
import { NEGATIVE, POSITIVE } from "@/lib/colors";
import type { CheckState } from "@/lib/walletChecks";

export function WalletCheckStatus({ state, money }: { state: CheckState; money: (n: number) => string }) {
  if (state.kind === "never") return <span className="text-gray-400">Not checked yet</span>;
  const when = state.days === 0 ? "today" : format(new Date(state.check.checkedAt), "d MMM");
  if (state.kind === "ok")
    return (
      <span className="inline-flex items-center gap-1" style={{ color: POSITIVE }}>
        <Check size={12} strokeWidth={3} /> Checked {when}
      </span>
    );
  if (state.kind === "due")
    return (
      <span className="inline-flex items-center gap-1 text-amber-700">
        <Clock size={12} /> Checked {Math.round(state.days / 7)} weeks ago
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1" style={{ color: NEGATIVE }}>
      <AlertCircle size={12} /> Off by {money(Math.abs(state.diff))} · {when}
    </span>
  );
}
