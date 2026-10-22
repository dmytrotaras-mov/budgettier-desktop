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

import { useEffect, useState } from "react";
import { POSITIVE, NEGATIVE } from "@/lib/colors";
import { ImportPickStep, ImportSteps } from "./import-pick-step";
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
import { FileUp, AlertCircle, AlertTriangle, ArrowRight } from "lucide-react";
import type { Wallet, Category } from "@shared/schema";
import { useSections, isHiddenCategory } from "@/lib/sectionUtils";

interface PreviewRow {
  external_id: string;
  type: "income" | "expense" | "transfer";
  amount: string;
  date_ms: number;
  description: string;
  merchant: string;
  suggested_category_id: string | null;
  // Rule pattern that auto-filled the category (cleared once the user picks).
  matched_pattern: string | null;
  // Transfers: the other wallet, the other balance's name as Wise wrote it,
  // and whether money left the imported wallet (negative amount).
  suggested_other_wallet_id: string | null;
  other_name: string | null;
  outgoing: boolean;
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
  // Balance after the statement's latest operation — checked against the
  // wallet once the import is done.
  statement_balance: { balance: string; date_ms: number } | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const LAST_WALLET_KEY = "wiseImportWalletId";
// Each Wise balance has its own statement ("statement_<account>_EUR_…csv") and
// its own wallet here; remember which wallet each account goes to, and which
// wallet each balance name in "Moved … to <name>" means.
const ACCOUNT_WALLETS_KEY = "wiseAccountWallets";
const BALANCE_NAMES_KEY = "wiseBalanceNames";

function readMap(key: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}
function writeMap(key: string, patch: Record<string, string>) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...readMap(key), ...patch }));
  } catch {
    // A convenience only; ignore storage errors.
  }
}
const accountOf = (path: string) => path.match(/statement_(\d+)_/)?.[1] ?? null;

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
  // Statement balance vs the wallet after import: diff = Budgettier − bank.
  const [bankCheck, setBankCheck] = useState<{ diff: number; bank: number; at: number } | null>(null);
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

  // Pre-select the wallet used last time (or one named "Wise") so a routine
  // import is just: pick file → Preview.
  useEffect(() => {
    if (!open || targetWalletId || wallets.length === 0) return;
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_WALLET_KEY);
    } catch {
      // No remembered wallet — fall through to the name match.
    }
    const pick =
      wallets.find((w: any) => w.id === last) ??
      wallets.find((w: any) => /wise/i.test(w.name));
    if (pick) setTargetWalletId(pick.id);
  }, [open, wallets, targetWalletId]);
  // A statement of a known Wise account goes to the wallet it went to before.
  useEffect(() => {
    const account = accountOf(filePath);
    const known = account ? readMap(ACCOUNT_WALLETS_KEY)[account] : undefined;
    if (known && wallets.some((w: any) => w.id === known)) setTargetWalletId(known);
  }, [filePath, wallets]);
  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ["/api/categories"] });
  const { data: allSections = [] } = useSections();

  const expenseCategories = categories.filter((c: any) => c.type === "expense" && !isHiddenCategory(c, allSections));
  const incomeCategories = categories.filter((c: any) => c.type === "income" && !isHiddenCategory(c, allSections));

  const reset = () => {
    setStage("pick");
    setBusy(false);
    setFilePath("");
    setTargetWalletId("");
    setPreview(null);
    setDoneSummary(null);
    setBankCheck(null);
    setRulesToSave({});
    setApplyPrompt(null);
  };

  // Derive the "significant" part of a merchant string to use as a rule pattern.
  //   "Bolt.euo2605021646 Tallinn" → "Bolt"     "H&m Home De0191" → "H&m"
  //   "Ls Akkurat Cafe Berlin"     → "Akkurat"  "Sumup  *Schneiderei" → "Schneiderei"
  //   "Dm Drogerie Sagt Danke"     → "Dm Drogerie"
  // Payment-processor prefixes are skipped (they front many unrelated shops),
  // short first words get the next word added, and anything under 3 characters
  // is rejected — "A" or "H" would match almost every merchant.
  const PROCESSOR_PREFIXES = new Set(["sumup", "spc", "sp", "ls", "sq", "zettle", "iz", "uzr", "nyx", "paypal", "pp"]);
  const GENERIC_WORDS = new Set(["card", "paid", "to", "received", "moved", "eur", "transfer", "money", "from", "the"]);
  const derivePattern = (merchant: string): string => {
    let words = (merchant || "").replace(/\*/g, " ").trim().split(/\s+/).filter(Boolean);
    while (words.length > 1 && PROCESSOR_PREFIXES.has(words[0].toLowerCase())) words = words.slice(1);
    if (words.length === 0) return "";
    const lead = (w: string) => w.match(/^[\p{L}&'+]+/u)?.[0] ?? "";
    let pattern = lead(words[0]) || words[0];
    if ((pattern.length < 3 || GENERIC_WORDS.has(pattern.toLowerCase())) && words[1]) {
      pattern = `${pattern} ${lead(words[1]) || words[1]}`;
    }
    return pattern.length >= 3 ? pattern : "";
  };

  // A row still needs attention if it's included but missing its required
  // field: a category for income/expense, or a source wallet for transfers.
  const rowNeedsAttention = (r: PreviewRow): boolean => {
    if (!r.include) return false;
    if (r.type === "transfer") return !r.suggested_other_wallet_id;
    return !r.suggested_category_id;
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
      // Fill in balances the user has matched to a wallet before ("EUR" → Wise).
      const names = readMap(BALANCE_NAMES_KEY);
      result.rows = result.rows.map((r) =>
        r.type === "transfer" && !r.suggested_other_wallet_id && r.other_name && names[r.other_name] && names[r.other_name] !== targetWalletId
          ? { ...r, suggested_other_wallet_id: names[r.other_name] }
          : r,
      );
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

  // Picking the other wallet for one "Moved … to 10%" row fills every row that
  // names the same balance, and is remembered for next time.
  const pickOtherWallet = (idx: number, walletId: string) => {
    if (!preview) return;
    const name = preview.rows[idx].other_name;
    const rows = preview.rows.map((r, i) =>
      i === idx || (name && r.type === "transfer" && r.other_name === name && !r.suggested_other_wallet_id)
        ? { ...r, suggested_other_wallet_id: walletId }
        : r,
    );
    setPreview({ ...preview, rows });
    if (name) writeMap(BALANCE_NAMES_KEY, { [name]: walletId });
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
      i === idx ? { ...r, suggested_category_id: categoryId, matched_pattern: null } : r,
    );
    const picked = preview.rows[idx];
    const pattern = derivePattern(picked.merchant || picked.description);
    if (!pattern) {
      setPreview({ ...preview, rows });
      return;
    }
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
        return { ...r, suggested_category_id: categoryId, matched_pattern: null };
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
        other_wallet_id: r.type === "transfer" ? r.suggested_other_wallet_id : null,
        outgoing: r.outgoing,
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
      (r) => r.type === "transfer" && !r.other_wallet_id,
    );
    if (missingWallet) {
      toast({
        title: "Fix transfer rows",
        description: `Transfer "${missingWallet.description}" needs the other wallet.`,
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
      try {
        localStorage.setItem(LAST_WALLET_KEY, targetWalletId);
      } catch {
        // Remembering the wallet is a convenience; ignore storage errors.
      }
      const account = accountOf(filePath);
      if (account) writeMap(ACCOUNT_WALLETS_KEY, { [account]: targetWalletId });
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

      // The statement says what the bank held after its last operation:
      // record that as a balance check, so a mismatch shows up right away.
      if (preview.statement_balance) {
        try {
          const { balance, date_ms } = preview.statement_balance;
          const saved = await invoke<{ appBalance: string }>("record_wallet_check", {
            input: { walletId: targetWalletId, bankBalance: balance, atMs: date_ms, source: "statement" },
          });
          setBankCheck({ diff: Math.round((parseFloat(saved.appBalance) - parseFloat(balance)) * 100) / 100, bank: parseFloat(balance), at: date_ms });
          queryClient.invalidateQueries({ queryKey: ["wallet-checks"] });
        } catch {
          // The import itself succeeded; the check is a bonus.
        }
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
        className={stage === "preview" ? "md:!max-w-[1100px] md:!w-[92vw]" : "sm:!max-w-[480px] rounded-[20px]"}
        style={{ maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="gap-2">
          <DialogTitle>
            {stage === "pick" && "Import from Wise"}
            {stage === "preview" && "Review transactions before import"}
            {stage === "done" && "Import complete"}
          </DialogTitle>
          <ImportSteps current={stage === "pick" ? 0 : stage === "preview" ? 1 : 2} />
        </DialogHeader>

        {/* ============ Stage 1: pick ============ */}
        {stage === "pick" && (
          <ImportPickStep
            filePath={filePath}
            onPickFile={pickFile}
            onDropFile={setFilePath}
            wallets={wallets}
            walletId={targetWalletId}
            onWallet={setTargetWalletId}
            busy={busy}
          />
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

            {/* Attention banner — how many included rows still need a category
                or a transfer source. These are sorted to the top of the table. */}
            {(() => {
              const attentionCount = preview.rows.filter(rowNeedsAttention).length;
              if (attentionCount === 0) return null;
              return (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 14px",
                    marginBottom: 12,
                    background: "#FFFBEB",
                    border: "1px solid #FDE68A",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "#92400E",
                  }}
                >
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                  <span>
                    <b>{attentionCount}</b> transaction{attentionCount === 1 ? "" : "s"} still
                    need{attentionCount === 1 ? "s" : ""} a category or source — shown at the top.
                  </span>
                </div>
              );
            })()}

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
                  {preview.rows
                    .map((r, idx) => ({ r, idx })) // keep original index for updates
                    .sort((a, b) => {
                      // Rows needing attention float to the top; once resolved
                      // they fall back to their natural date order (newest first).
                      const na = rowNeedsAttention(a.r) ? 0 : 1;
                      const nb = rowNeedsAttention(b.r) ? 0 : 1;
                      if (na !== nb) return na - nb;
                      return b.r.date_ms - a.r.date_ms;
                    })
                    .map(({ r, idx }) => {
                    const isTransfer = r.type === "transfer";
                    const needsAttention = rowNeedsAttention(r);
                    const categoryList =
                      r.type === "income" ? incomeCategories : expenseCategories;
                    const typeIcon =
                      r.type === "income" ? "↑" : r.type === "expense" ? "↓" : "↔";
                    const typeColor =
                      r.type === "income" ? POSITIVE : r.type === "expense" ? NEGATIVE : "#185FA5";
                    // Pre-auth / duplicate rows render dimmed; their type icon greys out.
                    const dimIcon = !r.include;
                    return (
                      <tr
                        key={r.external_id}
                        style={{
                          borderTop: "1px solid #F3F4F6",
                          opacity: r.include ? 1 : 0.5,
                          background: needsAttention ? "#FFFBEB" : "transparent",
                          boxShadow: needsAttention ? "inset 3px 0 0 #F59E0B" : "none",
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
                                        ? NEGATIVE
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
                            color: r.type === "income" ? POSITIVE : r.type === "expense" ? NEGATIVE : "#000",
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
                            <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-gray-500 whitespace-nowrap" title={r.outgoing ? "Money left this wallet" : "Money came into this wallet"}>
                              {r.outgoing ? "To" : "From"}
                            </span>
                            <Select
                              value={r.suggested_other_wallet_id ?? ""}
                              onValueChange={(v) => pickOtherWallet(idx, v)}
                            >
                              <SelectTrigger style={{ height: 32 }}>
                                <SelectValue placeholder={r.other_name ? `${r.other_name}…` : "Wallet…"} />
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
                            </div>
                          ) : (
<div>
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
                              {r.matched_pattern && r.suggested_category_id && (
                                <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 3 }}>
                                  auto · rule “{r.matched_pattern}”
                                </div>
                              )}
                            </div>
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
            {bankCheck && (
              <div
                className="mx-auto mt-4 max-w-sm rounded-2xl px-4 py-3 text-sm"
                style={{ backgroundColor: Math.abs(bankCheck.diff) < 0.01 ? "#ECFDF5" : "#FEF2F2", color: Math.abs(bankCheck.diff) < 0.01 ? POSITIVE : NEGATIVE }}
              >
                {Math.abs(bankCheck.diff) < 0.01
                  ? `✓ Matches the bank: €${bankCheck.bank.toFixed(2)} after the last operation (${formatDate(bankCheck.at)})`
                  : `Budgettier shows €${Math.abs(bankCheck.diff).toFixed(2)} ${bankCheck.diff > 0 ? "more" : "less"} than the statement (€${bankCheck.bank.toFixed(2)} on ${formatDate(bankCheck.at)}). Use Check in Wallets to find it.`}
              </div>
            )}
            <p style={{ color: "#9CA3AF", fontSize: 12, marginTop: 16 }}>
              Wallet balances have been recomputed from the new history.
            </p>
          </div>
        )}

        <DialogFooter
          className={stage === "pick" ? "gap-2 border-t border-gray-100 -mx-6 px-6 pt-4" : "gap-2"}
          style={{ marginTop: stage === "pick" ? 20 : 16 }}
        >
          {stage === "pick" && (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="h-10 px-4 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-black transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={loadPreview}
                disabled={busy || !filePath || !targetWalletId}
                className="inline-flex items-center gap-1.5 h-10 pl-5 pr-4 rounded-full bg-black text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                {busy ? "Reading…" : "Review transactions"}
                {!busy && <ArrowRight size={16} />}
              </button>
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
