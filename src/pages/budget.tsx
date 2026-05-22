import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Wallet as WalletIcon, PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import TransactionForm from "@/components/track/transaction-form";
import BudgetTransactionPanel from "@/components/budget/budget-transaction-panel";
import BudgetPlanPanel from "@/components/budget/budget-plan-panel";
import ResponsiveContainer from "@/components/layout/responsive-container";
import { startOfMonth, endOfMonth, format, addMonths, subMonths } from "date-fns";
import { useCurrency } from "@/hooks/useCurrency";

export default function BudgetPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [selectedTransactionDate, setSelectedTransactionDate] = useState<Date | null>(null);
  const [mobilePanelView, setMobilePanelView] = useState<'transactions' | 'budget'>('transactions');

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

  // Memoize financial calculations (budget page excludes transactions marked as excludeFromBudget)
  const { totalIncome, totalExpenses, savings, savingsRate } = useMemo(() => {
    const income = filteredTransactions
      .filter((t: any) => t.type === "income" && !t.excludeFromBudget)
      .reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0);

    const expenses = filteredTransactions
      .filter((t: any) => t.type === "expense" && !t.excludeFromBudget)
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

  // Memoize total balance calculation (always actual, not filtered by month)
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

  const handleCurrentMonth = useCallback(() => {
    setSelectedDate(new Date());
  }, []);

  const isCurrentMonth = useMemo(() => {
    return format(selectedDate, "yyyy-MM") === format(new Date(), "yyyy-MM");
  }, [selectedDate]);

  // Memoize date range object to prevent child component re-renders
  const dateRange = useMemo(() => ({
    start: monthStart,
    end: monthEnd
  }), [monthStart, monthEnd]);

  // Memoize dialog handlers
  const handleAddTransaction = useCallback((date?: Date | null) => {
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

  return (
    <>
      <div className="md:min-h-screen pb-20 md:pb-0" style={{
        backgroundColor: '#F3F4F6',
        display: 'flex',
        flexDirection: 'column',
        height: '100%'
      }}>
        <ResponsiveContainer className="pt-8" style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0
        }}>

          {/* Calendar Switcher */}
        <div className="flex flex-col items-center mb-4 gap-2">
          {/* Month Navigation and Current Month Button */}
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-0 w-full sm:justify-between">
            {/* Spacer for desktop to center the month switcher */}
            <div className="hidden sm:block sm:w-[150px]"></div>

            {/* Month Navigation - centered */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePreviousMonth}
                className="h-10 w-10 p-0 hover:bg-white"
                style={{ borderRadius: '30px' }}
              >
                <ChevronLeft style={{ width: '26px', height: '26px' }} />
              </Button>

              <div
                style={{
                  fontFamily: 'Inter',
                  fontSize: '20px',
                  fontWeight: 500,
                  minWidth: '200px',
                  textAlign: 'center'
                }}
              >
                {format(selectedDate, "MMMM yyyy")}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleNextMonth}
                className="h-10 w-10 p-0 hover:bg-white"
                style={{ borderRadius: '30px' }}
              >
                <ChevronRight style={{ width: '26px', height: '26px' }} />
              </Button>
            </div>

            {/* Current Month Button - Tablet/Desktop: on the right */}
            <div className="hidden sm:flex sm:w-[150px] sm:justify-end sm:min-h-[48px]">
              {!isCurrentMonth && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCurrentMonth}
                  style={{
                    fontFamily: 'Inter',
                    fontSize: '14px',
                    fontWeight: 500,
                    height: '48px',
                    minHeight: '48px',
                    padding: '0 20px',
                    borderRadius: '30px'
                  }}
                >
                  Current Month
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Top Stats Panels */}
        <div
          className="bg-white w-full gap-[15px] sm:gap-[15px] p-[8px] sm:p-[15px] rounded-[12px] sm:rounded-[20px]"
          style={{
            minHeight: '80px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: '11px'
          }}
        >
          {/* Income */}
          <div className="stat-box flex flex-col justify-center items-center sm:items-start" style={{ flex: '1 1 auto', minWidth: '120px' }}>
            <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
              <TrendingUp className="w-[16px] h-[16px] sm:w-[20px] sm:h-[20px]" style={{ color: '#48EB87' }} />
              <p className="text-[13px] sm:text-[15px]" style={{ fontFamily: 'Inter', fontWeight: 400, color: '#000' }}>Income</p>
            </div>
            <p className="text-[20px] sm:text-[24px]" style={{ fontFamily: 'Inter', fontWeight: 700, color: '#000' }}>
              {formatCurrency(totalIncome)}
            </p>
          </div>

          {/* Expenses */}
          <div className="stat-box flex flex-col justify-center items-center sm:items-start" style={{ flex: '1 1 auto', minWidth: '120px' }}>
            <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
              <TrendingDown className="w-[16px] h-[16px] sm:w-[20px] sm:h-[20px]" style={{ color: '#ED4040' }} />
              <p className="text-[13px] sm:text-[15px]" style={{ fontFamily: 'Inter', fontWeight: 400, color: '#000' }}>Expenses</p>
            </div>
            <p className="text-[20px] sm:text-[24px]" style={{ fontFamily: 'Inter', fontWeight: 700, color: '#000' }}>
              {formatCurrency(totalExpenses)}
            </p>
          </div>

          {/* Savings */}
          <div className="stat-box flex flex-col justify-center items-center sm:items-start" style={{ flex: '1 1 auto', minWidth: '120px' }}>
            <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
              <PiggyBank className="w-[16px] h-[16px] sm:w-[20px] sm:h-[20px]" style={{ color: '#EDE140' }} />
              <p className="text-[13px] sm:text-[15px]" style={{ fontFamily: 'Inter', fontWeight: 400, color: '#000' }}>Savings</p>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <p className="text-[20px] sm:text-[24px]" style={{ fontFamily: 'Inter', fontWeight: 700, color: '#000' }}>
                {formatCurrency(savings)}
              </p>
              <span
                className="text-[8px] sm:text-[10px] px-[4px] sm:px-[6px] py-[1px] sm:py-[2px]"
                style={{
                  fontFamily: 'Inter',
                  fontWeight: 700,
                  color: '#000',
                  backgroundColor: '#EDE140',
                  borderRadius: '4px'
                }}
              >
                {savingsRate.toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Total Balance */}
          <div
            className="stat-box flex flex-col justify-center items-center sm:items-start rounded-[12px] sm:rounded-[20px] p-[10px] sm:p-[16px_20px]"
            style={{
              flex: '1 1 auto',
              backgroundColor: '#F3F4F6',
              minWidth: '120px'
            }}
          >
            <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
              <WalletIcon className="w-[16px] h-[16px] sm:w-[20px] sm:h-[20px]" style={{ color: '#000' }} />
              <p className="text-[13px] sm:text-[15px]" style={{ fontFamily: 'Inter', fontWeight: 400, color: '#000' }}>Balance</p>
            </div>
            <p className="text-[20px] sm:text-[24px]" style={{ fontFamily: 'Inter', fontWeight: 700, color: '#000' }}>
              {formatCurrency(totalBalance)}
            </p>
          </div>
        </div>

        {/* Mobile Panel Toggle Buttons - Only show on mobile (below 768px) */}
        <div className="flex md:hidden gap-0" style={{ marginBottom: '0' }}>
          <button
            onClick={() => setMobilePanelView('transactions')}
            style={{
              flex: 1,
              height: '48px',
              backgroundColor: mobilePanelView === 'transactions' ? '#fff' : 'transparent',
              border: 'none',
              borderRadius: mobilePanelView === 'transactions' ? '20px 20px 0 0' : '0',
              fontFamily: 'Inter',
              fontSize: '20px',
              fontWeight: 500,
              color: '#000',
              position: 'relative',
              zIndex: mobilePanelView === 'transactions' ? 10 : 1
            }}
            className="transition-colors"
          >
            Transactions
          </button>
          <button
            onClick={() => setMobilePanelView('budget')}
            style={{
              flex: 1,
              height: '48px',
              backgroundColor: mobilePanelView === 'budget' ? '#fff' : 'transparent',
              border: 'none',
              borderRadius: mobilePanelView === 'budget' ? '20px 20px 0 0' : '0',
              fontFamily: 'Inter',
              fontSize: '20px',
              fontWeight: 500,
              color: '#000',
              position: 'relative',
              zIndex: mobilePanelView === 'budget' ? 10 : 1
            }}
            className="transition-colors"
          >
            Budget
          </button>
        </div>

        {/* Transaction and Plan Budget Panels */}
        <style>{`
          /* Mobile: Remove borders and adjust corners for seamless tab merge */
          @media (max-width: 767px) {
            .mobile-panel-wrapper-transactions > *,
            .mobile-panel-wrapper-transactions .bg-white {
              border: none !important;
              border-radius: 0 20px 20px 20px !important;
              box-shadow: none !important;
            }
            .mobile-panel-wrapper-budget > *,
            .mobile-panel-wrapper-budget .bg-white {
              border: none !important;
              border-radius: 20px 0 20px 20px !important;
              box-shadow: none !important;
            }
          }
          /* Desktop: Restore normal borders and corners */
          @media (min-width: 768px) {
            .mobile-panel-wrapper-transactions .bg-white,
            .mobile-panel-wrapper-budget .bg-white {
              border-radius: 20px !important;
            }
          }
          /* Remove aspect ratio and make panels fill to bottom of viewport */
          @media (max-width: 767px) {
            .mobile-panel-wrapper-transactions:not(.hidden),
            .mobile-panel-wrapper-budget:not(.hidden) {
              display: flex !important;
              flex-direction: column !important;
              flex: 1 !important;
              min-height: 0 !important;
            }
          }
          @media (min-width: 768px) {
            .mobile-panel-wrapper-transactions,
            .mobile-panel-wrapper-budget {
              display: flex !important;
              flex-direction: column !important;
              height: calc(100vh - 313px - 20px) !important; /* viewport - top content - bottom padding */
              min-height: 400px !important;
            }
          }
          .mobile-panel-wrapper-transactions > div,
          .mobile-panel-wrapper-budget > div {
            aspect-ratio: auto !important;
            height: 100% !important;
            display: flex !important;
            flex-direction: column !important;
          }
          .mobile-panel-wrapper-transactions .bg-white,
          .mobile-panel-wrapper-budget .bg-white {
            aspect-ratio: auto !important;
            height: 100% !important;
            min-height: 0 !important;
            flex: 1 !important;
            display: flex !important;
            flex-direction: column !important;
          }
          /* Ensure content area inside panels can scroll */
          .mobile-panel-wrapper-transactions .bg-white > div:last-child,
          .mobile-panel-wrapper-budget .bg-white > div:last-child {
            flex: 1 !important;
            min-height: 0 !important;
            overflow-y: auto !important;
          }
        `}</style>
        <div className="flex flex-col md:flex-row gap-[11px] md:pb-5" style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden'
        }}>
          {/* Transaction Panel - Always visible on desktop, conditionally on mobile */}
          <div
            className={`${mobilePanelView === 'transactions' ? 'block' : 'hidden md:block'} mobile-panel-wrapper-transactions`}
            style={{ flex: 1, minHeight: 0, height: '100%' }}
          >
            <BudgetTransactionPanel
              dateRange={dateRange}
              selectedDate={selectedDate}
              onAddTransaction={handleAddTransaction}
            />
          </div>

          {/* Plan Budget Panel - Always visible on desktop, conditionally on mobile */}
          <div
            className={`${mobilePanelView === 'budget' ? 'block' : 'hidden md:block'} mobile-panel-wrapper-budget`}
            style={{ flex: 1, minHeight: 0, height: '100%' }}
          >
            <BudgetPlanPanel
              dateRange={dateRange}
              selectedDate={selectedDate}
            />
          </div>
        </div>

        </ResponsiveContainer>
      </div>

      {/* Add Transaction Modal */}
      <Dialog open={quickAddOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-2xl lg:max-w-3xl rounded-2xl" aria-describedby="add-transaction-description">
          <DialogHeader className="hidden">
            <DialogTitle className="sr-only">Add Transaction</DialogTitle>
            <DialogDescription id="add-transaction-description">
              Add Transaction
            </DialogDescription>
          </DialogHeader>
          <div className="mt-0">
            <TransactionForm
              onSuccess={handleTransactionSuccess}
              initialDate={selectedTransactionDate}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
