// Cash flow: income and spending per period — as columns or as lines — with
// the balance (money at the end of each period) as an ink line on top, and
// optionally each period's savings as a row of numbers under the axis. The
// selected period sits on a soft highlight; one still in progress is lighter
// and labelled "so far".

import { Bar, CartesianGrid, ComposedChart, Cell, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { INK, NEGATIVE, POSITIVE } from "@/lib/colors";

export const CASH_FLOW_SERIES = [
  { key: "income", label: "Income", color: POSITIVE },
  { key: "expenses", label: "Expenses", color: NEGATIVE },
  { key: "balance", label: "Balance", color: INK, line: true },
  { key: "savings", label: "Saved", color: "#9CA3AF" },
] as const;

export type CashFlowMode = "bars" | "lines";

type Row = { [k: string]: any; income: number | null; expenses: number | null; balance: number | null };

interface Props {
  data: Row[];
  xKey: string;
  selected: string; // x value to emphasise
  inProgress?: string | null; // x value of the unfinished period
  visible: Record<string, boolean>;
  mode?: CashFlowMode;
  formatCurrency: (n: number) => string;
  axisMoney: (n: number) => string;
  height?: number | string;
}

export function CashFlowChart({ data, xKey, selected, inProgress, visible, mode = "bars", formatCurrency, axisMoney, height = "100%" }: Props) {
  const byX = new Map(data.map((r) => [r[xKey], r]));
  const lastBalanceIndex = data.reduce((last, r, i) => (r.balance != null ? i : last), -1);

  const tick = ({ x, y, payload }: any) => {
    const v = payload.value;
    return (
      <g transform={`translate(${x},${y})`}>
        <text dy={12} textAnchor="middle" fontSize={11} fill={v === selected ? INK : "#6B7280"} fontWeight={v === selected ? 600 : 400}>
          {v}
        </text>
        {v === inProgress && (
          <text dy={25} textAnchor="middle" fontSize={9} fill="#9CA3AF">
            so far
          </text>
        )}
        {visible.savings && (() => {
          const r = byX.get(v);
          if (!r || r.income == null || r.expenses == null) return null;
          const saved = r.income - r.expenses;
          return (
            <text dy={v === inProgress ? 38 : 27} textAnchor="middle" fontSize={10} fontWeight={600} fill={v === inProgress ? "#9CA3AF" : saved >= 0 ? POSITIVE : NEGATIVE}>
              {saved >= 0 ? "+" : "−"}{axisMoney(Math.abs(saved))}
            </text>
          );
        })()}
      </g>
    );
  };

  const tooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as Row;
    if (row.income === null && row.expenses === null) return null;
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
        <div className="text-gray-500 mb-1">
          {label}
          {label === inProgress && " · in progress"}
        </div>
        {CASH_FLOW_SERIES.filter((s) => s.key !== "savings" && visible[s.key] && row[s.key] != null).map((s) => (
          <div key={s.key} className="flex items-center gap-2 py-0.5">
            <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="font-semibold text-gray-900 tabular-nums">{formatCurrency(row[s.key] as number)}</span>
            <span className="text-gray-500">{s.label}</span>
          </div>
        ))}
        {row.income != null && row.expenses != null && (
          <div className="mt-1 pt-1 border-t border-gray-100 text-gray-500 tabular-nums">
            {row.income - row.expenses >= 0 ? "Saved " : "Overspent "}
            <span className="font-medium" style={{ color: row.income - row.expenses >= 0 ? POSITIVE : NEGATIVE }}>
              {formatCurrency(Math.abs(row.income - row.expenses))}
            </span>
          </div>
        )}
      </div>
    );
  };

  const barOpacity = (x: string) => (x === inProgress ? 0.6 : 1);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 8 }} barGap={2} barCategoryGap="30%">
        <CartesianGrid stroke="#F1F2F4" vertical={false} />
        {selected && <ReferenceArea x1={selected} x2={selected} fill="#F3F4F6" fillOpacity={1} ifOverflow="extendDomain" />}
        <XAxis dataKey={xKey} tick={tick} axisLine={false} tickLine={false} interval={0} height={visible.savings ? 50 : 34} />
        <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} width={48} tickFormatter={axisMoney} />
        <ReferenceLine y={0} stroke="#D1D5DB" />
        <Tooltip content={tooltip} cursor={{ fill: "#F3F4F6", opacity: 0.5 }} />
        {mode === "lines" && visible.income && (
          <Line dataKey="income" name="Income" type="monotone" stroke={POSITIVE} strokeWidth={2} connectNulls={false} isAnimationActive={false} dot={{ r: 2.5, fill: POSITIVE, strokeWidth: 0 }} activeDot={{ r: 5 }} />
        )}
        {mode === "lines" && visible.expenses && (
          <Line dataKey="expenses" name="Expenses" type="monotone" stroke={NEGATIVE} strokeWidth={2} connectNulls={false} isAnimationActive={false} dot={{ r: 2.5, fill: NEGATIVE, strokeWidth: 0 }} activeDot={{ r: 5 }} />
        )}
        {mode === "bars" && visible.income && (
          <Bar dataKey="income" name="Income" fill={POSITIVE} maxBarSize={18} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((r) => (
              <Cell key={r[xKey]} fillOpacity={barOpacity(r[xKey])} />
            ))}
          </Bar>
        )}
        {mode === "bars" && visible.expenses && (
          <Bar dataKey="expenses" name="Expenses" fill={NEGATIVE} maxBarSize={18} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((r) => (
              <Cell key={r[xKey]} fillOpacity={barOpacity(r[xKey])} />
            ))}
          </Bar>
        )}
        {visible.balance && (
          <Line
            dataKey="balance"
            name="Balance"
            type="monotone"
            stroke={INK}
            strokeWidth={2}
            connectNulls={false}
            isAnimationActive={false}
            dot={(p: any) =>
              p.value == null ? (
                <g key={`b-${p.index}`} />
              ) : (
                <circle key={`b-${p.index}`} cx={p.cx} cy={p.cy} r={p.index === lastBalanceIndex ? 4.5 : 3} fill={INK} stroke="#fff" strokeWidth={2} />
              )
            }
            activeDot={{ r: 5, fill: INK, stroke: "#fff", strokeWidth: 2 }}
            label={(p: any) =>
              p.index === lastBalanceIndex && p.value != null ? (
                <text key={`bl-${p.index}`} x={p.x} y={p.y - 12} textAnchor="middle" fontSize={11} fontWeight={600} fill={INK}>
                  {axisMoney(p.value)}
                </text>
              ) : (
                <g key={`bl-${p.index}`} />
              )
            }
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
