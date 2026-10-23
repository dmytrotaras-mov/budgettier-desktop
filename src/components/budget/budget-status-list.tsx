// Budget panel: a pinned "left to spend" summary for the month, and each
// budgeted category as a compact row, either grouped by status (what needs
// attention first) or by section. Rows share the app's category look: emoji
// on a tile in the group's color, thin progress bar. The bar's color (and the
// section a row sits in) is the status — never the tile.

import { useState, type ReactElement, type ReactNode } from "react";
import { POSITIVE, NEGATIVE } from "@/lib/colors";
import { ChevronDown, ChevronRight, Check } from "lucide-react";
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

/** The colour a budget line is drawn in (red over, amber near, green ok, grey paid/unused). */
export function budgetStatusColor(item: { spent: number; budget: number }): string {
  return STATUS_COLOR[statusOf(item)];
}

function statusOf({ spent, budget }: { spent: number; budget: number }): Status {
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
    <BudgetRow key={item.id} item={item} status={status} color={groupColor?.(item.section)} money={money} onClick={() => onEdit(item.id)} />
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
 * The pinned month header. One number, one bar: "€549 left to spend" and a
 * bar of the budget plan only (dark = spent, light = left), labelled at its
 * ends. What the month leaves you with is a separate, quieter line — a
 * different question on a different scale (income) — which opens the income
 * menu.
 */
export function BudgetSummary({
  items,
  plan,
  monthName,
  daysLeft,
  formatCurrency,
  incomeControl,
  onOutside,
}: {
  items: BudgetItem[];
  plan: MonthPlan;
  monthName: string;
  daysLeft: number | null;
  formatCurrency: (amount: number) => string;
  /** Wraps the savings line in the menu that changes how income is planned. */
  incomeControl?: (trigger: ReactElement) => ReactNode;
  /** Opens the review of spending outside the plan. */
  onOutside?: () => void;
}) {
  const money = (n: number) => formatCurrency(Math.round(n)).replace(/\.00$/, "");
  const flexLimit = plan.flex?.limit ?? 0;
  const flexSpent = plan.flex?.spent ?? 0;
  const totalBudget = items.reduce((s, i) => s + i.budget, 0) + flexLimit;
  const totalSpent = items.reduce((s, i) => s + i.spent, 0) + flexSpent;
  const left = totalBudget - totalSpent;
  const over = left < 0;
  const share = totalBudget > 0 ? Math.min(totalSpent / totalBudget, 1) : 0;
  const perDay = daysLeft && daysLeft > 0 && left > 0 ? left / daysLeft : null;

  // What the month leaves you with if the rest goes to plan: every limit gets
  // used (or stays overspent), and spending outside the budget stays as is.
  const plannedOut = plan.past
    ? totalSpent + plan.outside
    : items.reduce((s, i) => s + Math.max(i.spent, i.budget), 0) + Math.max(flexSpent, flexLimit) + plan.outside;
  const save = plan.income - plannedOut;
  const hasIncome = !plan.incomeOff && plan.income > 0;
  const control = incomeControl ?? ((t: ReactElement) => t);
  const tilde = plan.past ? "" : "~";
  const saveColor = save >= 0 ? POSITIVE : plan.incomeProvisional ? "#B45309" : STATUS_COLOR.over;

  return (
    <div className="min-w-0" style={{ contain: "inline-size" }}>
      {/* One number, with the time left at the end of the bar's row. */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-[22px] leading-none font-semibold tabular-nums" style={{ color: over ? STATUS_COLOR.over : "#000" }}>
            {money(Math.abs(left))}
          </span>
          <span className="text-xs text-gray-500 truncate">{over ? "over plan" : plan.past ? "left unspent" : "left to spend"}</span>
        </div>
        {daysLeft !== null && daysLeft > 0 && (
          <span className="text-xs text-gray-500 whitespace-nowrap tabular-nums">
            {daysLeft} {daysLeft === 1 ? "day" : "days"} left{perDay !== null && <> · {money(perDay)}/day</>}
          </span>
        )}
      </div>

      {/* …one bar: the budget plan, labelled at its ends. */}
      <div className="relative mt-2.5 h-2 rounded-full" style={{ backgroundColor: "#E5E7EB" }} aria-label={`${money(totalSpent)} of ${money(totalBudget)} spent`}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${share * 100}%`, backgroundColor: over ? STATUS_COLOR.over : "#111827" }} />
      </div>
      {/* The two numbers the bar is made of, as readable as the headline row:
          bold ink values, quiet words. */}
      <div className="mt-1.5 flex items-baseline justify-between gap-3 tabular-nums">
        <span className="flex min-w-0 items-baseline gap-2 text-[12px] text-gray-500">
          <span className="whitespace-nowrap">
            <span className="text-[15px] font-semibold" style={{ color: over ? STATUS_COLOR.over : "#111827" }}>{money(totalSpent)}</span> spent
          </span>
          {/* Expenses at the top count everything; the plan only its categories.
              Name the gap so the two numbers add up. */}
          {!plan.flex && plan.outside >= 0.5 && (
            <button
              type="button"
              onClick={onOutside}
              className="inline-flex items-center gap-0.5 truncate rounded-full px-1.5 -ml-0.5 text-gray-400 hover:bg-gray-100 hover:text-black"
              title={`Spending in categories without a limit — ${money(totalSpent + plan.outside)} in total this month`}
            >
              +{money(plan.outside)} outside plan
              <ChevronRight size={12} className="flex-none" />
            </button>
          )}
        </span>
        <span className="text-[12px] text-gray-500">
          <span className="text-[15px] font-semibold text-gray-900">{money(totalBudget)}</span> plan
        </span>
      </div>

      {/* What the month leaves you with — its own line, opens the income menu. */}
      <div className="mt-2.5 border-t border-gray-100 pt-2">
        {control(
          <button type="button" className="group flex w-full items-center gap-2 text-left text-[12px] tabular-nums" title="Change how income is planned">
            {hasIncome ? (
              <>
                <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ backgroundColor: saveColor }} />
                <span
                  className="font-medium"
                  style={{ color: saveColor }}
                  title={plan.past ? "Income minus spending this month" : "~ = expected by the end of the month, if the rest goes to plan"}
                >
                  {save >= 0
                    ? `Saved ${tilde}${money(save)}`
                    : plan.incomeProvisional
                      ? `Needs ${money(-save)} more income`
                      : `Saved ${tilde}−${money(-save)}`}
                </span>
                <span className="min-w-0 truncate text-gray-400">
                  {plan.past ? "this month" : "by month end"} · {money(plan.income)} {plan.incomeLabel}
                </span>
              </>
            ) : (
              <span className="text-gray-400">{plan.incomeOff ? "Show what this month saves" : "Set your income to see what this month saves"}</span>
            )}
            <ChevronRight size={14} className="ml-auto flex-none text-gray-300 group-hover:text-gray-600" />
          </button>,
        )}
      </div>
    </div>
  );
}

function ProgressBar({
  share,
  color,
  height = 4,
  className = "",
}: {
  share: number;
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
    </div>
  );
}

function BudgetRow({
  item,
  status,
  color,
  money,
  onClick,
}: {
  item: BudgetItem;
  status: Status;
  color?: string;
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
        <ProgressBar share={share} color={STATUS_COLOR[status]} className="mt-1.5" />
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
