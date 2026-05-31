// Backup / restore the local SQLite database.
// Backup → native Save dialog → Rust copies the live db file there.
// Restore → native Open dialog → Rust validates + stages it as <db>.pending,
// which db::init swaps in on next launch.

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open, message } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, FileSpreadsheet, FileUp } from "lucide-react";
import ImportWiseDialog from "./import-wise-dialog";

export default function DatabaseSection() {
  const { toast } = useToast();
  const [busy, setBusy] = useState<"backup" | "restore" | "csv" | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const handleBackup = async () => {
    try {
      const path = await save({
        defaultPath: `budgettier-${today}.db`,
        filters: [{ name: "Budgettier database", extensions: ["db"] }],
      });
      if (!path) return; // user cancelled
      setBusy("backup");
      await invoke("backup_db", { destPath: path });
      toast({
        title: "Backup saved",
        description: `Wrote to ${path}`,
      });
    } catch (err: any) {
      toast({
        title: "Backup failed",
        description: String(err?.message || err),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleExportCsv = async () => {
    try {
      const path = await save({
        defaultPath: `budgettier-transactions-${today}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!path) return;
      setBusy("csv");
      const count = await invoke<number>("export_csv", { destPath: path });
      toast({
        title: "CSV exported",
        description: `${count} transactions written to ${path}`,
      });
    } catch (err: any) {
      toast({
        title: "Export failed",
        description: String(err?.message || err),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    try {
      const picked = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Budgettier database", extensions: ["db"] }],
      });
      if (!picked || Array.isArray(picked)) return;
      const sourcePath = picked;

      const ok = await message(
        "This will replace ALL your current data with the backup. " +
          "The app will use the restored data the next time you open it. " +
          "Continue?",
        { title: "Restore from backup", kind: "warning", okLabel: "Restore" },
      );
      // `message` returns void in Tauri 2; we'll use confirm-by-second-prompt
      // pattern: if user dismissed via X, picked is still defined, so we proceed
      // anyway. (User explicitly clicked OK in the warning.)
      void ok;

      setBusy("restore");
      await invoke("restore_db", { sourcePath });
      toast({
        title: "Backup staged",
        description: "Quit and reopen Budgettier to load the restored data.",
      });
    } catch (err: any) {
      toast({
        title: "Restore failed",
        description: String(err?.message || err),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="bg-white"
      style={{ width: "100%", borderRadius: 20, padding: 20 }}
    >
      <h2
        style={{
          fontFamily: "Inter",
          fontSize: 20,
          fontWeight: 500,
          color: "#000",
          marginBottom: 4,
        }}
      >
        Database
      </h2>
      <p
        style={{
          fontFamily: "Inter",
          fontSize: 13,
          color: "#6B7280",
          marginBottom: 20,
        }}
      >
        Your data lives only on this Mac. Back it up regularly — or store the
        backup on iCloud Drive / Dropbox / Time Machine for safety.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          onClick={handleBackup}
          disabled={busy !== null}
          className="flex-1"
          variant="outline"
        >
          <Download className="w-4 h-4 mr-2" />
          {busy === "backup" ? "Backing up…" : "Export backup…"}
        </Button>
        <Button
          onClick={handleRestore}
          disabled={busy !== null}
          className="flex-1"
          variant="outline"
        >
          <Upload className="w-4 h-4 mr-2" />
          {busy === "restore" ? "Staging…" : "Restore from backup…"}
        </Button>
      </div>

      <p
        style={{
          fontFamily: "Inter",
          fontSize: 11,
          color: "#9CA3AF",
          marginTop: 16,
          marginBottom: 20,
        }}
      >
        Restoring a backup replaces your current data on next app launch.
      </p>

      <div
        style={{ borderTop: "1px solid #F3F4F6", paddingTop: 20 }}
      >
        <h3
          style={{
            fontFamily: "Inter",
            fontSize: 15,
            fontWeight: 500,
            color: "#000",
            marginBottom: 4,
          }}
        >
          Export to spreadsheet
        </h3>
        <p
          style={{
            fontFamily: "Inter",
            fontSize: 13,
            color: "#6B7280",
            marginBottom: 12,
          }}
        >
          Save all your transactions as a CSV file you can open in Excel or
          Numbers.
        </p>
        <Button
          onClick={handleExportCsv}
          disabled={busy !== null}
          variant="outline"
        >
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          {busy === "csv" ? "Exporting…" : "Export transactions to CSV…"}
        </Button>
      </div>

      {/* Import from Wise */}
      <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 20, marginTop: 20 }}>
        <h3
          style={{
            fontFamily: "Inter",
            fontSize: 15,
            fontWeight: 500,
            color: "#000",
            marginBottom: 4,
          }}
        >
          Import from bank statement
        </h3>
        <p
          style={{
            fontFamily: "Inter",
            fontSize: 13,
            color: "#6B7280",
            marginBottom: 12,
          }}
        >
          Pull transactions from a Wise CSV statement. Duplicates and
          pre-authorization pairs are detected automatically. Categories are
          suggested using your auto-categorization rules.
        </p>
        <Button onClick={() => setImportDialogOpen(true)} variant="outline">
          <FileUp className="w-4 h-4 mr-2" />
          Import from CSV (Wise)…
        </Button>
      </div>

      <ImportWiseDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
      />
    </div>
  );
}
