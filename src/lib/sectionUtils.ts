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
