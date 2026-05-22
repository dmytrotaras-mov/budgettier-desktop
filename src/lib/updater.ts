// Auto-update check. Runs once on app startup. If a newer version is published
// on GitHub Releases, asks the user whether to install it now.
//
// Silent on failure — a missing network or no-update is not worth bothering
// the user about. Only speaks up when there's actually an update.

import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask, message } from "@tauri-apps/plugin-dialog";

export async function checkForUpdatesOnStartup(): Promise<void> {
  try {
    const update = await check();
    if (!update) return; // already on the latest version

    const wantsToInstall = await ask(
      `Budgettier ${update.version} is available (you have ${update.currentVersion}).\n\n` +
        `${update.body ?? ""}\n\nDownload and install it now?`,
      { title: "Update available", kind: "info", okLabel: "Install", cancelLabel: "Later" },
    );
    if (!wantsToInstall) return;

    await update.downloadAndInstall();
    await message("Update installed. Budgettier will now restart.", {
      title: "Update complete",
      kind: "info",
    });
    await relaunch();
  } catch (err) {
    // Network down, GitHub unreachable, etc. — fail quietly.
    console.warn("Update check failed:", err);
  }
}
