// The app's two money colors — one green, one red, used everywhere: icons,
// bars, lines, "vs last month" deltas, statuses. Validated as a pair: CVD-safe
// (deutan ΔE 8.6) and ≥3:1 on white, so they work for marks and small text.
export const POSITIVE = "#059669";
export const NEGATIVE = "#DC2626";
/** Balance (a level, not a flow) — drawn in ink, not a money color. */
export const INK = "#111827";

/** `rgba()` of a hex color — for washes such as the calendar heatmap. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
