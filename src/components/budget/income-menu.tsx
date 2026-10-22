// "Income for October": how the Budget plans the month's income. The choice
// (regular / last month / received so far / off) is remembered for every
// month; an amount typed in applies to this month only.

import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type IncomeMode = "regular" | "last" | "received" | "off";

export interface IncomeOptions {
  regular: number;
  last: number;
  received: number;
}

const MODES: { mode: IncomeMode; title: string; hint: string }[] = [
  { mode: "regular", title: "Regular income", hint: "Salary and other primary income, 3-month average — plus anything extra once it arrives" },
  { mode: "last", title: "Last month's income", hint: "Spend what you earned last month — works well for irregular income" },
  { mode: "received", title: "Received so far", hint: "Only money that already came in this month" },
  { mode: "off", title: "Off", hint: "Hide the savings part of the bar" },
];

export function IncomeMenu({
  children,
  monthName,
  mode,
  override,
  options,
  money,
  onMode,
  onSetAmount,
}: {
  children: ReactNode;
  monthName: string;
  mode: IncomeMode;
  /** Amount set by hand for this month, if any. */
  override: number | null;
  options: IncomeOptions;
  money: (n: number) => string;
  onMode: (mode: IncomeMode) => void;
  onSetAmount: (amount: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(override !== null ? String(override) : "");
  const parsed = parseFloat(value.replace(/\s/g, "").replace(",", "."));

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(override !== null ? String(override) : "");
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] rounded-2xl p-0" style={{ backgroundColor: "#fff" }}>
        <div className="px-4 pt-3.5 pb-2">
          <div className="text-sm font-semibold text-gray-900">Income for {monthName}</div>
          <div className="text-[11px] text-gray-500">What the month's savings are calculated from</div>
        </div>
        <div className="px-2">
          {MODES.map(({ mode: m, title, hint }) => {
            const active = override === null && mode === m;
            const amount = m === "off" ? null : options[m];
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  onMode(m);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left transition-colors ${active ? "bg-gray-100" : "hover:bg-gray-50"}`}
              >
                <span className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full border ${active ? "border-black bg-black text-white" : "border-gray-300"}`}>
                  {active && <Check size={10} strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-medium text-gray-900">{title}</span>
                    {amount !== null && <span className="text-[13px] tabular-nums text-gray-700">{money(amount)}</span>}
                  </span>
                  <span className="block text-[11px] leading-snug text-gray-500">{hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        <form
          className="mt-1 border-t border-gray-100 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!Number.isNaN(parsed) && parsed > 0) {
              onSetAmount(parsed);
              setOpen(false);
            }
          }}
        >
          <div className="text-[12px] font-medium text-gray-900">Set an amount for {monthName}</div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-gray-400">€</span>
              <input
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="2500"
                className="h-9 w-full rounded-full bg-gray-100 pl-7 pr-3 text-[13px] tabular-nums outline-none focus:bg-gray-50 focus:ring-2 focus:ring-black/10"
              />
            </div>
            <button type="submit" disabled={Number.isNaN(parsed) || parsed <= 0} className="h-9 rounded-full bg-black px-4 text-[13px] font-medium text-white hover:bg-gray-800 disabled:bg-gray-100 disabled:text-gray-400">
              Set
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-gray-500">
            <span>Only for {monthName} — next month goes back to your choice above</span>
            {override !== null && (
              <button
                type="button"
                onClick={() => {
                  onSetAmount(null);
                  setOpen(false);
                }}
                className="ml-2 flex-none font-medium text-gray-700 hover:text-black"
              >
                Clear
              </button>
            )}
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
