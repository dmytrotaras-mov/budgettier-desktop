import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/hooks/useCurrency";
import { Wallet as WalletIcon, DollarSign, CreditCard, Plus, X } from "lucide-react";
import type { Wallet } from "@shared/schema";

interface StartingBalanceDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function StartingBalanceDialog({ isOpen, onClose }: StartingBalanceDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();
  const [balances, setBalances] = useState<{ [walletId: string]: string }>({});
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ["/api/wallets"],
  });

  const createWalletMutation = useMutation({
    mutationFn: (wallet: { name: string; type: string; balance: string }) =>
      apiRequest("POST", "/api/wallets", wallet),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({
        title: "Wallet created",
        description: "New wallet has been added successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error creating wallet",
        description: error?.message || "Failed to create wallet",
        variant: "destructive"
      });
    },
  });

  const updateWalletMutation = useMutation({
    mutationFn: ({ id, name, type }: { id: string; name: string; type: string }) =>
      apiRequest("PUT", `/api/wallets/${id}`, { name, type }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      setEditingWalletId(null);
      toast({
        title: "Wallet updated",
        description: "Wallet name has been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating wallet",
        description: error?.message || "Failed to update wallet",
        variant: "destructive"
      });
    },
  });

  const deleteWalletMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/wallets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({
        title: "Wallet deleted",
        description: "Wallet has been removed successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting wallet",
        description: error?.message || "Failed to delete wallet",
        variant: "destructive"
      });
    },
  });

  const adjustBalanceMutation = useMutation({
    mutationFn: ({ id, newBalance }: { id: string; newBalance: string }) =>
      apiRequest("POST", `/api/wallets/${id}/adjust-balance`, { newBalance, createTransaction: false }),
    onError: (error: any) => {
      toast({
        title: "Error adjusting balance",
        description: error?.message || "Failed to adjust balance",
        variant: "destructive"
      });
    },
  });

  const handleAddWallet = () => {
    createWalletMutation.mutate({
      name: "New Wallet",
      type: "cash",
      balance: "0"
    });
  };

  const handleDeleteWallet = (id: string) => {
    deleteWalletMutation.mutate(id);
  };

  const handleStartEdit = (wallet: Wallet) => {
    setEditingWalletId(wallet.id);
    setEditingName(wallet.name);
  };

  const handleSaveEdit = (wallet: Wallet) => {
    if (editingName.trim() === "") {
      toast({
        title: "Invalid name",
        description: "Wallet name cannot be empty",
        variant: "destructive"
      });
      return;
    }
    updateWalletMutation.mutate({
      id: wallet.id,
      name: editingName.trim(),
      type: wallet.type
    });
  };

  const handleCancelEdit = () => {
    setEditingWalletId(null);
    setEditingName("");
  };

  const handleTypeChange = (wallet: Wallet, newType: string) => {
    updateWalletMutation.mutate({
      id: wallet.id,
      name: wallet.name,
      type: newType
    });
  };

  const handleSave = async () => {
    const walletsToUpdate = Object.entries(balances).filter(([_, balance]) => {
      const numBalance = parseFloat(balance);
      return balance !== "" && !isNaN(numBalance) && numBalance > 0;
    });

    if (walletsToUpdate.length === 0) {
      toast({
        title: "No balances to set",
        description: "Please enter at least one wallet balance",
        variant: "destructive"
      });
      return;
    }

    try {
      // Update all wallets with entered balances
      await Promise.all(
        walletsToUpdate.map(([walletId, balance]) =>
          adjustBalanceMutation.mutateAsync({ id: walletId, newBalance: balance })
        )
      );

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });

      toast({
        title: "Starting balances set",
        description: "Your wallet balances have been updated successfully",
      });

      // Reset state and close dialog
      setBalances({});
      onClose();
    } catch (error) {
      // Error handling is done in the mutation
    }
  };

  const handleBalanceChange = (walletId: string, value: string) => {
    setBalances(prev => ({
      ...prev,
      [walletId]: value
    }));
  };

  const getWalletIcon = (type: string) => {
    switch (type) {
      case "cash":
        return <DollarSign className="h-5 w-5 text-green-600" />;
      case "bank":
        return <WalletIcon className="h-5 w-5 text-blue-600" />;
      case "credit":
        return <CreditCard className="h-5 w-5 text-purple-600" />;
      default:
        return <WalletIcon className="h-5 w-5 text-gray-600" />;
    }
  };

  const totalStartingBalance = Object.values(balances).reduce((sum, balance) => {
    const num = parseFloat(balance);
    return sum + (isNaN(num) ? 0 : num);
  }, 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Starting balance</DialogTitle>
          <DialogDescription className="space-y-2">
            <p>Enter the current balance for each of your wallets to get started tracking your finances.</p>
            <p className="text-xs text-gray-500 italic">
              This won't create any transaction records—it only updates your wallet balances to match your current funds, keeping your transaction history clean and charts accurate.
            </p>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Add Wallet Button */}
          <Button
            onClick={handleAddWallet}
            variant="outline"
            className="w-full border border-gray-200 hover:border-gray-300 rounded-lg h-auto p-3"
            disabled={createWalletMutation.isPending}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Wallet
          </Button>

          {/* Wallets List */}
          {wallets.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-gray-600">
                No wallets yet. Click "Add Wallet" to create your first wallet.
              </p>
            </div>
          ) : (
            <>
              {wallets.map((wallet) => (
                <div
                  key={wallet.id}
                  className="space-y-2 p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                >
                  {/* Wallet Header - Name, Type, Delete on one line */}
                  <div className="flex items-center gap-2">
                    {getWalletIcon(wallet.type)}

                    {/* Wallet Name (editable on click) */}
                    {editingWalletId === wallet.id ? (
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => handleSaveEdit(wallet)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(wallet);
                          if (e.key === "Escape") handleCancelEdit();
                        }}
                        autoFocus
                        className="h-7 text-sm font-medium flex-1"
                      />
                    ) : (
                      <span
                        onClick={() => handleStartEdit(wallet)}
                        className="font-medium cursor-pointer hover:text-blue-600 transition-colors flex-1"
                      >
                        {wallet.name}
                      </span>
                    )}

                    {/* Wallet Type Selector */}
                    <Select
                      value={wallet.type}
                      onValueChange={(value) => handleTypeChange(wallet, value)}
                    >
                      <SelectTrigger className="w-24 h-7 text-xs border-gray-200 hover:border-gray-300 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank">Bank</SelectItem>
                        <SelectItem value="credit">Credit</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Delete Button */}
                    <button
                      onClick={() => handleDeleteWallet(wallet.id)}
                      className="w-7 h-7 border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-800 rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Balance Input */}
                  <Input
                    id={`wallet-${wallet.id}`}
                    type="number"
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    value={balances[wallet.id] || ""}
                    onChange={(e) => handleBalanceChange(wallet.id, e.target.value)}
                    className="mt-2"
                  />
                </div>
              ))}

              {/* Total Balance */}
              {totalStartingBalance > 0 && (
                <div className="pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Total Starting Balance:</span>
                    <span className="text-lg font-bold text-gray-900">
                      {formatCurrency(totalStartingBalance)}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {wallets.length > 0 && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={adjustBalanceMutation.isPending || totalStartingBalance === 0}
              className="bg-mono-black hover:bg-mono-gray-800 text-mono-white"
            >
              {adjustBalanceMutation.isPending ? "Saving..." : "Set Starting Balance"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
