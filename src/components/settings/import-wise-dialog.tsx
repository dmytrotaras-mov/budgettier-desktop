// Wise CSV importer UI.
//
// Three stages:
//   "pick"     — choose file + target wallet
//   "preview"  — show parsed rows, let user check/edit category, transfer source
//   "done"     — show summary
//
// The "preview" table is the heavy lifting. Each row has:
//   - checkbox to include/exclude
//   - badges (duplicate, pre-auth, transfer, fee, cashback, uncategorized)
//   - category dropdown (for income/expense; disabled for transfers)
//   - source-wallet dropdown (for transfers only)

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, AlertCircle } from "lucide-react";
import type { Wallet, Category } from "@shared/schema";

interface PreviewRow {
  external_id: string;
  type: "income" | "expense" | "transfer";
  amount: string;
  date_ms: number;
  description: string;
  merchant: string;
  suggested_category_id: string | null;
  suggested_from_wallet_id: string | null;
  flags: string[];
  include: boolean;
}

interface PreviewResult {
  rows: PreviewRow[];
  summary: {
    total: number;
    to_import: number;
    duplicates: number;
    pre_auth: number;
    transfers: number;
    uncategorized: number;
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ImportWiseDialog({ open, onClose }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<"pick" | "preview" | "done">("pick");
  const [busy, setBusy] = useState(false);
  const [filePath, setFilePath] = useState<string>("");
  const [targetWalletId, setTargetWalletId] = useState<string>("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [doneSummary, setDoneSummary] = useState<{ inserted: number; skipped: number } | null>(
    null,
  );
  // Merchant patterns the user chose to remember → saved as category rules on import.
  // Map of pattern (e.g. "Bolt") → categoryId.
  const [rulesToSave, setRulesToSave] = useState<Record<string, string>>({});
  // Active "apply to similar?" prompt after the user picks a category for a row.
  const [applyPrompt, setApplyPrompt] = useState<{
    rowIdx: number;
    pattern: string;
    categoryId: string;
    similarCount: number;
  } | null>(null);

  const { data: wallets = [] } = useQuery<Wallet[]>({ queryKey: ["/api/wallets"] });
  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ["/api/categories"] });

  const expenseCategories = categories.filter((c: any) => c.type === "expense");
  const incomeCategories = categories.filter((c: any) => c.type === "income");

  const reset = () => {
    setStage("pick");
    setBusy(false);
    setFilePath("");
    setTargetWalletId("");
    setPreview(null);
    setDoneSummary(null);
    setRulesToSave({});
    setApplyPrompt(null);
  };

  // Derive the "significant" part of a merchant string to use as a rule pattern.
  // "Bolt.euo2605021646 Tallinn" → "Bolt", "Flix M nchen" → "Flix",
  // "Rewe Markt Gmbh-Zw Berlin" → "Rewe". Takes the leading run of letters
  // (stops at first digit, dot, or space).
  const derivePattern = (merchant: string): string => {
    const m = (merchant || "").trim();
    const match = m.match(/^[A-Za-zÀ-ÿ]+/);
    return match ? match[0] : m.split(/[\s.]/)[0] || m;
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const pickFile = async () => {
    try {
      const picked = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (picked && !Array.isArray(picked)) setFilePath(picked);
    } catch (err: any) {
      toast({
        title: "File pick failed",
        description: String(err?.message || err),
        variant: "destructive",
      });
    }
  };

  const loadPreview = async () => {
    if (!filePath) {
      toast({ title: "Pick a file first", variant: "destructive" });
      return;
    }
    if (!targetWalletId) {
      toast({ title: "Pick the target wallet", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const result = await invoke<PreviewResult>("preview_wise_csv", {
        filePath,
      });
      setPreview(result);
      setStage("preview");
    } catch (err: any) {
      toast({
        title: "Failed to parse CSV",
        description: String(err?.message || err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const updateRow = (idx: number, patch: Partial<PreviewRow>) => {
    if (!preview) return;
    const rows = preview.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    setPreview({ ...preview, rows });
  };

  // Called when the user picks a category for a row. If other rows share the
  // same merchant pattern and have no category yet, raise the "apply to
  // similar?" prompt.
  const onPickCategory = (idx: number, categoryId: string) => {
    if (!preview) return;
    const rows = preview.rows.map((r, i) =>
      i === idx ? { ...r, suggested_category_id: categoryId } : r,
    );
    const picked = preview.rows[idx];
    const pattern = derivePattern(picked.merchant || picked.description);
    // Count other expense/income rows with same pattern still needing a category.
    const similar = rows.filter(
      (r, i) =>
        i !== idx &&
        r.type !== "transfer" &&
        !r.suggested_category_id &&
        derivePattern(r.merchant || r.description).toLowerCase() === pattern.toLowerCase(),
    );
    setPreview({ ...preview, rows });
    if (pattern) {
      setApplyPrompt({
        rowIdx: idx,
        pattern,
        categoryId,
        similarCount: similar.length,
      });
    }
  };

  // User accepted the prompt: fill similar rows now + queue the rule for saving.
  const acceptApplyPrompt = () => {
    if (!preview || !applyPrompt) return;
    const { pattern, categoryId } = applyPrompt;
    const rows = preview.rows.map((r) => {
      if (
        r.type !== "transfer" &&
        !r.suggested_category_id &&
        derivePattern(r.merchant || r.description).toLowerCase() === pattern.toLowerCase()
      ) {
        return { ...r, suggested_category_id: categoryId };
      }
      return r;
    });
    setPreview({ ...preview, rows });
    setRulesToSave((prev) => ({ ...prev, [pattern]: categoryId }));
    setApplyPrompt(null);
  };

  const doImport = async () => {
    if (!preview) return;
    const rows = preview.rows
      .filter((r) => r.include)
      .map((r) => ({
        external_id: r.external_id,
        type: r.type,
        amount: r.amount,
        date_ms: r.date_ms,
        description: r.description,
        category_id: r.type === "transfer" ? null : r.suggested_category_id,
        from_wallet_id: r.type === "transfer" ? r.suggested_from_wallet_id : null,
      }));

    // Client-side validation before sending
    const missingCat = rows.find(
      (r) => r.type !== "transfer" && !r.category_id,
    );
    if (missingCat) {
      toast({
        title: "Fix uncategorized rows",
        description: `Row "${missingCat.description}" needs a category before import.`,
        variant: "destructive",
      });
      return;
    }
    const missingWallet = rows.find(
      (r) => r.type === "transfer" && !r.from_wallet_id,
    );
    if (missingWallet) {
      toast({
        title: "Fix transfer rows",
        description: `Transfer "${missingWallet.description}" needs a source wallet.`,
        variant: "destructive",
      });
      return;
    }

    setBusy(true);
    try {
      const res = await invoke<{ inserted: number; skipped: number }>(
        "import_wise_csv",
        {
          input: { rows, target_wallet_id: targetWalletId },
        },
      );
      // Persist any remembered merchant→category rules so future imports and
      // manual entry auto-categorize them. Best-effort — a failed rule save
      // shouldn't fail the import that already succeeded.
      const patterns = Object.entries(rulesToSave);
      for (const [pattern, categoryId] of patterns) {
        try {
          await invoke("create_category_rule", {
            input: { pattern, categoryId },
          });
        } catch {
          /* ignore — rule may already exist */
        }
      }
      if (patterns.length > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/category-rules"] });
      }

      setDoneSummary(res);
      setStage("done");
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
    } catch (err: any) {
      toast({
        title: "Import failed",
        description: String(err?.message || err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const formatDate = (ms: number) => {
    const d = new Date(ms);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const thisYear = new Date().getUTCFullYear();
    const y = d.getUTCFullYear();
    // "26 May" for the current year, "26 May 24" otherwise.
    return y === thisYear
      ? `${d.getUTCDate()} ${months[d.getUTCMonth()]}`
      : `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${String(y).slice(2)}`;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent
        className="md:!max-w-[1100px] md:!w-[92vw]"
        style={{ maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        <DialogHeader>
          <DialogTitle>
            {stage === "pick" && "Import from Wise CSV"}
            {stage === "preview" && "Review transactions before import"}
            {stage === "done" && "Import complete"}
          </DialogTitle>
        </DialogHeader>

        {/* ============ Stage 1: pick ============ */}
        {stage === "pick" && (
          <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>
                CSV file
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="outline" onClick={pickFile} disabled={busy}>
                  <FileUp className="w-4 h-4 mr-2" />
                  {filePath ? "Change file" : "Pick CSV file…"}
                </Button>
                {filePath && (
                  <div
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      background: "#F3F4F6",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "#6B7280",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {filePath.split("/").pop()}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>
                Import into wallet
              </label>
              <Select value={targetWalletId} onValueChange={setTargetWalletId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick the Wise wallet" />
                </SelectTrigger>
                <SelectContent>
                  {wallets.map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} ({w.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>
                Card transactions and direct debits land here. Internal Wise
                "Moved from X" transfers will use the X wallet as source.
              </p>
            </div>
          </div>
        )}

        {/* ============ Stage 2: preview ============ */}
        {stage === "preview" && preview && (
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {/* Summary bar */}
            <div
              style={{
                display: "flex",
                gap: 16,
                padding: "10px 14px",
                background: "#F9FAFB",
                borderRadius: 8,
                fontSize: 12,
                marginBottom: 12,
                flexWrap: "wrap",
              }}
            >
              <span><b>{preview.summary.to_import}</b> to import</span>
              <span style={{ color: "#6B7280" }}>·</span>
              <span>{preview.summary.total} total</span>
              {preview.summary.duplicates > 0 && (
                <>
                  <span style={{ color: "#6B7280" }}>·</span>
                  <span style={{ color: "#9CA3AF" }}>
                    {preview.summary.duplicates} already imported
                  </span>
                </>
              )}
              {preview.summary.pre_auth > 0 && (
                <>
                  <span style={{ color: "#6B7280" }}>·</span>
                  <span style={{ color: "#9CA3AF" }}>
                    {preview.summary.pre_auth} pre-auth (skipped)
                  </span>
                </>
              )}
              {preview.summary.transfers > 0 && (
                <>
                  <span style={{ color: "#6B7280" }}>·</span>
                  <span>{preview.summary.transfers} transfers</span>
                </>
              )}
              {preview.summary.uncategorized > 0 && (
                <>
                  <span style={{ color: "#6B7280" }}>·</span>
                  <span style={{ color: "#DC2626" }}>
                    <AlertCircle className="inline w-3 h-3 mr-1" />
                    {preview.summary.uncategorized} uncategorized
                  </span>
                </>
              )}
            </div>

            {/* "Apply to similar + remember" prompt after a category pick */}
            {applyPrompt && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  marginBottom: 12,
                  background: "#EFF6FF",
                  border: "1px solid #BFDBFE",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              >
                <span style={{ flex: 1, color: "#1E40AF" }}>
                  Remember <b>{applyPrompt.pattern}</b> as this category
                  {applyPrompt.similarCount > 0
                    ? ` and apply to ${applyPrompt.similarCount} similar row${applyPrompt.similarCount === 1 ? "" : "s"} now?`
                    : " for future imports?"}
                </span>
                <Button
                  size="sm"
                  onClick={acceptApplyPrompt}
                  style={{ height: 28, fontSize: 12 }}
                >
                  Yes
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setApplyPrompt(null)}
                  style={{ height: 28, fontSize: 12 }}
                >
                  No
                </Button>
              </div>
            )}

            {/* Table — fixed layout so columns share the full dialog width
                without horizontal scroll. Flags moved under the description. */}
            <div style={{ flex: 1, overflowY: "auto", border: "1px solid #E5E7EB", borderRadius: 8 }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "34px" }} />
                  <col style={{ width: "72px" }} />
                  <col />
                  <col style={{ width: "96px" }} />
                  <col style={{ width: "44px" }} />
                  <col style={{ width: "190px" }} />
                </colgroup>
                <thead style={{ position: "sticky", top: 0, background: "#F9FAFB", zIndex: 1 }}>
                  <tr style={{ textAlign: "left", color: "#6B7280" }}>
                    <th style={{ padding: "8px 6px" }}></th>
                    <th style={{ padding: "8px 6px" }}>Date</th>
                    <th style={{ padding: "8px 6px" }}>Description</th>
                    <th style={{ padding: "8px 6px", textAlign: "right" }}>Amount</th>
                    <th style={{ padding: "8px 6px", textAlign: "center" }}>Type</th>
                    <th style={{ padding: "8px 6px" }}>Category / source</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, idx) => {
                    const isTransfer = r.type === "transfer";
                    const categoryList =
                      r.type === "income" ? incomeCategories : expenseCategories;
                    const typeIcon =
                      r.type === "income" ? "↑" : r.type === "expense" ? "↓" : "↔";
                    const typeColor =
                      r.type === "income" ? "#0F6E56" : r.type === "expense" ? "#991B1B" : "#185FA5";
                    // Pre-auth / duplicate rows render dimmed; their type icon greys out.
                    const dimIcon = !r.include;
                    return (
                      <tr
                        key={r.external_id}
                        style={{
                          borderTop: "1px solid #F3F4F6",
                          opacity: r.include ? 1 : 0.5,
                        }}
                      >
                        <td style={{ padding: "8px 6px", verticalAlign: "top" }}>
                          <Checkbox
                            checked={r.include}
                            onCheckedChange={(v) =>
                              updateRow(idx, { include: Boolean(v) })
                            }
                          />
                        </td>
                        <td style={{ padding: "8px 6px", verticalAlign: "top", color: "#6B7280", whiteSpace: "nowrap" }}>
                          {formatDate(r.date_ms)}
                        </td>
                        <td style={{ padding: "8px 6px", verticalAlign: "top", wordBreak: "break-word" }}>
                          <div style={{ fontWeight: 500 }}>
                            {r.merchant || r.description}
                          </div>
                          {/* Flags shown here, under the description, instead of a separate column */}
                          {r.flags.length > 0 && (
                            <div style={{ marginTop: 3, display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {r.flags.map((f) => (
                                <span
                                  key={f}
                                  style={{
                                    display: "inline-block",
                                    padding: "1px 6px",
                                    background:
                                      f === "duplicate"
                                        ? "#FEE2E2"
                                        : f === "uncategorized"
                                          ? "#FEF3C7"
                                          : f === "pre-auth"
                                            ? "#E5E7EB"
                                            : f === "transfer"
                                              ? "#DBEAFE"
                                              : "#F3F4F6",
                                    color:
                                      f === "duplicate"
                                        ? "#991B1B"
                                        : f === "uncategorized"
                                          ? "#92400E"
                                          : f === "transfer"
                                            ? "#1E40AF"
                                            : "#374151",
                                    borderRadius: 4,
                                    fontSize: 10,
                                    fontWeight: 500,
                                  }}
                                >
                                  {f}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td
                          style={{
                            padding: "8px 6px",
                            verticalAlign: "top",
                            textAlign: "right",
                            fontWeight: 500,
                            whiteSpace: "nowrap",
                            color: r.type === "income" ? "#0F6E56" : r.type === "expense" ? "#991B1B" : "#000",
                          }}
                        >
                          {r.type === "income" ? "+" : r.type === "expense" ? "−" : ""}
                          €{r.amount}
                        </td>
                        <td
                          style={{
                            padding: "8px 6px",
                            verticalAlign: "top",
                            textAlign: "center",
                            fontSize: 15,
                            fontWeight: 600,
                            color: dimIcon ? "#9CA3AF" : typeColor,
                          }}
                          title={r.type}
                        >
                          {typeIcon}
                        </td>
                        <td style={{ padding: "8px 6px", verticalAlign: "top" }}>
                          {isTransfer ? (
                            <Select
                              value={r.suggested_from_wallet_id ?? ""}
                              onValueChange={(v) =>
                                updateRow(idx, { suggested_from_wallet_id: v })
                              }
                            >
                              <SelectTrigger style={{ height: 32 }}>
                                <SelectValue placeholder="Source wallet…" />
                              </SelectTrigger>
                              <SelectContent>
                                {wallets
                                  .filter((w: any) => w.id !== targetWalletId)
                                  .map((w: any) => (
                                    <SelectItem key={w.id} value={w.id}>
                                      {w.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Select
                              value={r.suggested_category_id ?? ""}
                              onValueChange={(v) => onPickCategory(idx, v)}
                            >
                              <SelectTrigger style={{ height: 32 }}>
                                <SelectValue placeholder="Pick category…" />
                              </SelectTrigger>
                              <SelectContent>
                                {categoryList.map((c: any) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.emoji} {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============ Stage 3: done ============ */}
        {stage === "done" && doneSummary && (
          <div style={{ padding: "24px 0", textAlign: "center" }}>
            <div style={{ fontSize: 32, fontWeight: 600, color: "#059669" }}>
              {doneSummary.inserted}
            </div>
            <div style={{ color: "#6B7280", marginTop: 6 }}>
              transactions imported
              {doneSummary.skipped > 0 && (
                <> · {doneSummary.skipped} skipped (already in DB)</>
              )}
            </div>
            <p style={{ color: "#9CA3AF", fontSize: 12, marginTop: 16 }}>
              Wallet balances have been recomputed from the new history.
            </p>
          </div>
        )}

        <DialogFooter style={{ marginTop: 16 }}>
          {stage === "pick" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={loadPreview} disabled={busy || !filePath || !targetWalletId}>
                {busy ? "Parsing…" : "Preview"}
              </Button>
            </>
          )}
          {stage === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStage("pick")} disabled={busy}>
                Back
              </Button>
              <Button onClick={doImport} disabled={busy}>
                {busy ? "Importing…" : `Import ${preview?.summary.to_import ?? 0} rows`}
              </Button>
            </>
          )}
          {stage === "done" && <Button onClick={handleClose}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
