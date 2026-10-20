// The stats bar shared by Overview and Budget: income, expenses, savings and
// balance for the selected period, each with the change vs the previous
// period, and a 12-month balance sparkline.

import { useMemo } from "react";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { Line, LineChart, ResponsiveContainer as RechartsResponsiveContainer, Tooltip, YAxis } from "recharts";
import { PiggyBank, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
import { calculateCumulativeBalance } from "@/lib/overviewCalculations";
import { NEGATIVE, POSITIVE } from "@/lib/colors";

/** "▲ 12% vs Sep" under a stat — colored by whether the direction is good. */
function Delta({
  current,
  previous,
  upIsGood,
  label,
  show,
  absolute,
  sinceLabel,
  formatCurrency,
}: {
  current: number;
  previous: number;
  upIsGood: boolean;
  label: string;
  show: boolean;
  absolute?: boolean;
  sinceLabel?: boolean;
  formatCurrency?: (n: number) => string;
}) {
  if (!show) return <div className="h-4" />;
  const diff = current - previous;
  if (Math.abs(diff) < 0.5) return <div className="text-[11px] text-gray-400 h-4">Same as {label}</div>;
  if (!absolute && Math.abs(previous) < 1) return <div className="h-4" />;
  const up = diff > 0;
  const good = up === upIsGood;
  const text = absolute ? `${up ? "+" : "−"}${formatCurrency!(Math.abs(diff))}` : `${Math.round(Math.abs(diff / previous) * 100)}%`;
  return (
    <div className="text-[11px] font-medium h-4 flex items-center gap-1" style={{ color: good ? POSITIVE : NEGATIVE }}>
      {!absolute && <span>{up ? "▲" : "▼"}</span>}
      <span className="tabular-nums">{text}</span>
      <span className="text-gray-400 font-normal">{sinceLabel ? `since ${label}` : `vs ${label}`}</span>
    </div>
  );
}

interface Props {
  selectedDate: Date;
  viewMode: "month" | "year";
  /** Transactions of the selected period. */
  transactions: any[];
  /** All transactions (for comparisons and the balance trend). */
  allTransactions: any[];
  wallets: any[];
}

export function StatsBar({ selectedDate, viewMode, transactions, allTransactions, wallets }: Props) {
  const { formatCurrency } = useCurrency();
  const roundMoney = (n: number) => formatCurrency(Math.round(n)).replace(/\.00$/, "");

  const { totalIncome, totalExpenses } = useMemo(() => {
    let income = 0;
    let expenses = 0;
    for (const t of transactions) {
      if (t.excludeFromBudget) continue;
      const amount = parseFloat(t.amount);
      if (t.type === "income") income += amount;
      else if (t.type === "expense") expenses += amount;
    }
    return { totalIncome: income, totalExpenses: expenses };
  }, [transactions]);

  const balance = useMemo(() => wallets.reduce((sum: number, w: any) => sum + parseFloat(w.balance || "0"), 0), [wallets]);
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;
  // Before the salary lands, a savings *rate* is meaningless (−83 000 %).
  const incomeTooLow = viewMode === "month" && totalExpenses > 0 && totalIncome < totalExpenses * 0.2;

  // ---- Stat tiles: change vs the previous period, balance trend ----
  // An unfinished period is compared with the same stretch of the previous one
  // (e.g. Oct 1–20 vs Sep 1–20), so a salary that hasn't landed yet doesn't
  // look like a collapse.
  const comparison = useMemo(() => {
    const now = new Date();
    let from: Date, to: Date, label: string;
    if (viewMode === "month") {
      const prev = subMonths(selectedDate, 1);
      from = startOfMonth(prev);
      to = endOfMonth(prev);
      if (format(selectedDate, "yyyy-MM") === format(now, "yyyy-MM")) {
        to = new Date(prev.getFullYear(), prev.getMonth(), Math.min(now.getDate(), to.getDate()), 23, 59, 59);
      }
      label = format(prev, "MMM");
    } else {
      const y = selectedDate.getFullYear() - 1;
      from = new Date(y, 0, 1);
      to = selectedDate.getFullYear() === now.getFullYear() ? new Date(y, now.getMonth(), now.getDate(), 23, 59, 59) : new Date(y, 11, 31, 23, 59, 59);
      label = String(y);
    }
    let income = 0, expenses = 0;
    for (const t of allTransactions as any[]) {
      if (t.excludeFromBudget) continue;
      const d = new Date(t.date);
      if (d < from || d > to) continue;
      if (t.type === "income") income += parseFloat(t.amount);
      else if (t.type === "expense") expenses += parseFloat(t.amount);
    }
    const periodStart = viewMode === "month" ? startOfMonth(selectedDate) : new Date(selectedDate.getFullYear(), 0, 1);
    const balanceAtStart = calculateCumulativeBalance(allTransactions, new Date(periodStart.getTime() - 1), balance);
    const hasPrev = income > 0 || expenses > 0;
    return { income, expenses, savings: income - expenses, label, hasPrev, balanceAtStart };
  }, [allTransactions, selectedDate, viewMode, balance]);

  // Month-end balance for the 12 months up to the selected one (sparkline).
  const balanceTrend = useMemo(() => {
    const end = viewMode === "month" ? selectedDate : new Date(selectedDate.getFullYear(), 11, 1);
    const now = new Date();
    const firstTx = (allTransactions as any[]).reduce((min: number, t: any) => Math.min(min, new Date(t.date).getTime()), Infinity);
    return Array.from({ length: 12 }, (_, i) => {
      const m = subMonths(end, 11 - i);
      const monthEnd = endOfMonth(m);
      if (startOfMonth(m) > now || monthEnd.getTime() < firstTx) return { m: format(m, "MMM"), v: null as number | null };
      return { m: format(m, "MMM"), v: calculateCumulativeBalance(allTransactions, monthEnd > now ? now : monthEnd, balance) };
    });
  }, [allTransactions, selectedDate, viewMode, balance]);

  return (
    <div
      className="bg-white w-full gap-[15px] p-[8px] sm:p-[15px] rounded-[12px] sm:rounded-[20px]"
      style={{ minHeight: 80, display: "flex", flexWrap: "wrap", alignItems: "center", marginBottom: 11 }}
    >
      {[
        { label: "Income", icon: TrendingUp, color: POSITIVE, value: totalIncome, prev: comparison.income, upIsGood: true },
        { label: "Expenses", icon: TrendingDown, color: NEGATIVE, value: totalExpenses, prev: comparison.expenses, upIsGood: false },
      ].map(({ label, icon: Icon, color, value, prev, upIsGood }) => (
        <div key={label} className="stat-box flex flex-col justify-center items-center sm:items-start" style={{ flex: "1 1 auto", minWidth: 120 }}>
          <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
            <Icon className="w-[16px] h-[16px] sm:w-[20px] sm:h-[20px]" style={{ color }} />
            <p className="text-[13px] sm:text-[15px]" style={{ fontFamily: "Inter", color: "#000" }}>{label}</p>
          </div>
          <p className="text-[20px] sm:text-[24px]" style={{ fontFamily: "Inter", fontWeight: 700, color: "#000" }}>{formatCurrency(value)}</p>
          <Delta current={value} previous={prev} upIsGood={upIsGood} label={comparison.label} show={comparison.hasPrev} />
        </div>
      ))}

      <div className="stat-box flex flex-col justify-center items-center sm:items-start" style={{ flex: "1 1 auto", minWidth: 120 }}>
        <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
          <PiggyBank className="w-[16px] h-[16px] sm:w-[20px] sm:h-[20px]" style={{ color: "#EDE140" }} />
          <p className="text-[13px] sm:text-[15px]" style={{ fontFamily: "Inter", color: "#000" }}>Savings</p>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-[20px] sm:text-[24px]" style={{ fontFamily: "Inter", fontWeight: 700, color: "#000" }}>
            {formatCurrency(totalIncome - totalExpenses)}
          </p>
          {incomeTooLow ? (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 whitespace-nowrap">no income yet</span>
          ) : (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "#EDE140", color: "#000" }}>
              {savingsRate.toFixed(0)}%
            </span>
          )}
        </div>
        <Delta
          current={totalIncome - totalExpenses}
          previous={comparison.savings}
          upIsGood
          label={comparison.label}
          show={comparison.hasPrev}
          absolute
          formatCurrency={roundMoney}
        />
      </div>

      <div
        className="stat-box flex items-center justify-between gap-3 rounded-[12px] sm:rounded-[20px] p-[10px] sm:p-[16px_20px]"
        style={{ flex: "1 1 auto", backgroundColor: "#F3F4F6", minWidth: 220 }}
      >
        <div className="flex flex-col items-center sm:items-start">
          <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
            <Wallet className="w-[16px] h-[16px] sm:w-[20px] sm:h-[20px]" style={{ color: "#000" }} />
            <p className="text-[13px] sm:text-[15px]" style={{ fontFamily: "Inter", color: "#000" }}>Balance</p>
          </div>
          <p className="text-[20px] sm:text-[24px]" style={{ fontFamily: "Inter", fontWeight: 700, color: "#000" }}>{formatCurrency(balance)}</p>
          <Delta
            current={balance}
            previous={comparison.balanceAtStart}
            upIsGood
            label={viewMode === "month" ? `${format(selectedDate, "MMM")} 1` : "Jan 1"}
            show
            absolute
            sinceLabel
            formatCurrency={roundMoney}
          />
        </div>
        <div className="hidden sm:block w-[110px] h-[44px]" title="Balance at the end of each month">
          <RechartsResponsiveContainer width="100%" height="100%">
            <LineChart data={balanceTrend} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Line
                dataKey="v"
                stroke="#9CA3AF"
                strokeWidth={1.75}
                isAnimationActive={false}
                connectNulls={false}
                dot={(p: any) =>
                  p.index === balanceTrend.length - 1 && p.value != null ? (
                    <circle key={`b-${p.index}`} cx={p.cx} cy={p.cy} r={3.5} fill="#111827" stroke="#F3F4F6" strokeWidth={2} />
                  ) : (
                    <g key={`b-${p.index}`} />
                  )
                }
              />
              <Tooltip
                contentStyle={{ backgroundColor: "white", border: "1px solid #E5E7EB", borderRadius: 10, fontSize: 11, padding: "4px 8px" }}
                labelFormatter={(_, payload: any) => payload?.[0]?.payload?.m ?? ""}
                formatter={(value: any) => [roundMoney(Number(value)), "Balance"]}
              />
            </LineChart>
          </RechartsResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
