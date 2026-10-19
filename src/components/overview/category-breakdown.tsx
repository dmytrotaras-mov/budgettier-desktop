import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

export interface BreakdownItem {
  name: string;
  amount: number;
  emoji?: string;
}

// Distinct colors for the first 16 slices (largest first), so no two slices
// share a color in a typical month. Past that, colors are generated.
const PALETTE = [
  "#3B82F6", "#10B981", "#EF4444", "#F97316", "#8B5CF6", "#06B6D4", "#EC4899", "#EAB308",
  "#84CC16", "#0F766E", "#9F1239", "#1E3A8A", "#78716C", "#B45309", "#7DD3FC", "#FDA4AF",
];

export function breakdownColor(index: number): string {
  if (index < PALETTE.length) return PALETTE[index];
  const hue = Math.round((index * 137.508) % 360); // golden angle → well spread
  return `hsl(${hue} 55% 55%)`;
}

// Recharts draws from 3 o'clock counter-clockwise (startAngle 0 → 360).
const RAD = Math.PI / 180;
const POP_OUT = 10; // px the hovered slice moves outward

interface Props {
  items: BreakdownItem[];
  formatCurrency: (amount: number) => string;
  /** "expenses" / "income" — used in the center label. */
  flowLabel: string;
}

export function CategoryBreakdown({ items, formatCurrency, flowLabel }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const total = useMemo(() => items.reduce((sum, i) => sum + i.amount, 0), [items]);

  // Reset the highlight when the data set changes (Categories ↔ Head Categories).
  useEffect(() => setActive(null), [items]);

  // Cells are memoized so hovering doesn't hand Recharts new children (which
  // would restart its animation). Highlighting is done in CSS instead: each
  // slice knows its own outward direction via --dx/--dy.
  const cells = useMemo(() => {
    let cumulative = 0;
    return items.map((item, index) => {
      const share = total > 0 ? item.amount / total : 0;
      const mid = (cumulative + share / 2) * 360;
      cumulative += share;
      const style = {
        "--dx": `${(Math.cos(-mid * RAD) * POP_OUT).toFixed(2)}px`,
        "--dy": `${(Math.sin(-mid * RAD) * POP_OUT).toFixed(2)}px`,
      } as CSSProperties;
      return (
        <Cell
          key={item.name}
          fill={breakdownColor(index)}
          className={`cb-slice cb-slice-${index}`}
          style={style}
        />
      );
    });
  }, [items, total]);

  const onSliceEnter = useCallback((_: unknown, index: number) => {
    setActive(index);
    rowRefs.current[index]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  const activeItem = active !== null ? items[active] : null;
  const percentOf = (amount: number) => (total > 0 ? (amount / total) * 100 : 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.3fr,1fr] gap-6 md:gap-8">
      <style>{`
        .cb-pie .cb-slice {
          transition: transform 220ms cubic-bezier(.2,.8,.2,1), opacity 220ms ease, filter 220ms ease;
          cursor: pointer;
          outline: none;
        }
        ${active !== null ? `
        .cb-pie .cb-slice { opacity: .28; }
        .cb-pie .cb-slice-${active} {
          opacity: 1;
          transform: translate(var(--dx), var(--dy));
          filter: drop-shadow(0 6px 12px rgba(0,0,0,.18));
        }` : ""}
      `}</style>

      {/* Donut */}
      <div className="lg:sticky lg:top-0 self-start">
        <div className="cb-pie relative w-full h-[320px] lg:h-[420px]" onMouseLeave={() => setActive(null)}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={items}
                dataKey="amount"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="58%"
                outerRadius="86%"
                stroke="#fff"
                strokeWidth={2}
                cornerRadius={4}
                isAnimationActive={true}
                animationDuration={600}
                onMouseEnter={onSliceEnter}
              >
                {cells}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          {/* Center label: total by default, hovered slice otherwise */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center text-center max-w-[42%]">
              {activeItem ? (
                <>
                  <span className="text-2xl md:text-3xl leading-none mb-1.5">{activeItem.emoji || "💰"}</span>
                  <span className="text-sm text-gray-500 truncate max-w-full">{activeItem.name}</span>
                  <span className="text-xl md:text-2xl font-bold text-gray-900 tabular-nums">
                    {formatCurrency(activeItem.amount)}
                  </span>
                  <span
                    className="mt-1 text-xs font-semibold px-2 py-0.5 rounded-full text-white tabular-nums"
                    style={{ backgroundColor: breakdownColor(active!) }}
                  >
                    {percentOf(activeItem.amount).toFixed(1)}%
                  </span>
                </>
              ) : (
                <>
                  <span className="text-sm text-gray-500">Total {flowLabel}</span>
                  <span className="text-xl md:text-2xl font-bold text-gray-900 tabular-nums">{formatCurrency(total)}</span>
                  <span className="text-xs text-gray-400 mt-0.5">
                    {items.length} {items.length === 1 ? "item" : "items"}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* List — every item, color-keyed to its slice */}
      <div className="flex flex-col gap-1" onMouseLeave={() => setActive(null)}>
        {items.map((item, index) => {
          const percent = percentOf(item.amount);
          const isActive = active === index;
          const dimmed = active !== null && !isActive;
          return (
            <div
              key={item.name}
              ref={(el) => (rowRefs.current[index] = el)}
              onMouseEnter={() => setActive(index)}
              className={`relative flex items-center justify-between gap-3 px-3 py-2 rounded-xl cursor-default transition-all duration-200 ${
                isActive ? "bg-gray-50" : ""
              } ${dimmed ? "opacity-50" : "opacity-100"}`}
            >
              <span
                className="w-1 self-stretch rounded-full flex-shrink-0 transition-all duration-200"
                style={{ backgroundColor: breakdownColor(index), opacity: isActive ? 1 : 0.85 }}
              />
              <span className="text-xl flex-shrink-0">{item.emoji || "💰"}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 text-sm truncate">{item.name}</div>
                <div className="mt-1 h-1 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(percent, 1)}%`, backgroundColor: breakdownColor(index) }}
                  />
                </div>
              </div>
              <div className="flex flex-col items-end flex-shrink-0 ml-2">
                <span className="text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(item.amount)}</span>
                <span className="text-xs text-gray-500 tabular-nums">{percent.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
