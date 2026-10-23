// Spending in categories without a limit — a review list, not a nag.
//
// Collapsed: one line with the total (or, with a Flex budget, "Flex · €112 of
// €150"). Expanded: each category with a suggested limit (its 3-month
// average, rounded up), an EVERY MONTH / ONE-OFF hint, and its transactions,
// which can be moved to a budgeted category or excluded from the budget.
// "Leave as is" hides a category for the rest of the month without changing
// any data. A Flex budget is one limit that covers every category without
// its own.

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, Pencil, Plus, Repeat } from "lucide-react";
import { EntityIcon } from "@/components/ui/entity-icon";
import { NEGATIVE } from "@/lib/colors";
import { displayMerchantName } from "@/lib/merchantName";

export interface OutsideItem {
  categoryId: string;
  name: string;
  emoji: string;
  color?: string;
  spent: number;
  transactions: any[];
  /** Average spend per month over the last three months. */
  average: number;
  suggested: number;
  pattern: "every" | "oneoff" | null;
}

interface Props {
  items: OutsideItem[];
  flex: { limit: number } | null;
  dismissed: Set<string>;
  moveTargets: { id: string; name: string; emoji: string }[];
  money: (n: number) => string;
  defaultOpen?: boolean;
  /** Changes when something asks for the review (opens it and scrolls to it). */
  openSignal?: number;
  onAddLimit: (item: OutsideItem, amount: number) => void;
  onEditLimit: (item: OutsideItem) => void;
  onAddAll: (items: OutsideItem[]) => void;
  onDismiss: (categoryId: string, dismissed: boolean) => void;
  onMove: (tx: any, categoryId: string) => void;
  onExclude: (tx: any) => void;
  onFlex: () => void;
}

const pillBase = "inline-flex items-center gap-1 h-7 px-3 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors";

export function OutsideBudgetCard({ items, flex, dismissed, moveTargets, money, defaultOpen, openSignal, onAddLimit, onEditLimit, onAddAll, onDismiss, onMove, onExclude, onFlex }: Props) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openSignal) return;
    setOpen(true);
    requestAnimationFrame(() => rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [openSignal]);

  const total = items.reduce((s, i) => s + i.spent, 0);
  const pending = items.filter((i) => !dismissed.has(i.categoryId));
  const hidden = items.filter((i) => dismissed.has(i.categoryId));
  const regular = pending.filter((i) => i.pattern === "every");
  const shown = showDismissed ? items : pending;
  if (!flex && items.length === 0) return null;

  const flexShare = flex && flex.limit > 0 ? total / flex.limit : 0;
  const flexOver = flex ? total - flex.limit : 0;

  return (
    <div ref={rootRef} className="mt-4 rounded-2xl p-3 pl-4 scroll-mt-4" style={{ backgroundColor: "#F9FAFB" }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setOpen(!open)} className="min-w-0 flex-1 text-left focus:outline-none">
          {flex ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-gray-900">Flex</span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: flexOver > 0 ? NEGATIVE : "#111827" }}>
                  {flexOver > 0 ? `${money(flexOver)} over` : `${money(flex.limit - total)} left`}
                </span>
              </div>
              <div className="relative mt-1.5 h-1 rounded-full" style={{ backgroundColor: "#E5E7EB" }}>
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${Math.min(flexShare, 1) * 100}%`, backgroundColor: flexOver > 0 ? NEGATIVE : "#111827" }}
                />
              </div>
              <div className="mt-1 text-[11px] text-gray-500">
                {money(total)} of {money(flex.limit)} · everything without its own limit
                {items.length > 0 && ` · ${items.length} ${items.length === 1 ? "category" : "categories"}`}
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-medium text-gray-900">{money(total)} spent outside the budget</div>
              <div className="text-xs text-gray-500 truncate">
                {pending.length === 0
                  ? "All reviewed for this month"
                  : `${pending.length} to review${regular.length ? ` · ${regular.length} every month` : ""}`}
              </div>
            </>
          )}
        </button>
        {flex && (
          <button type="button" onClick={onFlex} title="Edit Flex budget" className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 hover:text-black">
            <Pencil size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="group inline-flex h-9 flex-none items-center gap-1 rounded-full pl-3.5 pr-2.5 text-[13px] font-medium text-black shadow-[0_0_0_1px_#E5E7EB] hover:!bg-black hover:text-white transition-colors"
          style={{ backgroundColor: "#fff" }}
        >
          {open ? "Close" : flex ? "Details" : "Review"}
          <ChevronDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          {shown.map((item) => {
            const isDismissed = dismissed.has(item.categoryId);
            const isOpen = expanded === item.categoryId;
            return (
              <div key={item.categoryId} className={`rounded-xl p-2.5 ${isDismissed ? "opacity-60" : ""}`} style={{ backgroundColor: "#fff" }}>
                <button type="button" onClick={() => setExpanded(isOpen ? null : item.categoryId)} className="flex w-full items-center gap-3 text-left focus:outline-none">
                  <EntityIcon emoji={item.emoji} color={item.color} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-gray-900">{item.name}</span>
                      {item.pattern === "every" && (
                        <span className="inline-flex flex-none items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-blue-700">
                          <Repeat size={9} /> Every month
                        </span>
                      )}
                      {item.pattern === "oneoff" && (
                        <span className="flex-none rounded-full bg-gray-100 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-gray-500">One-off</span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {item.transactions.length} {item.transactions.length === 1 ? "transaction" : "transactions"}
                      {item.average > 0 && ` · Ø ${money(item.average)} a month`}
                    </div>
                  </div>
                  <span className="flex-none text-sm font-semibold tabular-nums text-gray-900">{money(item.spent)}</span>
                  <ChevronDown size={14} className={`flex-none text-gray-300 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>

                <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[46px]">
                  <button type="button" onClick={() => onAddLimit(item, item.suggested)} className={`${pillBase} bg-black text-white hover:bg-gray-800`}>
                    <Plus size={13} /> Add {money(item.suggested)} limit
                  </button>
                  <button type="button" onClick={() => onEditLimit(item)} className={`${pillBase} text-gray-600 hover:bg-gray-100 hover:text-black`}>
                    Other amount
                  </button>
                  {!flex && (
                    <button
                      type="button"
                      onClick={() => onDismiss(item.categoryId, !isDismissed)}
                      className={`${pillBase} text-gray-600 hover:bg-gray-100 hover:text-black`}
                      title="Hide it for this month — nothing changes in your data"
                    >
                      {isDismissed ? "Review again" : "Leave as is"}
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="mt-2 border-t border-gray-100 pt-1 pl-[46px]">
                    {item.transactions.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 py-1.5 text-[12px]">
                        <span className="w-11 flex-none tabular-nums text-gray-400">{format(new Date(t.date), "d MMM")}</span>
                        <span className="min-w-0 flex-1 truncate text-gray-800">{displayMerchantName(t.description) || "—"}</span>
                        <span className="flex-none font-medium tabular-nums text-gray-900">{money(parseFloat(t.amount))}</span>
                        <select
                          value=""
                          onChange={(e) => e.target.value && onMove(t, e.target.value)}
                          className="h-6 max-w-[92px] flex-none cursor-pointer rounded-full border-0 bg-gray-100 px-2 text-[11px] text-gray-700 outline-none hover:bg-gray-200"
                          title="Move to a budgeted category"
                        >
                          <option value="">Move to…</option>
                          {moveTargets.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.emoji} {c.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => onExclude(t)}
                          className="h-6 flex-none rounded-full px-2 text-[11px] text-gray-500 hover:bg-gray-100 hover:text-black"
                          title="Not your spending (e.g. paid back) — stop counting it in the budget"
                        >
                          Exclude
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {hidden.length > 0 && !flex && (
            <button type="button" onClick={() => setShowDismissed(!showDismissed)} className="self-start px-1 text-[11px] text-gray-500 hover:text-black">
              {showDismissed ? "Hide the ones left as is" : `${hidden.length} left as is this month · Show`}
            </button>
          )}

          {!flex && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {pending.length > 1 && (
                <button type="button" onClick={() => onAddAll(pending)} className={`${pillBase} h-8 bg-black text-white hover:bg-gray-800`}>
                  <Plus size={13} /> Add all suggested limits · {money(pending.reduce((s, i) => s + i.suggested, 0))}
                </button>
              )}
              <button type="button" onClick={onFlex} className={`${pillBase} h-8 text-black shadow-[0_0_0_1px_#E5E7EB] hover:!bg-black hover:text-white`} style={{ backgroundColor: "#fff" }}>
                Or cover all with one Flex budget
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
