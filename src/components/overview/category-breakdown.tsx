import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface BreakdownItem {
  name: string;
  amount: number;
  emoji?: string;
  /** Categories inside a group (Groups view). A group with children can be opened. */
  children?: BreakdownItem[];
}

export type BreakdownMode = "groups" | "categories";

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

/** Pill tabs styled like the Settings tabs: the active one is black. */
export function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
  size = "md",
}: {
  tabs: [T, string][];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex gap-1">
      {tabs.map(([key, label]) => {
        const active = value === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 ${active ? "" : "hover:bg-gray-100"}`}
            style={{
              height: size === "sm" ? 36 : 40,
              padding: size === "sm" ? "0 14px" : "0 18px",
              borderRadius: 30,
              border: "none",
              backgroundColor: active ? "#000" : "transparent",
              color: active ? "#fff" : "#000",
              fontFamily: "Inter",
              fontSize: size === "sm" ? 13 : 14,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Groups | Categories switch for the category breakdown. */
export function BreakdownTabs({
  mode,
  onChange,
  size = "md",
}: {
  mode: BreakdownMode;
  onChange: (mode: BreakdownMode) => void;
  size?: "sm" | "md";
}) {
  return (
    <PillTabs
      tabs={[["groups", "Groups"], ["categories", "Categories"]]}
      value={mode}
      onChange={onChange}
      size={size}
    />
  );
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
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollTimer = useRef<number | undefined>(undefined);
  const [fade, setFade] = useState({ top: false, bottom: false });

  // Inside an opened group the chart and list show that group's categories.
  const group = openGroup ? items.find((i) => i.name === openGroup && i.children?.length) : undefined;
  const shown = group ? group.children! : items;
  const canOpen = !group && items.some((i) => i.children?.length);

  const total = useMemo(() => shown.reduce((sum, i) => sum + i.amount, 0), [shown]);
  const grandTotal = useMemo(() => items.reduce((sum, i) => sum + i.amount, 0), [items]);

  // Reset the highlight when what's shown changes; close a group that's gone.
  useEffect(() => setActive(null), [shown]);
  useEffect(() => {
    if (openGroup && !items.some((i) => i.name === openGroup)) setOpenGroup(null);
  }, [items, openGroup]);

  // Cells are memoized so hovering doesn't hand Recharts new children (which
  // would restart its animation). Highlighting is done in CSS instead: each
  // slice knows its own outward direction via --dx/--dy.
  const cells = useMemo(() => {
    let cumulative = 0;
    return shown.map((item, index) => {
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
  }, [shown, total]);

  // Fade the list's top/bottom edge while there's more to scroll to.
  const updateFade = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setFade({
      top: el.scrollTop > 4,
      bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 4,
    });
  }, []);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
    updateFade();
  }, [shown, updateFade]);
  useEffect(() => () => window.clearTimeout(scrollTimer.current), []);

  // Hovering a slice brings its row into view — but only inside the list
  // (the dialog itself never moves), only when the row is hidden, and only
  // once the pointer settles, so sweeping across slices doesn't jerk the list.
  const onSliceEnter = useCallback((_: unknown, index: number) => {
    setActive(index);
    window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      const list = listRef.current;
      const row = rowRefs.current[index];
      if (!list || !row) return;
      const top = row.offsetTop;
      const bottom = top + row.offsetHeight;
      if (top >= list.scrollTop && bottom <= list.scrollTop + list.clientHeight) return;
      list.scrollTo({ top: top - (list.clientHeight - row.offsetHeight) / 2, behavior: "smooth" });
    }, 220);
  }, []);

  const open = (index: number) => {
    const item = shown[index];
    if (canOpen && item?.children?.length) setOpenGroup(item.name);
  };
  const onSliceClick = useCallback(
    (_: unknown, index: number) => open(index),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, canOpen],
  );

  const activeItem = active !== null ? shown[active] : null;
  const percentOf = (amount: number) => (total > 0 ? (amount / total) * 100 : 0);

  return (
    <div>
      <style>{`
        .cb-pie .cb-slice {
          transition: transform 220ms cubic-bezier(.2,.8,.2,1), opacity 220ms ease, filter 220ms ease;
          cursor: ${canOpen ? "pointer" : "default"};
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

      {/* Breadcrumb inside a group / hint at the top level */}
      <div className="flex items-center gap-2 mb-4 min-h-[36px]">
        {group ? (
          <>
            <button
              onClick={() => setOpenGroup(null)}
              className="flex items-center gap-1 h-9 pl-2 pr-3 rounded-full hover:bg-gray-100 text-sm font-medium text-gray-600 transition-colors"
            >
              <ChevronLeft size={16} />
              All groups
            </button>
            <ChevronRight size={14} className="text-gray-300" />
            <span className="text-sm font-semibold text-gray-900">
              {group.emoji} {group.name}
            </span>
            <span className="text-sm text-gray-500 tabular-nums ml-1">
              {formatCurrency(group.amount)} · {grandTotal > 0 ? ((group.amount / grandTotal) * 100).toFixed(1) : "0"}% of {flowLabel}
            </span>
          </>
        ) : canOpen ? (
          <span className="text-xs text-gray-400">Click a group to see its categories</span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr,1fr] gap-6 md:gap-8">
        {/* Donut */}
        <div>
          <div className="cb-pie relative w-full h-[320px] lg:h-[420px]" onMouseLeave={() => setActive(null)}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  key={group?.name ?? "all"}
                  data={shown}
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
                  onClick={onSliceClick}
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
                    <span className="text-sm text-gray-500 truncate max-w-full">
                      {group ? group.name : `Total ${flowLabel}`}
                    </span>
                    <span className="text-xl md:text-2xl font-bold text-gray-900 tabular-nums">{formatCurrency(total)}</span>
                    <span className="text-xs text-gray-400 mt-0.5">
                      {shown.length} {group || !canOpen ? (shown.length === 1 ? "category" : "categories") : shown.length === 1 ? "group" : "groups"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* List — every item, color-keyed to its slice */}
        <div
          ref={listRef}
          onScroll={updateFade}
          onMouseLeave={() => setActive(null)}
          className="relative flex flex-col gap-1 max-h-[320px] lg:max-h-[420px] overflow-y-auto pr-1"
          style={{
            scrollbarWidth: "thin",
            WebkitMaskImage: `linear-gradient(to bottom, ${fade.top ? "transparent" : "#000"} 0, #000 28px, #000 calc(100% - 36px), ${fade.bottom ? "transparent" : "#000"} 100%)`,
            maskImage: `linear-gradient(to bottom, ${fade.top ? "transparent" : "#000"} 0, #000 28px, #000 calc(100% - 36px), ${fade.bottom ? "transparent" : "#000"} 100%)`,
          }}
        >
          {shown.map((item, index) => {
            const percent = percentOf(item.amount);
            const isActive = active === index;
            const dimmed = active !== null && !isActive;
            const openable = canOpen && !!item.children?.length;
            return (
              <div
                key={item.name}
                ref={(el) => (rowRefs.current[index] = el)}
                onMouseEnter={() => setActive(index)}
                onClick={() => open(index)}
                className={`relative flex items-center justify-between gap-3 px-3 py-2 rounded-xl transition-all duration-200 ${
                  isActive ? "bg-gray-50" : ""
                } ${dimmed ? "opacity-50" : "opacity-100"} ${openable ? "cursor-pointer" : "cursor-default"}`}
              >
                <span
                  className="w-1 self-stretch rounded-full flex-shrink-0 transition-all duration-200"
                  style={{ backgroundColor: breakdownColor(index), opacity: isActive ? 1 : 0.85 }}
                />
                <span className="text-xl flex-shrink-0">{item.emoji || "💰"}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm truncate">{item.name}</div>
                  {openable ? (
                    <div className="text-xs text-gray-500 truncate">
                      {item.children!.map((c) => c.name).join(" · ")}
                    </div>
                  ) : (
                    <div className="mt-1 h-1 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(percent, 1)}%`, backgroundColor: breakdownColor(index) }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end flex-shrink-0 ml-2">
                  <span className="text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(item.amount)}</span>
                  <span className="text-xs text-gray-500 tabular-nums">{percent.toFixed(1)}%</span>
                </div>
                {openable && <ChevronRight size={16} className="text-gray-300 flex-shrink-0 -mr-1" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
