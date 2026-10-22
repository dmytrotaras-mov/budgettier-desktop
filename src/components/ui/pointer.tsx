// The app's triangle: a small pointer with rounded corners (budget "today"
// markers, ▲/▼ deltas). Rounding is a same-colour stroke with round joins.

export function Pointer({ w, color, up = false }: { w: number; color: string; up?: boolean }) {
  const h = Math.round(w * 0.66);
  const r = 1.2;
  const d = up ? `M${w / 2} ${r}L${w - r} ${h - r}H${r}Z` : `M${r} ${r}H${w - r}L${w / 2} ${h - r}Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ overflow: "visible", flexShrink: 0 }}>
      <path d={d} fill={color} stroke={color} strokeWidth={r * 2} strokeLinejoin="round" />
    </svg>
  );
}
