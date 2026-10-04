// One-time move of section data from the webview's localStorage into the
// database. Older versions kept renamed sections, section emojis, custom
// sections and manual category assignments in localStorage, which isn't part
// of the .db backup. The old keys are left in place untouched but are no
// longer read by the app once the flag is set.

import { invoke } from "@tauri-apps/api/core";
import type { QueryClient } from "@tanstack/react-query";

const MIGRATED_FLAG = "sectionsMigratedToDb";
const TYPES = ["expense", "income"] as const;

function readJson(key: string): Record<string, any> {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function migrateLegacySectionsOnce(queryClient: QueryClient): Promise<void> {
  try {
    if (localStorage.getItem(MIGRATED_FLAG) === "1") return;
  } catch {
    return; // storage unavailable — nothing to migrate
  }

  const payload: Record<string, unknown> = {};
  let hasData = false;
  for (const type of TYPES) {
    const custom = readJson(`customSections_${type}`);
    const forType = {
      customSections: Object.fromEntries(
        Object.entries(custom).map(([id, s]: [string, any]) => [
          id,
          { name: String(s?.name ?? ""), emoji: s?.emoji ?? null },
        ]),
      ),
      assignments: readJson(`categoryAssignments_${type}`),
      overrides: readJson(`sectionOverrides_${type}`),
      emojiOverrides: readJson(`sectionEmojiOverrides_${type}`),
    };
    hasData ||= Object.values(forType).some((v) => Object.keys(v).length > 0);
    payload[type] = forType;
  }

  try {
    if (hasData) {
      await invoke("import_legacy_sections", { payload });
      queryClient.invalidateQueries({ queryKey: ["/api/sections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
    }
    localStorage.setItem(MIGRATED_FLAG, "1");
  } catch (err) {
    // Leave the flag unset so the move is retried on next launch.
    console.warn("Moving sections to the database failed:", err);
  }
}
