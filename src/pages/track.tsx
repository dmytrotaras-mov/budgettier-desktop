import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, TrendingUp, TrendingDown, Wallet as WalletIcon, ArrowUpDown, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import TransactionForm from "@/components/track/transaction-form";
import TransactionList from "@/components/track/transaction-list";
import { startOfMonth, endOfMonth, format, addMonths, subMonths } from "date-fns";
import { useCurrency } from "@/hooks/useCurrency";
import { cn } from "@/lib/utils";

export default function TrackPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [selectedTransactionDate, setSelectedTransactionDate] = useState<Date | null>(null);

  // Fetch transactions for the selected month
  const { data: transactions = [] } = useQuery({
    queryKey: ["/api/transactions", startOfMonth(selectedDate).toISOString(), endOfMonth(selectedDate).toISOString()],
  });

  // Fetch wallet data for total balance
  const { data: wallets = [] } = useQuery({
    queryKey: ["/api/wallets"],
  });

  // Memoize date calculations
  const monthStart = useMemo(() => startOfMonth(selectedDate), [selectedDate]);
  const monthEnd = useMemo(() => endOfMonth(selectedDate), [selectedDate]);

  // Memoize filtered transactions to avoid recalculating on every render
  const filteredTransactions = useMemo(() => {
    return (transactions as any[]).filter((t: any) => {
      const transactionDate = new Date(t.date);
      return transactionDate >= monthStart && transactionDate <= monthEnd;
    });
  }, [transactions, monthStart, monthEnd]);

  // Memoize financial calculations
  const { totalIncome, totalExpenses, savings, savingsRate } = useMemo(() => {
    const income = filteredTransactions
      .filter((t: any) => t.type === "income")
      .reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0);

    const expenses = filteredTransactions
      .filter((t: any) => t.type === "expense")
      .reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0);

    const calculatedSavings = income - expenses;
    const rate = income > 0 ? (calculatedSavings / income) * 100 : 0;

    return {
      totalIncome: income,
      totalExpenses: expenses,
      savings: calculatedSavings,
      savingsRate: rate
    };
  }, [filteredTransactions]);

  // Memoize total balance calculation
  const totalBalance = useMemo(() => {
    return (wallets as any[]).reduce((sum: number, wallet: any) =>
      sum + parseFloat(wallet.balance || "0"), 0
    );
  }, [wallets]);

  const { formatCurrency } = useCurrency();

  // Memoize event handlers to prevent child re-renders
  const handlePreviousMonth = useCallback(() => {
    setSelectedDate(prev => subMonths(prev, 1));
  }, []);

  const handleNextMonth = useCallback(() => {
    setSelectedDate(prev => addMonths(prev, 1));
  }, []);

  const handleToday = useCallback(() => {
    setSelectedDate(new Date());
  }, []);

  const isCurrentMonth = useMemo(() => {
    return format(selectedDate, "yyyy-MM") === format(new Date(), "yyyy-MM");
  }, [selectedDate]);

  // Memoize dialog handlers
  const handleAddClick = useCallback((date?: Date | null) => {
    setSelectedTransactionDate(date || null);
    setQuickAddOpen(true);
  }, []);

  const handleDialogChange = useCallback((open: boolean) => {
    setQuickAddOpen(open);
    if (!open) {
      setSelectedTransactionDate(null);
    }
  }, []);

  const handleTransactionSuccess = useCallback(() => {
    setQuickAddOpen(false);
    setSelectedTransactionDate(null);
  }, []);

  // Memoize date range object to prevent TransactionList re-renders
  const dateRange = useMemo(() => ({
    start: monthStart,
    end: monthEnd
  }), [monthStart, monthEnd]);

  return (
    <div className="flex-1 overflow-auto pb-20 md:pb-0" style={{ backgroundColor: '#F3F4F6' }}>
      <div className="max-w-[1400px] mx-auto">

        {/* Month Navigation */}
        <div className="px-4 sm:px-6 lg:px-8 pt-6 pb-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePreviousMonth}
              className="h-10 w-10 p-0 hover:bg-white rounded-lg transition-all flex items-center justify-center"
              style={{ boxShadow: '0px 0px 0px 0px rgba(0, 0, 0, 0.03)' }}
            >
              <ChevronLeft className="h-4 w-4 text-gray-600" />
            </Button>

            <button
              onClick={handleToday}
              className={cn(
                "px-3 md:px-4 rounded-lg transition-all flex items-center justify-center gap-2 h-10 flex-1 md:flex-none",
                isCurrentMonth
                  ? "text-gray-900 bg-white"
                  : "text-gray-600 bg-white/50 hover:bg-white"
              )}
              style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: '14px',
                fontWeight: 400,
                boxShadow: '0px 0px 0px 0px rgba(0, 0, 0, 0.03)',
                minWidth: '160px'
              }}
            >
              <Calendar className="h-4 w-4" />
              <span className="truncate">{format(selectedDate, "MMMM yyyy")}</span>
            </button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleNextMonth}
              className="h-10 w-10 p-0 hover:bg-white rounded-lg transition-all flex items-center justify-center"
              style={{ boxShadow: '0px 0px 0px 0px rgba(0, 0, 0, 0.03)' }}
            >
              <ChevronRight className="h-4 w-4 text-gray-600" />
            </Button>
          </div>
        </div>

        <div className="px-4 sm:px-6 lg:px-8 pb-6">

          {/* Financial Overview - Horizontal Row with 18px gap */}
          <div className="grid grid-cols-2 lg:grid-cols-4 mb-[18px]" style={{ gap: '18px' }}>

            {/* Income */}
            <div className="bg-white rounded-2xl p-3 md:p-4 transition-all" style={{ boxShadow: '0px 0px 0px 0px rgba(0, 0, 0, 0.03)' }}>
              <div className="flex items-center gap-2 mb-1.5 md:mb-2">
                <TrendingUp className="h-3.5 w-3.5 md:h-4 md:w-4 text-emerald-600" />
                <p className="text-[11px] md:text-xs font-medium text-gray-600">Income</p>
              </div>
              <p className="text-xl md:text-2xl font-bold text-gray-900 truncate">
                {formatCurrency(totalIncome)}
              </p>
            </div>

            {/* Expenses */}
            <div className="bg-white rounded-2xl p-3 md:p-4 transition-all" style={{ boxShadow: '0px 0px 0px 0px rgba(0, 0, 0, 0.03)' }}>
              <div className="flex items-center gap-2 mb-1.5 md:mb-2">
                <TrendingDown className="h-3.5 w-3.5 md:h-4 md:w-4 text-rose-600" />
                <p className="text-[11px] md:text-xs font-medium text-gray-600">Expenses</p>
              </div>
              <p className="text-xl md:text-2xl font-bold text-gray-900 truncate">
                {formatCurrency(totalExpenses)}
              </p>
            </div>

            {/* Savings */}
            <div className="bg-white rounded-2xl p-3 md:p-4 transition-all" style={{ boxShadow: '0px 0px 0px 0px rgba(0, 0, 0, 0.03)' }}>
              <div className="flex items-center gap-2 mb-1.5 md:mb-2">
                <ArrowUpDown className="h-3.5 w-3.5 md:h-4 md:w-4 text-blue-600" />
                <p className="text-[11px] md:text-xs font-medium text-gray-600">Savings</p>
              </div>
              <div className="flex items-baseline gap-1.5 md:gap-2 min-w-0">
                <p className={cn(
                  "text-xl md:text-2xl font-bold truncate",
                  savings >= 0 ? "text-emerald-600" : "text-rose-600"
                )}>
                  {savings >= 0 ? '+' : ''}{formatCurrency(Math.abs(savings))}
                </p>
                <span className={cn(
                  "text-[10px] md:text-xs font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0",
                  savings >= 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-rose-50 text-rose-700'
                )}>
                  {savingsRate.toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Total Balance */}
            <div className="bg-white rounded-2xl p-3 md:p-4 transition-all" style={{ boxShadow: '0px 0px 0px 0px rgba(0, 0, 0, 0.03)' }}>
              <div className="flex items-center gap-2 mb-1.5 md:mb-2">
                <WalletIcon className="h-3.5 w-3.5 md:h-4 md:w-4 text-gray-900" />
                <p className="text-[11px] md:text-xs font-medium text-gray-600">Total Balance</p>
              </div>
              <p className="text-xl md:text-2xl font-bold text-gray-900 truncate">
                {formatCurrency(totalBalance)}
              </p>
            </div>
          </div>

          {/* Two Column Layout: Transactions (Left) + Budget Plan (Right) with 18px gap */}
          <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: '18px' }}>

            {/* Left Column - Transactions (1/2 width, under Income + Expenses) */}
            <div>
              <TransactionList
                dateRange={dateRange}
                showAddButton={true}
                onAddClick={handleAddClick}
              />
            </div>

            {/* Right Column - Budget Plan (1/2 width, under Savings + Total Balance) */}
            <div>
              <TransactionList
                dateRange={dateRange}
                planOnly={true}
              />
            </div>

          </div>

        </div>
      </div>

      {/* Add Transaction Modal Dialog */}
      <Dialog open={quickAddOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-2xl lg:max-w-3xl rounded-2xl" aria-describedby="add-transaction-description">
          <DialogDescription id="add-transaction-description" className="sr-only">
            Create a new transaction to track your income or expenses
          </DialogDescription>
          <TransactionForm
            onSuccess={handleTransactionSuccess}
            initialDate={selectedTransactionDate}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
