// Category sections live in the database (Rust: commands/sections.rs).
// A category's section is stored as the section NAME on the category itself;
// a category with no section shows under "Custom Categories".
// Hidden sections (the internal "System" group) never appear in the UI.

import { useQuery } from "@tanstack/react-query";

export interface Section {
  id: string;
  type: "income" | "expense";
  name: string;
  emoji: string | null;
  color: string | null;
  sortOrder: number;
  isDefault: boolean;
  hidden: boolean;
}

export const SECTIONS_QUERY_KEY = ["/api/sections"];

// Label for categories that belong to no section.
export const UNGROUPED_SECTION_NAME = "Custom Categories";

export function useSections() {
  return useQuery<Section[]>({ queryKey: SECTIONS_QUERY_KEY });
}

// Visible sections of a type, in display order.
export function visibleSections(sections: Section[], type: "income" | "expense"): Section[] {
  return sections
    .filter((s) => s.type === type && !s.hidden)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

// Categories in a hidden section (e.g. "Opening Balance") are internal.
export function isHiddenCategory(
  category: { type?: string; section?: string | null } | undefined,
  sections: Section[],
): boolean {
  if (!category?.section) return false;
  return sections.some((s) => s.hidden && s.type === category.type && s.name === category.section);
}

export function resolveCategorySection(
  category: { section?: string | null } | undefined,
): string {
  return category?.section || UNGROUPED_SECTION_NAME;
}

export function sectionEmoji(
  sections: Section[],
  name: string,
  type: "income" | "expense",
): string {
  return sections.find((s) => s.type === type && s.name === name)?.emoji || "📂";
}

// ---- Group colors ----
// The validated categorical palette (CVD-safe in this order); groups get them
// in display order when created. Picker offers these plus a neutral slate.
export const GROUP_PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
export const GROUP_FALLBACK_COLOR = "#64748b";
/** Extra hues for the picker beyond the validated eight (user's choice). */
export const GROUP_EXTRA_COLORS = ["#0284c7", "#0d9488", "#65a30d", "#92400e", "#be185d", "#4338ca", "#78716c", GROUP_FALLBACK_COLOR];
export const GROUP_SWATCHES = [...GROUP_PALETTE, ...GROUP_EXTRA_COLORS];

export function sectionColor(sections: Section[], name: string, type: "income" | "expense"): string {
  return sections.find((s) => s.type === type && s.name === name)?.color || GROUP_FALLBACK_COLOR;
}

/** Mix a hex color toward white by `t` (0–1). */
export function tint(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const v = (n >> shift) & 255;
    return Math.round(v + (255 - v) * t).toString(16).padStart(2, "0");
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** Categories inside a group: shades of the group's color, darkest first,
 *  never lighter than a 45% tint so they still read on white. */
export function categoryShade(groupColor: string, index: number, count: number): string {
  if (count <= 1) return groupColor;
  return tint(groupColor, (index / (count - 1)) * 0.45);
}
