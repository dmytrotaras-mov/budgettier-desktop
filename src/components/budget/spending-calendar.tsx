// Month calendar for the transaction panel: a spending heatmap. Each day's
// tile gets darker the more was spent, shows the emoji of its biggest expense
// category, and each week ends with its total. Weeks start on Monday.

import { useMemo } from "react";
import { eachDayOfInterval, endOfMonth, format, getDay, isAfter, isSameDay, isToday, startOfDay, startOfMonth } from "date-fns";
import type { Category, Transaction } from "@shared/schema";

interface Props {
  month: Date;
  transactions: Transaction[];
  categories: Category[];
  formatCurrency: (amount: number) => string;
  onDayClick: (day: Date) => void;
}

interface DayStats {
  income: number;
  expense: number;
  topEmoji: string | null;
  topCategory: string | null;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Heat 0–1 → tile background. Square-root scale so one big bill (rent)
 *  doesn't wash out every other day. */
const heatColor = (t: number) => `rgba(239, 68, 68, ${(0.06 + 0.3 * t).toFixed(3)})`;

export function SpendingCalendar({ month, transactions, categories, formatCurrency, onDayClick }: Props) {
  const money = (n: number) => formatCurrency(Math.round(n)).replace(/\.00$/, "");

  const { weeks, stats, cap } = useMemo(() => {
    const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
    const stats = new Map<string, DayStats>();
    for (const day of days) {
      const dayTx = transactions.filter((t) => isSameDay(new Date(t.date), day));
      const byCategory = new Map<string, number>();
      let income = 0;
      let expense = 0;
      for (const t of dayTx) {
        const amount = parseFloat(t.amount);
        if (t.type === "income") income += amount;
        if (t.type === "expense") {
          expense += amount;
          if (t.categoryId) byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0) + amount);
        }
      }
      const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
      const topCat = top ? categories.find((c) => c.id === top[0]) : undefined;
      stats.set(day.toDateString(), {
        income,
        expense,
        topEmoji: topCat?.emoji ?? null,
        topCategory: topCat?.name ?? null,
      });
    }

    // Scale against the 90th-percentile day, so outliers saturate instead of
    // flattening the rest of the month.
    const spends = [...stats.values()].map((s) => s.expense).filter((e) => e > 0).sort((a, b) => a - b);
    const cap = spends.length ? spends[Math.min(spends.length - 1, Math.floor(spends.length * 0.9))] : 0;

    // Monday-first weeks, padded with nulls outside the month.
    const lead = (getDay(days[0]) + 6) % 7;
    const cells: (Date | null)[] = [...Array(lead).fill(null), ...days];
    while (cells.length % 7) cells.push(null);
    const weeks: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return { weeks, stats, cap };
  }, [month, transactions, categories]);

  const today = startOfDay(new Date());

  return (
    <div className="pt-4">
      <div className="grid gap-1.5 mb-1.5" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr)) 52px" }}>
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400 py-1">
            {d}
          </div>
        ))}
        <div className="text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400 py-1 pr-1">Week</div>
      </div>

      <div className="flex flex-col gap-1.5">
        {weeks.map((week, wi) => {
          const weekSpend = week.reduce((s, d) => s + (d ? stats.get(d.toDateString())?.expense ?? 0 : 0), 0);
          return (
            <div key={wi} className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr)) 52px" }}>
              {week.map((day, di) => {
                if (!day) return <div key={di} />;
                const s = stats.get(day.toDateString())!;
                const future = isAfter(day, today);
                const current = isToday(day);
                const heat = cap > 0 ? Math.min(1, Math.sqrt(s.expense / cap)) : 0;
                const tooltip = [
                  format(day, "EEEE, d MMMM"),
                  s.expense > 0 ? `Spent ${formatCurrency(s.expense)}` : null,
                  s.income > 0 ? `Received ${formatCurrency(s.income)}` : null,
                  s.topCategory ? `Mostly ${s.topCategory}` : null,
                ]
                  .filter(Boolean)
                  .join("\n");
                return (
                  <button
                    key={di}
                    type="button"
                    onClick={() => onDayClick(day)}
                    title={tooltip}
                    className="relative flex flex-col items-start rounded-xl p-1.5 text-left transition-all hover:ring-2 hover:ring-black/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                    style={{
                      minHeight: 64,
                      backgroundColor: s.expense > 0 ? heatColor(heat) : future ? "transparent" : "#F9FAFB",
                    }}
                  >
                    <div className="w-full flex items-start justify-between">
                      <span
                        className={`inline-flex items-center justify-center rounded-full text-[11px] leading-none ${
                          current ? "w-5 h-5 bg-black text-white font-semibold" : future ? "text-gray-300 font-medium" : "text-gray-700 font-medium"
                        }`}
                        style={current ? undefined : { minWidth: 20, height: 20 }}
                      >
                        {format(day, "d")}
                      </span>
                      {s.topEmoji && <span className="text-[13px] leading-none pt-0.5">{s.topEmoji}</span>}
                    </div>
                    <div className="mt-auto w-full leading-tight">
                      {s.income > 0 && (
                        <div className="text-[10px] font-semibold text-emerald-600 tabular-nums">+{money(s.income)}</div>
                      )}
                      {s.expense > 0 && (
                        <div className="text-[11px] font-semibold text-gray-900 tabular-nums">−{money(s.expense)}</div>
                      )}
                    </div>
                  </button>
                );
              })}
              <div className="flex items-center justify-end pr-1 text-[11px] font-medium text-gray-500 tabular-nums">
                {weekSpend > 0 ? `−${money(weekSpend)}` : ""}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-1.5 mt-3 text-[10px] text-gray-400">
        Less
        {[0, 0.33, 0.66, 1].map((t) => (
          <span key={t} className="w-3 h-3 rounded" style={{ backgroundColor: heatColor(t) }} />
        ))}
        More
      </div>
    </div>
  );
}
