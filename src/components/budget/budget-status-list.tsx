// Budget panel: a pinned "left to spend" summary with the month's pace, and each
// budgeted category as a compact row, either grouped by status (what needs
// attention first) or by section. Rows share the app's category look: emoji
// on a tile in the group's color, thin progress bar. The bar's color (and the
// section a row sits in) is the status — never the tile.

import { useState, type ReactElement, type ReactNode } from "react";
import { POSITIVE, NEGATIVE } from "@/lib/colors";
import { ChevronDown, Check } from "lucide-react";
import { Pointer } from "@/components/ui/pointer";
import { EntityIcon } from "@/components/ui/entity-icon";

export type BudgetView = "status" | "groups";

export interface BudgetItem {
  id: string;
  name: string;
  emoji: string;
  section: string;
  spent: number;
  budget: number;
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
  view: BudgetView;
  sectionOrder: (section: string) => number;
  /** A group's color: tints each row's icon, and the dot in the Groups view. */
  groupColor?: (section: string) => string;
  /** Share of the month already gone (0–1), or null for a future month. */
  pace: number | null;
  formatCurrency: (amount: number) => string;
  onEdit: (id: string) => void;
  /** Rendered under the list: spending outside the budget / Flex. */
  footer?: ReactNode;
}

export function BudgetStatusList({
  items,
  view,
  sectionOrder,
  groupColor,
  pace,
  formatCurrency,
  onEdit,
  footer,
}: Props) {
  const money = (n: number) => formatCurrency(Math.round(n)).replace(/\.00$/, "");

  const withStatus = items.map((item) => ({ item, status: statusOf(item) }));
  const byStatus = (st: Status) =>
    withStatus
      .filter((x) => x.status === st)
      .sort((a, b) => b.item.spent / (b.item.budget || 1) - a.item.spent / (a.item.budget || 1));

  const row = ({ item, status }: { item: BudgetItem; status: Status }) => (
    <BudgetRow key={item.id} item={item} status={status} color={groupColor?.(item.section)} pace={pace} money={money} onClick={() => onEdit(item.id)} />
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

      {footer}
    </div>
  );
}

/** Where the month's money goes, for the summary bar. */
export interface MonthPlan {
  /** Income the month is planned around (see IncomeMenu), and where it comes from. */
  income: number;
  /** e.g. "regular income", "last month's income", "set for October". */
  incomeLabel: string;
  /** The user turned the savings part off. */
  incomeOff: boolean;
  /** Income still arriving (counting only what came in so far): a shortfall
   *  means "more needs to come in", not "you spend more than you earn". */
  incomeProvisional: boolean;
  /** Flex budget: its limit and what categories without their own limit spent. */
  flex: { limit: number; spent: number } | null;
  /** Spending outside the budget (only when there's no Flex budget). */
  outside: number;
  /** A finished month: the plan is what actually happened. */
  past: boolean;
}

/**
 * The pinned month header: money left to spend, and one bar for the whole
 * month — income split into spent / still to spend by the budget / what you
 * save if the rest of the month goes to plan.
 */
export function BudgetSummary({
  items,
  plan,
  monthName,
  pace,
  daysLeft,
  formatCurrency,
  incomeControl,
}: {
  items: BudgetItem[];
  plan: MonthPlan;
  /** Wraps the income caption in the menu that changes it. */
  incomeControl?: (trigger: ReactElement) => ReactNode;
  monthName: string;
  pace: number | null;
  daysLeft: number | null;
  formatCurrency: (amount: number) => string;
}) {
  const money = (n: number) => formatCurrency(Math.round(n)).replace(/\.00$/, "");
  const flexLimit = plan.flex?.limit ?? 0;
  const flexSpent = plan.flex?.spent ?? 0;
  const totalBudget = items.reduce((s, i) => s + i.budget, 0) + flexLimit;
  const totalSpent = items.reduce((s, i) => s + i.spent, 0) + flexSpent;
  const left = totalBudget - totalSpent;
  const perDay = daysLeft && daysLeft > 0 && left > 0 ? left / daysLeft : null;

  // The rest of the month "to plan": every limit gets used (or stays
  // overspent), Flex likewise, and spending outside the budget stays as is.
  const spentNow = totalSpent + plan.outside;
  const plannedOut = plan.past
    ? spentNow
    : items.reduce((s, i) => s + Math.max(i.spent, i.budget), 0) + Math.max(flexSpent, flexLimit) + plan.outside;
  const save = plan.income - plannedOut;
  const hasIncome = !plan.incomeOff && plan.income > 0;
  const control = incomeControl ?? ((t: ReactElement) => t);
  const scale = Math.max(hasIncome ? plan.income : 0, plannedOut, 1);
  const pct = (n: number) => `${(Math.max(n, 0) / scale) * 100}%`;
  const over = spentNow > plannedOut - 0.005 && !plan.past && left < 0;

  return (
    <div className="min-w-0" style={{ contain: "inline-size" }} title={`${monthName}: spent ${money(totalSpent)} of ${money(totalBudget)}`}>
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

      {hasIncome ? (
        <>
          <div className="relative mt-2.5 flex h-2 gap-[2px]" aria-label="Month plan">
            <div className="h-full rounded-l-full" style={{ width: pct(spentNow), backgroundColor: over ? STATUS_COLOR.over : "#111827" }} />
            {plannedOut - spentNow > 0.5 && <div className="h-full" style={{ width: pct(plannedOut - spentNow), backgroundColor: "#D1D5DB" }} />}
            {save > 0.5 && <div className="h-full rounded-r-full" style={{ width: pct(save), backgroundColor: POSITIVE }} />}
            {save < -0.5 && (
              <div
                className="absolute rounded-full"
                style={{ left: pct(plan.income), top: -3, bottom: -3, width: 2, backgroundColor: plan.incomeProvisional ? "#B45309" : STATUS_COLOR.over }}
                title="Your income"
              />
            )}
            {pace !== null && pace > 0 && pace < 1 && <TodayMarker left={pct(pace * plannedOut)} pace={pace} monthName={monthName} color="#111827" pointer />}
          </div>
          <div className="mt-1.5 flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[11px] tabular-nums">
            <span className="inline-flex items-center gap-1 text-gray-500">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: over ? STATUS_COLOR.over : "#111827" }} />
              Spent {money(spentNow)}
            </span>
            {!plan.past && plannedOut - spentNow > 0.5 && (
              <span className="inline-flex items-center gap-1 text-gray-500">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#D1D5DB" }} />
                To spend {money(plannedOut - spentNow)}
              </span>
            )}
            {(() => {
              const color = save >= 0 ? POSITIVE : plan.incomeProvisional ? "#B45309" : STATUS_COLOR.over;
              return (
                <span className="inline-flex items-center gap-1 font-medium" style={{ color }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                  {save >= 0
                    ? `${plan.past ? "Saved" : "Save"} ${money(save)}`
                    : plan.incomeProvisional
                      ? `Needs ${money(-save)} more income`
                      : `${money(-save)} more than you earn`}
                </span>
              );
            })()}
            {control(
              <button type="button" className="ml-auto rounded-full px-1.5 -mr-1.5 text-gray-400 underline decoration-dotted underline-offset-2 hover:bg-gray-100 hover:text-black" title="Change how income is planned">
                of {money(plan.income)} {plan.incomeLabel}
              </button>,
            )}
          </div>
        </>
      ) : (
        <>
          <ProgressBar share={totalBudget > 0 ? totalSpent / totalBudget : 0} pace={pace} color={left < 0 ? STATUS_COLOR.over : "#000"} height={6} className="mt-2.5" />
          <div className="flex justify-between text-[11px] text-gray-400 mt-1 tabular-nums">
            <span>Spent {money(totalSpent)} · {totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0}%</span>
            {control(
              <button type="button" className="rounded-full px-1.5 -mr-1.5 underline decoration-dotted underline-offset-2 hover:bg-gray-100 hover:text-black">
                {plan.incomeOff ? "Show savings" : "Set income to see savings"}
              </button>,
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * "Today" on a bar: a small pointer above it, never crossing the bar. The
 * month bar's pointer is ink; a category row's takes the row's status colour,
 * so the pointers line up into one quiet "today" column down the list.
 */
function TodayMarker({ left, pace, monthName, color, pointer }: { left: string; pace: number; monthName?: string; color: string; pointer?: boolean }) {
  const label = `Today · ${Math.round(pace * 100)}% of ${monthName ?? "the month"} gone`;
  const w = pointer ? 9 : 7;
  return (
    <div className="absolute" style={{ left, top: 0, bottom: 0, width: 0 }} title={label} aria-label={label}>
      <div className="absolute flex" style={{ left: -w / 2, top: pointer ? -8 : -6 }}>
        <Pointer w={w} color={color} />
      </div>
    </div>
  );
}

function ProgressBar({
  share,
  pace,
  color,
  markerColor,
  height = 4,
  className = "",
}: {
  share: number;
  pace: number | null;
  color: string;
  /** Today pointer colour; defaults to the bar colour. */
  markerColor?: string;
  height?: number;
  className?: string;
}) {
  return (
    <div className={`relative rounded-full bg-gray-100 ${className}`} style={{ height }}>
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
        style={{ width: `${Math.min(Math.max(share, 0), 1) * 100}%`, backgroundColor: color }}
      />
      {pace !== null && pace > 0 && pace < 1 && <TodayMarker left={`${pace * 100}%`} pace={pace} color={markerColor ?? color} />}
    </div>
  );
}

function BudgetRow({
  item,
  status,
  color,
  pace,
  money,
  onClick,
}: {
  item: BudgetItem;
  status: Status;
  color?: string;
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
      <EntityIcon emoji={item.emoji} color={color} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">{item.name}</span>
          <span className="text-sm font-semibold tabular-nums flex-shrink-0">{right}</span>
        </div>
        <ProgressBar
          share={share}
          pace={pace}
          color={STATUS_COLOR[status]}
          markerColor={status === "unused" ? "#D1D5DB" : STATUS_COLOR[status]}
          className="mt-1.5"
        />
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
