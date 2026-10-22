// "Check balance": the user types what the bank app shows; we compare it with
// the wallet's balance and either confirm the match or help close the gap —
// by showing what changed since the last check (and likely duplicates), by
// adding the missing transaction, or by booking a Balance adjustment.

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { format } from "date-fns";
import { Check, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import TransactionForm from "@/components/track/transaction-form";
import { DialogShell, Field, pill, textInput } from "@/components/settings/dialog-shell";
import { useToast } from "@/hooks/use-toast";
import { NEGATIVE, POSITIVE } from "@/lib/colors";
import { WalletIcon } from "@/lib/walletUtils";
import { displayMerchantName } from "@/lib/merchantName";
import { WALLET_CHECKS_KEY, effectOn, type WalletCheck } from "@/lib/walletChecks";

interface Props {
  wallet: any;
  lastCheck?: WalletCheck;
  formatCurrency: (n: number) => string;
  onClose: () => void;
}

type Stage = { kind: "enter" } | { kind: "match" } | { kind: "off"; bank: number; diff: number };

const effect = effectOn;

export function CheckBalanceDialog({ wallet, lastCheck: latestCheck, formatCurrency, onClose }: Props) {
  // The check before this one — saving a new check must not move the
  // "since your last check" window to now.
  const [lastCheck] = useState(latestCheck);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "enter" });
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const { data: wallets = [] } = useQuery<any[]>({ queryKey: ["/api/wallets"] });
  const { data: transactions = [] } = useQuery<any[]>({ queryKey: ["/api/transactions"] });
  const { data: categories = [] } = useQuery<any[]>({ queryKey: ["/api/categories"] });
  const current = wallets.find((w) => w.id === wallet.id) ?? wallet;
  const appBalance = parseFloat(current.balance || "0");

  // What changed since the last check (or the last 45 days), newest first.
  const since = lastCheck ? lastCheck.checkedAt : Date.now() - 45 * 86400000;
  const recent = useMemo(
    () =>
      transactions
        .filter((t) => !t.isOpening && new Date(t.date).getTime() > since && effect(t, wallet.id) !== 0)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [transactions, since, wallet.id],
  );
  // Same amount, same direction, same day — the usual shape of a double entry.
  const duplicates = useMemo(() => {
    const seen = new Map<string, any[]>();
    for (const t of recent) {
      const key = `${format(new Date(t.date), "yyyy-MM-dd")}|${effect(t, wallet.id).toFixed(2)}`;
      seen.set(key, [...(seen.get(key) ?? []), t]);
    }
    return [...seen.values()].filter((g) => g.length > 1);
  }, [recent, wallet.id]);

  const parsed = parseFloat(value.replace(/\s/g, "").replace(",", "."));
  const valid = value.trim() !== "" && !Number.isNaN(parsed);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: WALLET_CHECKS_KEY });
    queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
    queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
  };
  const fail = (err: any) => toast({ title: "Couldn't check the balance", description: String(err?.message || err), variant: "destructive" });

  const check = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const saved = await invoke<WalletCheck>("record_wallet_check", { input: { walletId: wallet.id, bankBalance: parsed.toFixed(2) } });
      const diff = Math.round((parseFloat(saved.appBalance) - parsed) * 100) / 100;
      setStage(Math.abs(diff) < 0.01 ? { kind: "match" } : { kind: "off", bank: parsed, diff });
      queryClient.invalidateQueries({ queryKey: WALLET_CHECKS_KEY });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const adjust = async (bank: number) => {
    setBusy(true);
    try {
      await invoke("adjust_wallet_balance", { input: { walletId: wallet.id, bankBalance: bank.toFixed(2) } });
      refresh();
      setStage({ kind: "match" });
      toast({ title: `${wallet.name} matches the bank`, description: "The difference was booked as a balance adjustment — it isn't counted as spending." });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const categoryName = (t: any) => categories.find((c) => c.id === t.categoryId)?.name;
  const row = (t: any) => {
    const v = effect(t, wallet.id);
    return (
      <div key={t.id} className="flex items-center gap-3 py-1.5 text-[13px]">
        <span className="w-12 flex-shrink-0 text-gray-400 tabular-nums">{format(new Date(t.date), "d MMM")}</span>
        <span className="min-w-0 flex-1 truncate text-gray-900">
          {displayMerchantName(t.description) || categoryName(t) || (t.type === "transfer" ? "Transfer" : "—")}
          {categoryName(t) && displayMerchantName(t.description) && <span className="text-gray-400"> · {categoryName(t)}</span>}
        </span>
        <span className="flex-shrink-0 font-medium tabular-nums" style={{ color: v > 0 ? POSITIVE : "#111827" }}>
          {v > 0 ? "+" : "−"}
          {formatCurrency(Math.abs(v))}
        </span>
      </div>
    );
  };

  const header = (
    <div className="flex items-center gap-3">
      <WalletIcon wallet={current} size={40} />
      <div className="min-w-0">
        <div className="text-[15px] font-medium text-gray-900">{wallet.name}</div>
        <div className="text-xs text-gray-500">
          In Budgettier: <span className="font-medium text-gray-900 tabular-nums">{formatCurrency(appBalance)}</span>
          {lastCheck && <> · last checked {format(new Date(lastCheck.checkedAt), "d MMM yyyy")}</>}
        </div>
      </div>
    </div>
  );

  if (stage.kind === "match")
    return (
      <DialogShell title="Balance check" onClose={onClose} onSave={onClose} saveLabel="Done" canSave hideCancel>
        {header}
        <div className="flex flex-col items-center rounded-2xl bg-gray-50 px-4 py-6 text-center">
          <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-full text-white" style={{ backgroundColor: POSITIVE }}>
            <Check size={22} strokeWidth={3} />
          </span>
          <div className="text-[15px] font-medium text-gray-900">Matches the bank</div>
          <div className="mt-1 text-xs text-gray-500">Saved as checked today. Next time you'll only need to look at what's new since now.</div>
        </div>
      </DialogShell>
    );

  if (stage.kind === "off") {
    const more = stage.diff > 0; // Budgettier shows more than the bank → probably a missing expense
    return (
      <>
        <DialogShell
          title="Balance check"
          onClose={onClose}
          onCancel={onClose}
          cancelLabel="Later"
          onSave={() => adjust(stage.bank)}
          saveLabel={busy ? "Adjusting…" : "Adjust balance"}
          canSave={!busy}
          deleteSlot={
            <button type="button" onClick={() => setAdding(true)} className={`${pill} bg-[#F3F4F6] text-black hover:bg-black hover:text-white`}>
              Add transaction
            </button>
          }
        >
          {header}
          <div className="rounded-2xl bg-gray-50 px-4 py-3">
            <div className="text-[15px] font-medium" style={{ color: NEGATIVE }}>
              Budgettier shows {formatCurrency(Math.abs(stage.diff))} {more ? "more" : "less"} than your bank
            </div>
            <div className="mt-0.5 text-xs text-gray-500">
              Bank {formatCurrency(stage.bank)} · Budgettier {formatCurrency(appBalance)}.{" "}
              {more ? "Usually a spend that wasn't entered, or one entered twice." : "Usually money in that wasn't entered, or a spend entered twice."}
            </div>
          </div>
          {duplicates.length > 0 && (
            <Field label="Possible duplicates" hint="Same amount on the same day">
              <div className="rounded-2xl border border-amber-200 bg-amber-50/50 px-3 py-1">
                {duplicates.map((g) => (
                  <div key={g[0].id} className="flex items-center gap-2">
                    <Copy size={13} className="flex-shrink-0 text-amber-600" />
                    <div className="min-w-0 flex-1">{row(g[0])}</div>
                    <span className="text-[11px] text-amber-700">×{g.length}</span>
                  </div>
                ))}
              </div>
            </Field>
          )}
          <Field
            label={lastCheck ? `Since your last check · ${recent.length}` : `Last 45 days · ${recent.length}`}
            hint="Compare with the bank app — look for one that's missing or doubled"
          >
            <div className="max-h-56 overflow-y-auto rounded-2xl border border-gray-200 px-3 py-1">
              {recent.length === 0 ? <p className="py-4 text-center text-xs text-gray-400">No transactions in this period.</p> : recent.map(row)}
            </div>
          </Field>
          <p className="text-[11px] text-gray-400">
            Adjust balance books the difference as a balance adjustment: your wallet matches the bank, and it isn't counted as spending or income.
          </p>
        </DialogShell>

        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent className="max-w-lg rounded-2xl">
            <DialogHeader>
              <DialogTitle>Add the missing transaction</DialogTitle>
            </DialogHeader>
            <TransactionForm
              initialAmount={Math.abs(stage.diff).toFixed(2)}
              initialType={more ? "expense" : "income"}
              initialWalletId={wallet.id}
              onSuccess={() => {
                setAdding(false);
                refresh();
                setValue(stage.bank.toFixed(2));
                setStage({ kind: "enter" });
                toast({ title: "Added — check again to confirm" });
              }}
            />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <DialogShell title="Check balance" onClose={onClose} onSave={check} saveLabel={busy ? "Checking…" : "Check"} canSave={valid && !busy}>
      {header}
      <Field label="What does your bank app show right now?" hint="Open the bank app and type the balance you see">
        <div className="relative">
          <input
            autoFocus
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0.00"
            className={`${textInput} pl-8 text-[17px] tabular-nums`}
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">€</span>
        </div>
      </Field>
    </DialogShell>
  );
}
