// Shared building blocks for the Overview cards: one header pattern (title,
// one-line takeaway, controls, expand), legend chips that double as series
// toggles, and a compact money formatter for chart axes.

import type { CSSProperties, ReactNode } from "react";
import { Expand } from "lucide-react";

export function OverviewCard({
  title,
  subtitle,
  actions,
  onExpand,
  children,
  className = "",
  style,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  onExpand?: () => void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`bg-white overflow-hidden flex flex-col rounded-[20px] ${className}`} style={style}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-[20px] leading-tight font-medium text-black truncate" style={{ fontFamily: "Inter" }}>
            {title}
          </h2>
          {subtitle && <div className="text-xs text-gray-500 mt-1 truncate">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
          {onExpand && (
            <button
              type="button"
              onClick={onExpand}
              title="Open full view"
              aria-label="Open full view"
              className="w-9 h-9 rounded-full bg-[#F3F4F6] text-black hover:bg-black hover:text-white flex items-center justify-center transition-colors"
            >
              <Expand size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}

export interface LegendItem {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  /** Line series: show a short solid stroke instead of a dot. */
  line?: boolean;
  active: boolean;
}

/** Legend that also toggles each series on and off. */
export function LegendChips({ items, onToggle }: { items: LegendItem[]; onToggle?: (key: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 px-5">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onToggle?.(it.key)}
          disabled={!onToggle}
          aria-pressed={it.active}
          className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] font-medium transition-colors ${
            it.active ? "bg-[#F3F4F6] text-gray-900" : "bg-transparent text-gray-400 hover:text-gray-600"
          } ${onToggle ? "cursor-pointer" : "cursor-default"}`}
        >
          {it.line ? (
            <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: it.active ? it.color : "#D1D5DB" }} />
          ) : it.dashed ? (
            <span className="w-3 border-t-2 border-dashed" style={{ borderColor: it.active ? it.color : "#D1D5DB" }} />
          ) : (
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: it.active ? it.color : "#D1D5DB" }} />
          )}
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** "€6.5k", "−€3k", "€450" — short labels for chart axes. */
export function compactMoney(symbol: string) {
  return (value: number) => {
    const abs = Math.abs(value);
    const sign = value < 0 ? "−" : "";
    if (abs >= 1000) {
      const k = abs / 1000;
      return `${sign}${symbol}${k >= 10 || Number.isInteger(k) ? Math.round(k) : k.toFixed(1)}k`;
    }
    return `${sign}${symbol}${Math.round(abs)}`;
  };
}
