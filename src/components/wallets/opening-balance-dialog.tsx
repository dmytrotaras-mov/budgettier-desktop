// Set a wallet's opening balance — the money it held before you started
// tracking. Stored as a hidden transaction (see Rust opening_balance.rs).
//
// The date defaults to the day before the wallet's first transaction, but can
// be changed. The amount is signed: positive = starting money, negative = debt.

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  walletId: string;
  walletName: string;
}

interface OpeningBalance {
  amount: string;
  date: string;
}

export default function OpeningBalanceDialog({ open, onClose, walletId, walletName }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !walletId) return;
    setLoading(true);
    (async () => {
      try {
        const existing = await invoke<OpeningBalance | null>("get_opening_balance", {
          walletId,
        });
        if (existing) {
          setAmount(existing.amount);
          setDate(existing.date);
        } else {
          setAmount("");
          const suggested = await invoke<string>("suggest_opening_date", { walletId });
          setDate(suggested);
        }
      } catch (err: any) {
        toast({
          title: "Couldn't load opening balance",
          description: String(err?.message || err),
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [open, walletId, toast]);

  const handleSave = async () => {
    const normalized = amount.trim().replace(",", ".");
    if (normalized === "" || isNaN(Number(normalized))) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast({ title: "Enter a valid date (YYYY-MM-DD)", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await invoke("set_opening_balance", {
        input: { walletId, amount: normalized, date },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({
        title: "Opening balance saved",
        description: `${walletName} now starts from €${Number(normalized).toFixed(2)} on ${date}.`,
      });
      onClose();
    } catch (err: any) {
      toast({
        title: "Failed to save",
        description: String(err?.message || err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Opening balance — {walletName}</DialogTitle>
        </DialogHeader>

        <div style={{ padding: "8px 0", display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ fontSize: 13, color: "#6B7280" }}>
            How much this wallet held <b>before</b> you started tracking. This
            lifts the balance to reflect real money, without counting as income.
          </p>

          <div>
            <Label htmlFor="ob-amount" style={{ fontSize: 13, marginBottom: 6, display: "block" }}>
              Amount (€)
            </Label>
            <Input
              id="ob-amount"
              placeholder="e.g. 1500.00 (use minus for debt)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={loading}
              autoComplete="off"
            />
          </div>

          <div>
            <Label htmlFor="ob-date" style={{ fontSize: 13, marginBottom: 6, display: "block" }}>
              As of date
            </Label>
            <Input
              id="ob-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={loading}
            />
            <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>
              Defaults to the day before this wallet's first transaction.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy || loading}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
