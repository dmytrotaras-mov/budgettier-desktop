// Settings → Wallets: total balance, each wallet with its type and opening
// balance, and an add/edit dialog.
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { Banknote, Building2, ChartLine, CreditCard, PiggyBank, Plus, Trash2 } from "lucide-react";
import OpeningBalanceDialog from "@/components/wallets/opening-balance-dialog";
import { SettingsCard } from "./settings-ui";

const WALLET_TYPES: Record<string, { label: string; icon: typeof Banknote }> = {
  bank: { label: "Bank", icon: Building2 },
  cash: { label: "Cash", icon: Banknote },
  savings: { label: "Savings", icon: PiggyBank },
  investment: { label: "Investments", icon: ChartLine },
  credit: { label: "Credit card", icon: CreditCard },
};
const typeInfo = (type: string) => WALLET_TYPES[type] ?? WALLET_TYPES.cash;

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
  const [startAmount, setStartAmount] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [openingWallet, setOpeningWallet] = useState<any | null>(null);

  const isNew = editing && !editing.id;

  const openDialog = (wallet: any) => {
    setEditing(wallet);
    setName(wallet.name ?? "");
    setType(wallet.type ?? "bank");
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
        const created: any = await apiCall("POST", "/api/wallets", { name: name.trim(), type, balance: "0" });
        const amount = parseFloat(startAmount.replace(",", "."));
        if (amount && !Number.isNaN(amount)) {
          await invoke("set_opening_balance", {
            input: { walletId: created.id, amount: amount.toFixed(2), date: startDate },
          });
        }
      } else {
        await apiCall("PUT", `/api/wallets/${editing.id}`, { name: name.trim(), type });
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
          const info = typeInfo(wallet.type);
          const Icon = info.icon;
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
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-[18px] w-[18px] text-gray-600" />
                </div>
                <div className="min-w-0">
                  <div style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 500, color: "#000" }}>{wallet.name}</div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: "#6B7280" }}>
                    {info.label}
                    {opening
                      ? ` · started with ${formatCurrency(parseFloat(opening.amount))} on ${format(parseISO(opening.date), "d MMM yyyy")}`
                      : " · no opening balance"}
                  </div>
                </div>
              </div>
              <span
                className="tabular-nums"
                style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 600, color: balance < 0 ? "#DC2626" : "#000" }}
              >
                {formatCurrency(balance)}
              </span>
            </div>
          );
        })}
      </SettingsCard>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isNew ? "Add wallet" : "Edit wallet"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) save.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="wallet-name">Name</Label>
              <Input id="wallet-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="N26" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(WALLET_TYPES).map(([value, { label }]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isNew ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="wallet-start">Opening balance</Label>
                  <Input
                    id="wallet-start"
                    inputMode="decimal"
                    value={startAmount}
                    onChange={(e) => setStartAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wallet-start-date">As of</Label>
                  <Input id="wallet-start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5">
                <div>
                  <div className="text-sm font-medium">Opening balance</div>
                  <div className="text-xs text-gray-500">Money in this wallet before you started tracking</div>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setOpeningWallet(editing)}>
                  Edit
                </Button>
              </div>
            )}

            <DialogFooter className="flex-row items-center sm:justify-between gap-2">
              {!isNew ? (
                confirmDelete ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => remove.mutate()}
                    disabled={remove.isPending}
                  >
                    {remove.isPending ? "Deleting…" : `Delete ${editing?.name}`}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                )
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!name.trim() || save.isPending}>
                  {save.isPending ? "Saving…" : isNew ? "Add wallet" : "Save"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
