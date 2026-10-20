// Auto-update check. Runs once on app startup, and on demand from
// Settings → General. If a newer version is published on GitHub Releases,
// asks the user whether to install it now.

import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask, message } from "@tauri-apps/plugin-dialog";

export type UpdateResult = "up-to-date" | "later" | "installed";

/** Check, ask, install. Throws if the check itself fails (e.g. offline). */
export async function checkForUpdates(): Promise<UpdateResult> {
  const update = await check();
  if (!update) return "up-to-date";

  const wantsToInstall = await ask(
    `Budgettier ${update.version} is available (you have ${update.currentVersion}).\n\n` +
      `${update.body ?? ""}\n\nDownload and install it now?`,
    { title: "Update available", kind: "info", okLabel: "Install", cancelLabel: "Later" },
  );
  if (!wantsToInstall) return "later";

  await update.downloadAndInstall();
  await message("Update installed. Budgettier will now restart.", {
    title: "Update complete",
    kind: "info",
  });
  await relaunch();
  return "installed";
}

/** Startup variant: silent on failure — no network isn't worth a dialog. */
export async function checkForUpdatesOnStartup(): Promise<void> {
  try {
    await checkForUpdates();
  } catch (err) {
    console.warn("Update check failed:", err);
  }
}
