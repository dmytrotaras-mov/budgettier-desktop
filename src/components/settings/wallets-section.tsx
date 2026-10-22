// Settings → Wallets: total balance, each wallet with its type and opening
// balance, and an add/edit dialog (name, type, color, icon).
//
// A wallet's balance is always derived from its transactions (the Rust side
// recomputes it on startup), so a new wallet's starting money is stored as an
// opening balance rather than written into the balance column.

import { useState } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { format, parseISO } from "date-fns";
import { apiCall } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { Plus, Trash2 } from "lucide-react";
import OpeningBalanceDialog from "@/components/wallets/opening-balance-dialog";
import { tint } from "@/lib/sectionUtils";
import { WALLET_EMOJI, WALLET_TYPES, WalletIcon, walletColor, walletType } from "@/lib/walletUtils";
import { SettingsCard } from "./settings-ui";
import { DialogShell, Field, pill, textInput } from "./dialog-shell";
import { ColorPicker, EmojiPicker } from "./categories/pickers";
import { CheckBalanceDialog } from "@/components/wallets/check-balance-dialog";
import { WalletCheckStatus } from "@/components/wallets/wallet-check-status";
import { checkState, needsChecking, useWalletChecks } from "@/lib/walletChecks";

interface OpeningBalance {
  amount: string;
  date: string;
}

const todayISO = () => format(new Date(), "yyyy-MM-dd");

export default function WalletsSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();
  const { data: wallets = [] } = useQuery<any[]>({ queryKey: ["/api/wallets"] });

  const openings = useQueries({
    queries: wallets.map((w: any) => ({ queryKey: ["/api/opening-balance", w.id] })),
  });
  const openingFor = (index: number) => openings[index]?.data as OpeningBalance | null | undefined;

  const total = wallets.reduce((sum: number, w: any) => sum + parseFloat(w.balance || "0"), 0);

  // Dialog state: null = closed, {} = new wallet, wallet = editing.
  const [editing, setEditing] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("bank");
  const [color, setColor] = useState<string | null>(null); // null = type default
  const [emoji, setEmoji] = useState(""); // "" = type icon
  const [startAmount, setStartAmount] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [openingWallet, setOpeningWallet] = useState<any | null>(null);
  const [checkingWallet, setCheckingWallet] = useState<any | null>(null);
  const { data: checks = [] } = useWalletChecks();
  const { data: allTransactions = [] } = useQuery<any[]>({ queryKey: ["/api/transactions"] });
  const checkOf = (id: string) => checks.find((c) => c.walletId === id);

  const isNew = editing && !editing.id;

  const openDialog = (wallet: any) => {
    setEditing(wallet);
    setName(wallet.name ?? "");
    setType(wallet.type ?? "bank");
    setColor(wallet.color ?? null);
    setEmoji(wallet.emoji ?? "");
    setStartAmount("");
    setStartDate(todayISO());
    setConfirmDelete(false);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
    queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/opening-balance"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (isNew) {
        const created: any = await apiCall("POST", "/api/wallets", { name: name.trim(), type, balance: "0", color: color ?? "", emoji });
        const amount = parseFloat(startAmount.replace(",", "."));
        if (amount && !Number.isNaN(amount)) {
          await invoke("set_opening_balance", {
            input: { walletId: created.id, amount: amount.toFixed(2), date: startDate },
          });
        }
      } else {
        await apiCall("PUT", `/api/wallets/${editing.id}`, { name: name.trim(), type, color: color ?? "", emoji });
      }
    },
    onSuccess: () => {
      refresh();
      toast({ title: isNew ? "Wallet added" : "Wallet saved" });
      setEditing(null);
    },
    onError: (error: any) =>
      toast({ title: "Couldn't save wallet", description: String(error?.message || error), variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: () => apiCall("DELETE", `/api/wallets/${editing.id}`),
    onSuccess: () => {
      refresh();
      toast({ title: "Wallet deleted" });
      setEditing(null);
    },
    onError: (error: any) => {
      setConfirmDelete(false);
      toast({ title: "Couldn't delete wallet", description: String(error?.message || error), variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <SettingsCard
        title="Wallets"
        description={`Total balance ${formatCurrency(total)}`}
        action={
          <Button
            size="sm"
            onClick={() => openDialog({})}
            style={{ height: 35, padding: "0 16px", borderRadius: 30, backgroundColor: "#000", color: "#fff", fontSize: 12 }}
            className="hover:bg-gray-800"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add wallet
          </Button>
        }
      >
        {wallets.length === 0 && (
          <p style={{ fontFamily: "Inter", fontSize: 13, color: "#6B7280", padding: "16px 0" }}>
            Add your bank account, cash or savings to start tracking balances.
          </p>
        )}
        {wallets.map((wallet: any, index: number) => {
          const info = walletType(wallet.type);
          const opening = openingFor(index);
          const balance = parseFloat(wallet.balance || "0");
          return (
            <div
              key={wallet.id}
              onClick={() => openDialog(wallet)}
              className="flex items-center justify-between gap-4 border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-gray-50 -mx-5 px-5 transition-colors"
              style={{ minHeight: 60, paddingTop: 10, paddingBottom: 10 }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <WalletIcon wallet={wallet} />
                <div className="min-w-0">
                  <div style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 500, color: "#000" }}>{wallet.name}</div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: "#6B7280" }}>
                    {info.label}
                    {opening
                      ? ` · started with ${formatCurrency(parseFloat(opening.amount))} on ${format(parseISO(opening.date), "d MMM yyyy")}`
                      : " · no opening balance"}
                  </div>
                  {needsChecking(wallet, allTransactions) && (
                    <div className="text-[12px] mt-0.5">
                      <WalletCheckStatus state={checkState(checkOf(wallet.id), new Date(), allTransactions)} money={formatCurrency} />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span
                  className="tabular-nums"
                  style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 600, color: balance < 0 ? "#DC2626" : "#000" }}
                >
                  {formatCurrency(balance)}
                </span>
                {needsChecking(wallet, allTransactions) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCheckingWallet(wallet);
                    }}
                    className="h-8 px-3 rounded-full bg-[#F3F4F6] text-[12px] font-medium text-black hover:bg-black hover:text-white transition-colors"
                  >
                    Check
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </SettingsCard>

      {editing !== null && (
        <DialogShell
          title={isNew ? "Add wallet" : "Edit wallet"}
          onClose={() => setEditing(null)}
          onSave={() => save.mutate()}
          saveLabel={save.isPending ? "Saving…" : isNew ? "Add wallet" : "Save"}
          canSave={!!name.trim() && !save.isPending}
          deleteSlot={
            isNew ? undefined : confirmDelete ? (
              <button
                type="button"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
                className={`${pill} bg-red-600 text-white hover:bg-red-700`}
              >
                {remove.isPending ? "Deleting…" : `Delete ${editing?.name}`}
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className={`${pill} inline-flex items-center gap-1.5 text-red-600 hover:bg-red-50`}>
                <Trash2 size={14} /> Delete
              </button>
            )
          }
        >
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="N26" className={textInput} autoFocus />
          </Field>
          <Field label="Type">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Type">
              {Object.entries(WALLET_TYPES).map(([value, t]) => {
                const active = type === value;
                const Icon = t.icon;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setType(value)}
                    className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium border transition-colors ${
                      active ? "border-black ring-1 ring-black text-black" : "border-gray-200 text-gray-600 hover:border-gray-400"
                    }`}
                    style={{ backgroundColor: active ? tint(walletColor({ type: value, color }), 0.88) : "#fff" }}
                  >
                    <Icon size={14} color={walletColor({ type: value, color })} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field
            label="Color"
            hint={color ? undefined : `Default for ${walletType(type).label.toLowerCase()} — pick one to make it yours`}
          >
            <div className="flex items-start gap-3">
              <ColorPicker value={walletColor({ type, color })} onChange={setColor} />
              {color && (
                <button type="button" onClick={() => setColor(null)} className={`${pill} text-gray-600 hover:bg-gray-100 hover:text-black whitespace-nowrap ml-auto`}>
                  Use default
                </button>
              )}
            </div>
          </Field>
          <Field label="Icon">
            <EmojiPicker
              value={emoji}
              onChange={setEmoji}
              tint={tint(walletColor({ type, color }), 0.85)}
              placeholder={(() => {
                const Icon = walletType(type).icon;
                return <Icon size={22} color={walletColor({ type, color })} />;
              })()}
              extraGroups={[{ name: "Wallets", items: WALLET_EMOJI }]}
              onReset={() => setEmoji("")}
              resetLabel="Type icon"
            />
          </Field>

          {isNew ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Opening balance">
                <input inputMode="decimal" value={startAmount} onChange={(e) => setStartAmount(e.target.value)} placeholder="0.00" className={textInput} />
              </Field>
              <Field label="As of">
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={textInput} />
              </Field>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
              <div>
                <div className="text-sm font-medium">Opening balance</div>
                <div className="text-xs text-gray-500">Money in this wallet before you started tracking</div>
              </div>
              <button type="button" onClick={() => setOpeningWallet(editing)} className={`${pill} bg-white border border-gray-200 hover:border-gray-400`}>
                Edit
              </button>
            </div>
          )}
        </DialogShell>
      )}

      {checkingWallet && (
        <CheckBalanceDialog
          wallet={checkingWallet}
          lastCheck={checkOf(checkingWallet.id)}
          formatCurrency={formatCurrency}
          onClose={() => setCheckingWallet(null)}
        />
      )}

      {openingWallet && (
        <OpeningBalanceDialog
          open={!!openingWallet}
          onClose={() => setOpeningWallet(null)}
          walletId={openingWallet.id}
          walletName={openingWallet.name}
        />
      )}
    </div>
  );
}
