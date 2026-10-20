// Settings → Data: automatic iCloud backups, manual backup/restore, CSV
// export and Wise import.
//
// Restore stages the chosen file as <db>.pending; db::init swaps it in on the
// next launch (open connections can't be replaced while the app runs).

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { save, open, ask } from "@tauri-apps/plugin-dialog";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { FolderOpen } from "lucide-react";
import ImportWiseDialog from "./import-wise-dialog";
import { SettingsCard, SettingsRow } from "./settings-ui";

interface BackupStatus {
  enabled: boolean;
  lastBackupAt: number | null;
  folder: string | null;
  icloudAvailable: boolean;
  backupCount: number;
}

const STATUS_KEY = ["backup-status"];

export default function DataSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"now" | "export" | "restore" | "csv" | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const { data: status } = useQuery<BackupStatus>({
    queryKey: STATUS_KEY,
    queryFn: () => invoke<BackupStatus>("get_backup_status"),
  });
  const setStatus = (s: BackupStatus) => queryClient.setQueryData(STATUS_KEY, s);

  const today = new Date().toISOString().slice(0, 10);
  const fail = (title: string) => (err: any) =>
    toast({ title, description: String(err?.message || err), variant: "destructive" });

  const toggleAuto = async (enabled: boolean) => {
    try {
      setStatus(await invoke<BackupStatus>("set_auto_backup", { enabled }));
    } catch (err) {
      fail("Couldn't change backup setting")(err);
    }
  };

  const backupNow = async () => {
    setBusy("now");
    try {
      setStatus(await invoke<BackupStatus>("backup_now"));
      toast({ title: "Backup saved to iCloud Drive" });
    } catch (err) {
      fail("Backup failed")(err);
    } finally {
      setBusy(null);
    }
  };

  const exportBackup = async () => {
    const path = await save({
      defaultPath: `budgettier-${today}.db`,
      filters: [{ name: "Budgettier database", extensions: ["db"] }],
    });
    if (!path) return;
    setBusy("export");
    try {
      await invoke("backup_db", { destPath: path });
      toast({ title: "Backup saved", description: path });
    } catch (err) {
      fail("Backup failed")(err);
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    const picked = await open({
      multiple: false,
      directory: false,
      defaultPath: status?.folder ?? undefined,
      filters: [{ name: "Budgettier database", extensions: ["db"] }],
    });
    if (!picked || Array.isArray(picked)) return;
    const confirmed = await ask(
      "This replaces all your current data with the backup. The restored data loads the next time you open Budgettier.",
      { title: "Restore from backup?", kind: "warning", okLabel: "Restore", cancelLabel: "Cancel" },
    );
    if (!confirmed) return;
    setBusy("restore");
    try {
      await invoke("restore_db", { sourcePath: picked });
      toast({ title: "Backup ready", description: "Quit and reopen Budgettier to load it." });
    } catch (err) {
      fail("Restore failed")(err);
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = async () => {
    const path = await save({
      defaultPath: `budgettier-transactions-${today}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return;
    setBusy("csv");
    try {
      const count = await invoke<number>("export_csv", { destPath: path });
      toast({ title: "CSV exported", description: `${count} transactions` });
    } catch (err) {
      fail("Export failed")(err);
    } finally {
      setBusy(null);
    }
  };

  const lastBackup = status?.lastBackupAt
    ? `Last backup ${formatDistanceToNow(new Date(status.lastBackupAt), { addSuffix: true })}`
    : "No backup yet";

  const pillButton = { borderRadius: 30 } as const;

  return (
    <div className="space-y-4">
      <SettingsCard title="Backups" description="Your data lives only on this Mac. Keep a copy somewhere safe.">
        <SettingsRow
          label="Back up automatically"
          hint={
            status && !status.icloudAvailable
              ? "iCloud Drive isn't turned on for this Mac"
              : `Weekly to iCloud Drive › Budgettier, keeping the last 8 · ${lastBackup}`
          }
        >
          <Switch
            checked={status?.enabled ?? false}
            onCheckedChange={toggleAuto}
            disabled={!status || !status.icloudAvailable}
          />
        </SettingsRow>
        <SettingsRow
          label="Back up now"
          hint={status?.backupCount ? `${status.backupCount} backup${status.backupCount === 1 ? "" : "s"} in iCloud Drive` : undefined}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => invoke("reveal_backup_folder").catch(fail("Couldn't open folder"))}
            disabled={!status?.icloudAvailable}
            title="Show in Finder"
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" style={pillButton} onClick={backupNow} disabled={busy !== null || !status?.icloudAvailable}>
            {busy === "now" ? "Backing up…" : "Back up"}
          </Button>
        </SettingsRow>
        <SettingsRow label="Backup file" hint="Save a copy anywhere, or restore one">
          <Button variant="outline" size="sm" style={pillButton} onClick={exportBackup} disabled={busy !== null}>
            {busy === "export" ? "Saving…" : "Export…"}
          </Button>
          <Button variant="outline" size="sm" style={pillButton} onClick={restore} disabled={busy !== null}>
            {busy === "restore" ? "Preparing…" : "Restore…"}
          </Button>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard title="Import and export">
        <SettingsRow label="Wise statement" hint="CSV export from Wise. Duplicates are skipped and categories suggested by your rules.">
          <Button variant="outline" size="sm" style={pillButton} onClick={() => setImportOpen(true)}>
            Import…
          </Button>
        </SettingsRow>
        <SettingsRow label="All transactions" hint="CSV file for Excel or Numbers">
          <Button variant="outline" size="sm" style={pillButton} onClick={exportCsv} disabled={busy !== null}>
            {busy === "csv" ? "Exporting…" : "Export…"}
          </Button>
        </SettingsRow>
      </SettingsCard>

      <ImportWiseDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
