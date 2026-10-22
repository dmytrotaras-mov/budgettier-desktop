// Wallets: where the money is. A share bar across wallets, then one compact row
// per wallet with its balance, share and how much it moved in the selected period.

import { useMemo } from "react";
import { POSITIVE, NEGATIVE } from "@/lib/colors";
import { useLocation } from "wouter";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { OverviewCard } from "./overview-card";
import { WalletIcon, walletColor, walletType } from "@/lib/walletUtils";

interface Props {
  wallets: any[];
  transactions: any[]; // all transactions
  selectedDate: Date;
  viewMode: "month" | "year";
  formatCurrency: (n: number) => string;
}

export function WalletsCard({ wallets, transactions, selectedDate, viewMode, formatCurrency }: Props) {
  const [, navigate] = useLocation();
  const money = (n: number) => formatCurrency(Math.round(n)).replace(/\.00$/, "");
  const period = viewMode === "month" ? `in ${format(selectedDate, "MMMM")}` : `in ${selectedDate.getFullYear()}`;

  const rows = useMemo(() => {
    const from = viewMode === "month" ? startOfMonth(selectedDate) : new Date(selectedDate.getFullYear(), 0, 1);
    const to = viewMode === "month" ? endOfMonth(selectedDate) : new Date(selectedDate.getFullYear(), 11, 31, 23, 59, 59);
    const flow = new Map<string, number>();
    const add = (id: string | null, v: number) => id && flow.set(id, (flow.get(id) ?? 0) + v);
    for (const t of transactions) {
      if (t.isOpening) continue;
      const d = new Date(t.date);
      if (d < from || d > to) continue;
      const a = parseFloat(t.amount);
      if (t.type === "income") add(t.walletId, a);
      else if (t.type === "expense") add(t.walletId, -a);
      else if (t.type === "transfer") {
        add(t.toWalletId, a);
        add(t.fromWalletId, -a);
      }
    }
    return wallets
      .map((w) => ({ ...w, balance: parseFloat(w.balance || "0"), change: flow.get(w.id) ?? 0 }))
      .sort((a, b) => b.balance - a.balance);
  }, [wallets, transactions, selectedDate, viewMode]);

  const total = rows.reduce((s, w) => s + w.balance, 0);
  const positive = rows.filter((w) => w.balance > 0);
  const positiveTotal = positive.reduce((s, w) => s + w.balance, 0);

  const openSettings = () => {
    try {
      localStorage.setItem("settingsActiveTab", "wallets");
    } catch {
      // Falls back to the last-used Settings tab.
    }
    navigate("/settings");
  };

  return (
    <OverviewCard
      title="Wallets"
      subtitle={`${money(total)} across ${rows.length} ${rows.length === 1 ? "wallet" : "wallets"}`}
      className="overview-panel"
      style={{ aspectRatio: "525 / 310.5" }}
      actions={
        <button
          type="button"
          onClick={openSettings}
          className="h-9 px-4 rounded-full bg-[#F3F4F6] text-[13px] font-medium text-black hover:bg-black hover:text-white transition-colors"
        >
          Manage
        </button>
      }
    >
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {positiveTotal > 0 && (
          <div className="flex h-2 rounded-full overflow-hidden gap-0.5 mb-2" title="Share of total balance">
            {positive.map((w) => (
              <div
                key={w.id}
                style={{ width: `${(w.balance / positiveTotal) * 100}%`, backgroundColor: walletColor(w) }}
                title={`${w.name}: ${money(w.balance)}`}
              />
            ))}
          </div>
        )}
        <div className="flex flex-col">
          {rows.map((w) => {
            const t = walletType(w.type);
            const share = positiveTotal > 0 && w.balance > 0 ? Math.round((w.balance / positiveTotal) * 100) : null;
            return (
              <div key={w.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-b-0">
                <WalletIcon wallet={w} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{w.name}</div>
                  <div className="text-[11px] text-gray-500 truncate">
                    {t.label}
                    {share !== null && ` · ${share}%`}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-semibold tabular-nums" style={{ color: w.balance < 0 ? NEGATIVE : "#111827" }}>
                    {w.balance < 0 ? "−" : ""}{money(Math.abs(w.balance))}
                  </div>
                  <div className="text-[11px] tabular-nums" style={{ color: w.change > 0 ? POSITIVE : w.change < 0 ? NEGATIVE : "#9CA3AF" }}>
                    {w.change === 0 ? "—" : `${w.change > 0 ? "+" : "−"}${money(Math.abs(w.change))} ${period}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </OverviewCard>
  );
}
