import { useQuery } from "@tanstack/react-query";
import { Wallet, CreditCard, Banknote } from "lucide-react";
import type { Wallet as WalletType } from "@shared/schema";
import { useCurrency } from "@/hooks/useCurrency";

export default function WalletInfo() {
  const { data: wallets = [], isLoading } = useQuery<WalletType[]>({
    queryKey: ["/api/wallets"],
  });

  const { formatCurrency } = useCurrency();

  const getWalletIcon = (type: string) => {
    switch (type) {
      case "bank":
        return CreditCard;
      case "credit":
        return CreditCard;
      case "cash":
      default:
        return Banknote;
    }
  };

  const totalBalance = wallets.reduce((sum, wallet) => 
    sum + parseFloat(wallet.balance || "0"), 0
  );

  if (isLoading) {
    return (
      <div className="text-center py-4 text-gray-500">Loading...</div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Total Balance */}
      <div className="p-4 bg-gray-50 rounded-lg">
        <div className="text-xs text-gray-600 mb-1">Total Balance</div>
        <div className={`text-lg font-bold ${totalBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
          {formatCurrency(Math.abs(totalBalance))}
        </div>
      </div>

      {/* Individual Wallets */}
      <div className="space-y-3">
        {wallets.map((wallet) => {
          const Icon = getWalletIcon(wallet.type);
          const balance = parseFloat(wallet.balance || "0");
          
          return (
            <div key={wallet.id} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Icon className="h-4 w-4 text-gray-600" />
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {wallet.name}
                  </div>
                  <div className="text-xs text-gray-500 capitalize">
                    {wallet.type}
                  </div>
                </div>
              </div>
              <div className={`text-sm font-medium ${balance >= 0 ? "text-gray-900" : "text-red-600"}`}>
                {formatCurrency(Math.abs(balance))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}