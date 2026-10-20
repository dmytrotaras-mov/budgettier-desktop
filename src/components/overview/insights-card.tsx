// Insights: a handful of plain-language takeaways computed from the data —
// where the month is heading, budget overruns, the biggest category change,
// when income usually lands, and savings so far this year.

import { useMemo } from "react";
import { POSITIVE, NEGATIVE } from "@/lib/colors";
import { endOfMonth, format, getDaysInMonth, isSameMonth, startOfMonth, subMonths } from "date-fns";
import { AlertTriangle, CalendarClock, PiggyBank, Sparkles, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { OverviewCard } from "./overview-card";

type Tone = "good" | "warn" | "bad" | "neutral";
interface Insight {
  id: string;
  tone: Tone;
  icon: typeof Sparkles;
  title: string;
  detail: string;
}

const TONE: Record<Tone, { bg: string; fg: string }> = {
  good: { bg: "#ECFDF5", fg: POSITIVE },
  warn: { bg: "#FFFBEB", fg: "#B45309" },
  bad: { bg: "#FEF2F2", fg: NEGATIVE },
  neutral: { bg: "#F3F4F6", fg: "#374151" },
};

interface Props {
  transactions: any[]; // all transactions
  categories: any[];
  selectedDate: Date;
  viewMode: "month" | "year";
  budget?: { exists: boolean; allocations: { categoryId: string | null; allocatedAmount: string }[] } | null;
  formatCurrency: (n: number) => string;
}

const counts = (t: any) => !t.excludeFromBudget && !t.isOpening;
const ordinal = (d: number) => {
  const s = d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";
  return `${d}${s}`;
};

export function InsightsCard({ transactions, categories, selectedDate, viewMode, budget, formatCurrency }: Props) {
  const money = (n: number) => formatCurrency(Math.round(n)).replace(/\.00$/, "");

  const insights = useMemo(() => {
    const out: Insight[] = [];
    const tx = transactions.filter(counts).map((t) => ({ ...t, d: new Date(t.date), a: parseFloat(t.amount) }));
    const catName = (id: string) => categories.find((c) => c.id === id)?.name?.trim() ?? "Other";
    const now = new Date();
    const inRange = (t: any, from: Date, to: Date) => t.d >= from && t.d <= to;
    const sum = (list: any[], type: string) => list.filter((t) => t.type === type).reduce((s, t) => s + t.a, 0);

    const year = selectedDate.getFullYear();
    const yearEnd = viewMode === "month" ? endOfMonth(selectedDate) : new Date(year, 11, 31, 23, 59, 59);
    const ytd = tx.filter((t) => inRange(t, new Date(year, 0, 1), yearEnd));
    const ytdIncome = sum(ytd, "income");
    const ytdSaved = ytdIncome - sum(ytd, "expense");

    if (viewMode === "month") {
      const mStart = startOfMonth(selectedDate);
      const mEnd = endOfMonth(selectedDate);
      const isNow = isSameMonth(selectedDate, now);
      const day = isNow ? now.getDate() : getDaysInMonth(selectedDate);
      const month = tx.filter((t) => inRange(t, mStart, mEnd));
      const spent = sum(month, "expense");
      const income = sum(month, "income");

      // History: the six months before the selected one.
      const history = Array.from({ length: 6 }, (_, i) => {
        const s = startOfMonth(subMonths(selectedDate, i + 1));
        const list = tx.filter((t) => inRange(t, s, endOfMonth(s)));
        const toDay = list.filter((t) => t.d.getDate() <= day);
        return { list, total: sum(list, "expense"), toDay: sum(toDay, "expense"), income: sum(list, "income") };
      }).filter((h) => h.list.length > 0);

      // 1. Where the month is heading.
      if (history.length >= 3 && spent > 0) {
        const avgTotal = history.reduce((s, h) => s + h.total, 0) / history.length;
        const avgToDay = history.reduce((s, h) => s + h.toDay, 0) / history.length;
        if (isNow) {
          const projected = spent + Math.max(0, avgTotal - avgToDay);
          const higher = projected > avgTotal * 1.05;
          out.push({
            id: "pace",
            tone: higher ? "warn" : "good",
            icon: higher ? TrendingUp : TrendingDown,
            title: `On track to spend about ${money(projected)}`,
            detail: `You usually spend ${money(avgTotal)} by the end of the month`,
          });
        } else {
          const diff = spent - avgTotal;
          out.push({
            id: "pace",
            tone: diff > avgTotal * 0.05 ? "warn" : "good",
            icon: diff > 0 ? TrendingUp : TrendingDown,
            title: `Spent ${money(spent)} in ${format(selectedDate, "MMMM")}`,
            detail: `${money(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than a usual month (${money(avgTotal)})`,
          });
        }
      }

      // 2. Budget overruns for this month.
      if (budget?.exists && budget.allocations.length) {
        const spentBy = new Map<string, number>();
        for (const t of month) if (t.type === "expense" && t.categoryId) spentBy.set(t.categoryId, (spentBy.get(t.categoryId) ?? 0) + t.a);
        const over = budget.allocations
          .filter((a) => a.categoryId)
          .map((a) => {
            const limitFor = parseFloat(a.allocatedAmount);
            return { id: a.categoryId!, over: (spentBy.get(a.categoryId!) ?? 0) - limitFor, limit: limitFor };
          })
          // Same rule as the Budget panel: within 2% of the limit is "paid as planned".
          .filter((x) => x.over > Math.max(0.5, x.limit * 0.02))
          .sort((a, b) => b.over - a.over);
        const limit = budget.allocations.reduce((s, a) => s + parseFloat(a.allocatedAmount), 0);
        const budgeted = budget.allocations.reduce((s, a) => s + (a.categoryId ? spentBy.get(a.categoryId) ?? 0 : 0), 0);
        out.push(
          over.length
            ? {
                id: "budget",
                tone: "bad",
                icon: AlertTriangle,
                title: `${over.length} ${over.length === 1 ? "category is" : "categories are"} over budget`,
                detail: over.slice(0, 2).map((o) => `${catName(o.id)} +${money(o.over)}`).join(" · "),
              }
            : {
                id: "budget",
                tone: "good",
                icon: Sparkles,
                title: "Every category is within budget",
                detail: `${money(Math.max(0, limit - budgeted))} of ${money(limit)} left`,
              },
        );
      }

      // 3. Biggest category change vs the same point last month.
      const prevStart = startOfMonth(subMonths(selectedDate, 1));
      const prev = tx.filter((t) => inRange(t, prevStart, endOfMonth(prevStart)) && t.d.getDate() <= day);
      if (prev.length) {
        const byCat = (list: any[]) => {
          const m = new Map<string, number>();
          for (const t of list) if (t.type === "expense" && t.categoryId) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.a);
          return m;
        };
        const cur = byCat(month);
        const old = byCat(prev);
        const ids = new Set([...cur.keys(), ...old.keys()]);
        const change = [...ids]
          .map((id) => ({ id, diff: (cur.get(id) ?? 0) - (old.get(id) ?? 0) }))
          .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0];
        if (change && Math.abs(change.diff) >= 20) {
          const up = change.diff > 0;
          out.push({
            id: "change",
            tone: up ? "warn" : "good",
            icon: up ? TrendingUp : TrendingDown,
            title: `${catName(change.id)} ${up ? "up" : "down"} ${money(Math.abs(change.diff))}`,
            detail: `Compared with the same point in ${format(prevStart, "MMMM")}`,
          });
        }
      }

      // 4. Income: has it arrived, and when does it usually land?
      const avgIncome = history.length ? history.reduce((s, h) => s + h.income, 0) / history.length : 0;
      if (isNow && avgIncome > 0 && income < avgIncome * 0.5) {
        const days = history
          .map((h) => h.list.filter((t: any) => t.type === "income").sort((a: any, b: any) => b.a - a.a)[0]?.d.getDate())
          .filter(Boolean)
          .sort((a, b) => a - b);
        const typical = days[Math.floor(days.length / 2)];
        out.push({
          id: "income",
          tone: "neutral",
          icon: CalendarClock,
          title: "No salary this month yet",
          detail: typical ? `It usually arrives around the ${ordinal(typical)}` : `Usually about ${money(avgIncome)} a month`,
        });
      }
    } else {
      // Year view: top category and the best month.
      const byCat = new Map<string, number>();
      for (const t of ytd) if (t.type === "expense" && t.categoryId) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.a);
      const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) {
        out.push({
          id: "top",
          tone: "neutral",
          icon: Wallet,
          title: `${catName(top[0])} is the biggest expense`,
          detail: `${money(top[1])} in ${year} · ${Math.round((top[1] / Math.max(1, sum(ytd, "expense"))) * 100)}% of spending`,
        });
      }
      const months = Array.from({ length: 12 }, (_, m) => {
        const list = ytd.filter((t) => t.d.getMonth() === m);
        return { m, list, saved: sum(list, "income") - sum(list, "expense") };
      }).filter((x) => x.list.length);
      if (months.length >= 2) {
        const best = [...months].sort((a, b) => b.saved - a.saved)[0];
        const avgSpend = months.reduce((s, x) => s + sum(x.list, "expense"), 0) / months.length;
        out.push({
          id: "best",
          tone: "good",
          icon: Sparkles,
          title: `${format(new Date(year, best.m, 1), "MMMM")} was the best month`,
          detail: `Saved ${money(best.saved)} · you spend about ${money(avgSpend)} a month`,
        });
      }
    }

    // 5. Savings so far this year.
    if (ytdIncome > 0 || ytdSaved !== 0) {
      out.push({
        id: "savings",
        tone: ytdSaved >= 0 ? "good" : "bad",
        icon: PiggyBank,
        title: `${ytdSaved >= 0 ? "Saved" : "Overspent"} ${money(Math.abs(ytdSaved))} in ${year} so far`,
        detail: ytdIncome > 0 ? `${Math.round((ytdSaved / ytdIncome) * 100)}% of ${money(ytdIncome)} income` : "No income recorded this year",
      });
    }

    return out.slice(0, 4);
  }, [transactions, categories, selectedDate, viewMode, budget]);

  return (
    <OverviewCard
      title="Insights"
      subtitle={viewMode === "month" ? `What stands out in ${format(selectedDate, "MMMM")}` : `What stands out in ${selectedDate.getFullYear()}`}
      className="overview-panel"
      style={{ aspectRatio: "525 / 310.5" }}
    >
      <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-1">
        {insights.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Not enough data yet — insights appear as you add transactions.</p>
        ) : (
          insights.map(({ id, tone, icon: Icon, title, detail }) => (
            <div key={id} className="flex items-center gap-3 py-2">
              <span
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: TONE[tone].bg, color: TONE[tone].fg }}
              >
                <Icon size={17} />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{title}</div>
                <div className="text-xs text-gray-500 truncate">{detail}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </OverviewCard>
  );
}
