// Spending pace: cumulative spend through the month against the usual range
// of past months (a gray band), with a dashed forecast to month end and the
// month's budget as a reference line.

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { NEGATIVE } from "@/lib/colors";

// The budget plan is a reference line: quieter than the data and drawn under it.
export const PACE_COLORS = { current: NEGATIVE, band: "#9CA3AF", budget: "#9CA3AF" };

interface Point {
  day: number;
  currentMonth?: number;
  range?: [number, number];
  forecast?: number;
}

interface Props {
  data: Point[];
  monthLabel: string;
  todayDay: number | null;
  budgetTotal: number | null;
  visible: { currentMonth: boolean; range: boolean; forecast: boolean; budget: boolean };
  formatCurrency: (n: number) => string;
  axisMoney: (n: number) => string;
  height?: number | string;
}

export function SpendingPaceChart({ data, monthLabel, todayDay, budgetTotal, visible, formatCurrency, axisMoney, height = "100%" }: Props) {
  const maxValue = Math.max(
    0,
    ...data.flatMap((p) => [p.currentMonth ?? 0, p.range?.[1] ?? 0, p.forecast ?? 0]),
    visible.budget && budgetTotal ? budgetTotal : 0,
  );

  const tooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as Point;
    const rows: [string, string, string][] = [];
    if (visible.currentMonth && p.currentMonth !== undefined) rows.push([formatCurrency(p.currentMonth), monthLabel, PACE_COLORS.current]);
    if (visible.forecast && p.forecast !== undefined && p.currentMonth === undefined)
      rows.push([formatCurrency(p.forecast), "Forecast", PACE_COLORS.current]);
    if (visible.range && p.range) rows.push([`${formatCurrency(p.range[0])} – ${formatCurrency(p.range[1])}`, "Usual range", PACE_COLORS.band]);
    if (!rows.length) return null;
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
        <div className="text-gray-500 mb-1">Day {label}</div>
        {rows.map(([value, name, color]) => (
          <div key={name} className="flex items-center gap-2 py-0.5">
            <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="font-semibold text-gray-900 tabular-nums">{value}</span>
            <span className="text-gray-500">{name}</span>
          </div>
        ))}
      </div>
    );
  };

  const last = todayDay ? data[todayDay - 1] : undefined;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#F1F2F4" vertical={false} />
        <XAxis dataKey="day" type="number" domain={[1, data.length || 31]} ticks={[1, 5, 10, 15, 20, 25, 30].filter((d) => d <= (data.length || 31))} tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} width={48} tickFormatter={axisMoney} domain={[0, Math.ceil((maxValue * 1.08) / 500) * 500 || 500]} />
        <Tooltip content={tooltip} cursor={{ stroke: "#D1D5DB", strokeWidth: 1 }} />
        {visible.range && (
          <Area dataKey="range" stroke="none" fill={PACE_COLORS.band} fillOpacity={0.18} isAnimationActive={false} activeDot={false} />
        )}
        {visible.budget && budgetTotal ? (
          <ReferenceLine
            y={budgetTotal}
            stroke={PACE_COLORS.budget}
            strokeWidth={1.5}
            label={{ value: `Budget plan ${axisMoney(budgetTotal)}`, position: "insideTopLeft", fontSize: 11, fill: "#6B7280", dy: -2 }}
          />
        ) : null}
        {visible.forecast && (
          <Line dataKey="forecast" stroke={PACE_COLORS.current} strokeOpacity={0.55} strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={false} isAnimationActive={false} connectNulls />
        )}
        {visible.currentMonth && (
          <Line
            dataKey="currentMonth"
            stroke={PACE_COLORS.current}
            strokeWidth={2.5}
            isAnimationActive={false}
            connectNulls={false}
            activeDot={{ r: 4 }}
            dot={(p: any) =>
              todayDay && p.payload.day === todayDay ? (
                <circle key={`d-${p.index}`} cx={p.cx} cy={p.cy} r={4.5} fill={PACE_COLORS.current} stroke="#fff" strokeWidth={2} />
              ) : (
                <g key={`d-${p.index}`} />
              )
            }
            label={(p: any) =>
              todayDay && p.index === todayDay - 1 && last?.currentMonth !== undefined ? (
                // White halo: the value stays readable where it sits on the budget line.
                <text key={`l-${p.index}`} x={p.x} y={p.y - 12} textAnchor="middle" fontSize={11} fontWeight={600} fill="#111827" stroke="#fff" strokeWidth={4} strokeLinejoin="round" paintOrder="stroke">
                  {axisMoney(last.currentMonth)}
                </text>
              ) : (
                <g key={`l-${p.index}`} />
              )
            }
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
