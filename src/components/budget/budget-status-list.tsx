// Budget panel: a pinned "left to spend" summary with the month's pace, and each
// budgeted category as a compact row, either grouped by status (what needs
// attention first) or by section. Shares the visual language of the Overview
// category breakdown: color stripe, emoji, thin progress bar.

import { useState, type ReactNode } from "react";
import { POSITIVE, NEGATIVE } from "@/lib/colors";
import { ChevronDown, Check, Plus } from "lucide-react";

export type BudgetView = "status" | "groups";

export interface BudgetItem {
  id: string;
  name: string;
  emoji: string;
  section: string;
  spent: number;
  budget: number;
}

export interface UnbudgetedItem {
  categoryId: string;
  name: string;
  spent: number;
}

type Status = "over" | "near" | "ok" | "paid" | "unused";

const NEAR_AT = 0.85; // 85% of a limit counts as "almost used up"
const PAID_TOLERANCE = 0.02; // within ±2% of the limit = a fixed bill paid as planned

const STATUS_COLOR: Record<Status, string> = {
  over: NEGATIVE,
  near: "#F59E0B",
  ok: POSITIVE,
  paid: "#9CA3AF",
  unused: "#E5E7EB",
};

function statusOf({ spent, budget }: BudgetItem): Status {
  if (spent <= 0) return "unused";
  if (budget > 0 && Math.abs(spent - budget) <= budget * PAID_TOLERANCE) return "paid";
  if (spent > budget) return "over";
  if (spent >= budget * NEAR_AT) return "near";
  return "ok";
}

interface Props {
  items: BudgetItem[];
  unbudgeted: UnbudgetedItem[];
  view: BudgetView;
  sectionOrder: (section: string) => number;
  /** A group's color, shown as a dot in the Groups view. */
  groupColor?: (section: string) => string;
  /** Share of the month already gone (0–1), or null for a future month. */
  pace: number | null;
  formatCurrency: (amount: number) => string;
  onEdit: (id: string) => void;
  onAddUnbudgeted: (item: UnbudgetedItem) => void;
}

export function BudgetStatusList({
  items,
  unbudgeted,
  view,
  sectionOrder,
  groupColor,
  pace,
  formatCurrency,
  onEdit,
  onAddUnbudgeted,
}: Props) {
  const unbudgetedTotal = unbudgeted.reduce((s, u) => s + u.spent, 0);
  const money = (n: number) => formatCurrency(Math.round(n)).replace(/\.00$/, "");

  const withStatus = items.map((item) => ({ item, status: statusOf(item) }));
  const byStatus = (st: Status) =>
    withStatus
      .filter((x) => x.status === st)
      .sort((a, b) => b.item.spent / (b.item.budget || 1) - a.item.spent / (a.item.budget || 1));

  const row = ({ item, status }: { item: BudgetItem; status: Status }) => (
    <BudgetRow key={item.id} item={item} status={status} pace={pace} money={money} onClick={() => onEdit(item.id)} />
  );

  return (
    // inline-size containment: long, truncated lines (category names) must
    // not widen the panel — and through it the whole page.
    <div className="min-w-0" style={{ contain: "inline-size" }}>
      {view === "status" ? (
        <>
          <Section title="Over budget" color={STATUS_COLOR.over} rows={byStatus("over")} render={row} />
          <Section title="Almost used up" color="#B45309" rows={byStatus("near")} render={row} />
          <Section title="On track" rows={byStatus("ok")} render={row} />
          <CollapsedSection
            title="Paid this month"
            icon={<Check size={12} className="text-gray-400" />}
            rows={byStatus("paid")}
            money={money}
            render={row}
          />
          <CollapsedSection title="Not used yet" rows={byStatus("unused")} money={money} render={row} />
        </>
      ) : (
        Object.entries(
          withStatus.reduce<Record<string, typeof withStatus>>((acc, x) => {
            (acc[x.item.section] ??= []).push(x);
            return acc;
          }, {}),
        )
          .sort(([a], [b]) => sectionOrder(a) - sectionOrder(b) || a.localeCompare(b))
          .map(([section, rows]) => {
            const spent = rows.reduce((s, r) => s + r.item.spent, 0);
            const budget = rows.reduce((s, r) => s + r.item.budget, 0);
            return (
              <Section
                key={section}
                title={section}
                dot={groupColor?.(section)}
                meta={`${money(spent)} / ${money(budget)}`}
                rows={[...rows].sort((a, b) => b.item.budget - a.item.budget)}
                render={row}
              />
            );
          })
      )}

      {unbudgeted.length > 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-gray-50 p-3 pl-4">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900">
              {money(unbudgetedTotal)} spent outside the budget
            </div>
            <div className="text-xs text-gray-500 truncate">{unbudgeted.map((u) => u.name).join(" · ")}</div>
          </div>
          <button
            onClick={() => onAddUnbudgeted(unbudgeted[0])}
            className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full bg-black pl-3 pr-4 text-[13px] font-medium text-white transition-colors hover:bg-gray-800"
            style={{ height: 36 }}
          >
            <Plus size={15} />
            Add to budget
          </button>
        </div>
      )}
    </div>
  );
}

/** "Left to spend" header — pinned above the scrolling list in the panel. */
export function BudgetSummary({
  items,
  monthName,
  pace,
  daysLeft,
  formatCurrency,
}: {
  items: BudgetItem[];
  monthName: string;
  pace: number | null;
  daysLeft: number | null;
  formatCurrency: (amount: number) => string;
}) {
  const money = (n: number) => formatCurrency(Math.round(n)).replace(/\.00$/, "");
  const totalBudget = items.reduce((s, i) => s + i.budget, 0);
  const totalSpent = items.reduce((s, i) => s + i.spent, 0);
  const left = totalBudget - totalSpent;
  const spentShare = totalBudget > 0 ? totalSpent / totalBudget : 0;
  const perDay = daysLeft && daysLeft > 0 && left > 0 ? left / daysLeft : null;
  return (
    <div
      className="min-w-0"
      style={{ contain: "inline-size" }}
      title={`${monthName}: spent ${money(totalSpent)} of ${money(totalBudget)}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-[22px] leading-none font-semibold tabular-nums" style={{ color: left >= 0 ? "#000" : STATUS_COLOR.over }}>
            {money(Math.abs(left))}
          </span>
          <span className="text-xs text-gray-500 truncate">
            {left >= 0 ? "left" : "over"} of {money(totalBudget)}
          </span>
        </div>
        {daysLeft !== null && daysLeft > 0 && (
          <span className="text-xs text-gray-500 whitespace-nowrap tabular-nums">
            {daysLeft} {daysLeft === 1 ? "day" : "days"} left{perDay !== null && <> · {money(perDay)}/day</>}
          </span>
        )}
      </div>
      <ProgressBar share={spentShare} pace={pace} color={spentShare > 1 ? STATUS_COLOR.over : "#000"} height={6} className="mt-2.5" />
      <div className="flex justify-between text-[11px] text-gray-400 mt-1 tabular-nums">
        <span>Spent {money(totalSpent)} · {Math.round(spentShare * 100)}%</span>
        {pace !== null && <span>{Math.round(pace * 100)}% of the month gone</span>}
      </div>
    </div>
  );
}

function ProgressBar({
  share,
  pace,
  color,
  height = 4,
  className = "",
}: {
  share: number;
  pace: number | null;
  color: string;
  height?: number;
  className?: string;
}) {
  return (
    <div className={`relative rounded-full bg-gray-100 ${className}`} style={{ height }}>
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
        style={{ width: `${Math.min(Math.max(share, 0), 1) * 100}%`, backgroundColor: color }}
      />
      {pace !== null && pace > 0 && pace < 1 && (
        <div
          className="absolute rounded-full bg-gray-400"
          style={{ left: `${pace * 100}%`, top: -3, bottom: -3, width: 1.5 }}
          title="Today"
        />
      )}
    </div>
  );
}

function BudgetRow({
  item,
  status,
  pace,
  money,
  onClick,
}: {
  item: BudgetItem;
  status: Status;
  pace: number | null;
  money: (n: number) => string;
  onClick: () => void;
}) {
  const share = item.budget > 0 ? item.spent / item.budget : 0;
  const diff = item.budget - item.spent;
  const right =
    status === "over" ? (
      <span style={{ color: STATUS_COLOR.over }}>{money(-diff)} over</span>
    ) : status === "paid" ? (
      <span className="text-gray-500">Paid</span>
    ) : (
      <span className="text-gray-900">{money(diff)} left</span>
    );
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-2 py-2 -mx-2 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
    >
      <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLOR[status] }} />
      <span className="text-xl flex-shrink-0">{item.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">{item.name}</span>
          <span className="text-sm font-semibold tabular-nums flex-shrink-0">{right}</span>
        </div>
        <ProgressBar share={share} pace={pace} color={STATUS_COLOR[status]} className="mt-1.5" />
        <div className="text-[11px] text-gray-500 mt-1 tabular-nums">
          {money(item.spent)} of {money(item.budget)}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, color, meta, dot }: { title: string; color?: string; meta?: ReactNode; dot?: string }) {
  return (
    <div className="flex items-center justify-between pt-4 pb-1">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: color ?? "#6B7280" }}>
        {dot && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dot }} />}
        {title}
      </span>
      {meta && <span className="text-[11px] text-gray-500 tabular-nums">{meta}</span>}
    </div>
  );
}

type Row = { item: BudgetItem; status: Status };

function Section({
  title,
  color,
  meta,
  dot,
  rows,
  render,
}: {
  title: string;
  color?: string;
  meta?: ReactNode;
  dot?: string;
  rows: Row[];
  render: (r: Row) => ReactNode;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <SectionHeader title={title} color={color} meta={meta ?? rows.length} dot={dot} />
      {rows.map(render)}
    </div>
  );
}

/** Quiet groups (paid bills, untouched limits): one summary line, expandable. */
function CollapsedSection({
  title,
  icon,
  rows,
  money,
  render,
}: {
  title: string;
  icon?: ReactNode;
  rows: Row[];
  money: (n: number) => string;
  render: (r: Row) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + Math.max(r.item.spent, r.item.budget), 0);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="block w-full min-w-0 text-left focus:outline-none">
        <SectionHeader
          title={title}
          meta={
            <span className="inline-flex items-center gap-1">
              {rows.length} · {money(total)}
              <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
            </span>
          }
        />
        {!open && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 pb-1 min-w-0 overflow-hidden">
            {icon}
            <span className="truncate min-w-0">{rows.map((r) => r.item.name.trim()).join(" · ")}</span>
          </div>
        )}
      </button>
      {open && rows.map(render)}
    </div>
  );
}
