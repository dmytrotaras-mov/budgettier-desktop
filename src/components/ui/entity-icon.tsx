// The one way a category, group or wallet is drawn: its emoji (or icon) on a
// rounded square tinted with the entity's color. Color means identity (the
// group); status — over budget, income vs expense — is shown by other marks.
//
// Inline styles on purpose: a global rule on the Budget page stretches any
// `.bg-white` child, and sizes here are exact.

import type { ReactNode } from "react";
import { GROUP_FALLBACK_COLOR, tint } from "@/lib/sectionUtils";

export function EntityIcon({
  emoji,
  color,
  size = 36,
  className = "",
  title,
}: {
  emoji: ReactNode;
  color?: string | null;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center leading-none select-none ${className}`}
      title={title}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        fontSize: Math.round(size * 0.5),
        backgroundColor: tint(color || GROUP_FALLBACK_COLOR, 0.85),
      }}
    >
      {emoji}
    </span>
  );
}
