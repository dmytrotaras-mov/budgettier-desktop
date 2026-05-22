import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, isToday, isYesterday, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, getDay } from "date-fns";
import { Wallet as WalletIcon, TrendingUp, TrendingDown, ArrowRight, Plus, ListFilter, List, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/hooks/useCurrency";
import type { Transaction, Category, Wallet } from "@shared/schema";
import TransactionEditDialog from "@/components/track/transaction-edit-dialog";
import TransactionForm from "@/components/track/transaction-form";

// Category emojis mapping
const categoryEmojis = {
  // Housing & Utilities
  "Rent/Mortgage": "🏠",
  "Electricity": "⚡",
  "Water": "💧",
  "Gas/Heating": "🔥",
  "Internet/Phone": "📶",
  "Home Maintenance": "🔨",
  "Property Tax": "🏠",
  "Home Insurance": "🏠",

  // Food & Drinks
  "Groceries": "🛒",
  "Restaurants/Cafes": "☕",
  "Food Delivery": "🛍️",
  "Coffee/Snacks": "☕",

  // Transportation
  "Public Transport": "🚌",
  "Fuel/Gas": "⛽",
  "Taxi/Ride Sharing": "🚗",
  "Car Maintenance": "🔧",
  "Car Insurance": "🚗",
  "Parking": "🅿️",

  // Health & Wellness
  "Health Insurance": "🏥",
  "Doctor/Dentist": "👩‍⚕️",
  "Medicine": "💊",
  "Gym/Fitness": "💪",
  "Mental Health": "🧠",

  // Entertainment & Leisure
  "Subscriptions": "📺",
  "Hobbies": "🎨",
  "Travel": "✈️",
  "Events/Cinema": "🎬",
  "Books/Media": "📚",

  // Shopping
  "Clothes/Shoes": "👕",
  "Home Goods": "🏠",
  "Electronics": "💻",
  "Personal Care": "🧴",

  // Finance & Obligations
  "Loans/Credit": "💳",
  "Savings/Investments": "📈",
  "Insurance": "🛡️",
  "Bank Fees": "🏦",

  // Other
  "Education": "📖",
  "Gifts/Charity": "🎁",
  "Miscellaneous": "📋",

  // Income
  "Salary": "💰",
  "Freelance": "💼",
  "Business": "🏢",
  "Investments": "📊",
  "Rental Income": "🏠",
  "Other Income": "💵",
};

interface BudgetTransactionPanelProps {
  dateRange: {
    start: Date;
    end: Date;
  };
  selectedDate: Date;
  onAddTransaction: (date?: Date) => void;
}

export default function BudgetTransactionPanel({ dateRange, selectedDate, onAddTransaction }: BudgetTransactionPanelProps) {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(null);
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [isAddTransactionInModal, setIsAddTransactionInModal] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();

  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions", dateRange.start.toISOString(), dateRange.end.toISOString()],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ["/api/wallets"],
  });

  const getCategory = (categoryId: string | null): Category | null => {
    if (!categoryId) return null;
    return categories.find(c => c.id === categoryId) || null;
  };

  const getCategoryName = (categoryId: string | null) => {
    const category = getCategory(categoryId);
    return category?.name || "Unknown";
  };

  const getWalletName = (walletId: string | null) => {
    if (!walletId) return "Unknown";
    const wallet = wallets.find(w => w.id === walletId);
    return wallet?.name || "Unknown";
  };

  const getCategoryEmoji = (category: Category) => {
    // Use the category's emoji from database first, fallback to hardcoded mapping for legacy categories
    return category.emoji || categoryEmojis[category.name as keyof typeof categoryEmojis] || "📋";
  };

  const getTransferEmoji = () => "🔄";

  const deleteTransactionMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", "/api/transactions/" + id),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Transaction deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete transaction",
        variant: "destructive",
      });
    },
  });

  const filteredTransactions = transactions.filter(transaction => {
    if (categoryFilter !== "all") {
      if (transaction.type === "transfer") {
        return false;
      }
      if (transaction.categoryId !== categoryFilter) {
        return false;
      }
    }
    if (typeFilter !== "all" && transaction.type !== typeFilter) return false;
    return true;
  });

  // Sort transactions by date (latest first) and group by date
  const sortedTransactions = [...filteredTransactions].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Group transactions by date
  const groupedTransactions: { [key: string]: Transaction[] } = {};
  sortedTransactions.forEach(transaction => {
    const dateKey = format(new Date(transaction.date), "yyyy-MM-dd");
    if (!groupedTransactions[dateKey]) {
      groupedTransactions[dateKey] = [];
    }
    groupedTransactions[dateKey].push(transaction);
  });

  const handleDeleteTransaction = (id: string) => {
    if (window.confirm("Are you sure you want to delete this transaction?")) {
      deleteTransactionMutation.mutate(id);
      handleCloseEditDialog();
    }
  };

  const handleEditTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    setIsEditDialogOpen(false);
    setEditingTransaction(null);
  };

  const getDateHeader = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isCurrentMonth = format(selectedDate, "yyyy-MM") === format(now, "yyyy-MM");

    if (isCurrentMonth && isToday(date)) {
      return "Today";
    } else if (isCurrentMonth && isYesterday(date)) {
      return "Yesterday";
    } else {
      return format(date, "d. MMM yyyy");
    }
  };

  const getTransactionsForDate = (date: Date) => {
    return filteredTransactions.filter(transaction => {
      const transactionDate = new Date(transaction.date);
      return isSameDay(transactionDate, date);
    });
  };

  const calculateDayTotals = (date: Date) => {
    const dayTransactions = getTransactionsForDate(date);
    const income = dayTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const expense = dayTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);
    return { income, expense };
  };

  const handleDateClick = (date: Date) => {
    setSelectedCalendarDate(date);
    setIsDateModalOpen(true);
    setIsAddTransactionInModal(false);
  };

  const handleCloseDateModal = () => {
    setIsDateModalOpen(false);
    setSelectedCalendarDate(null);
    setIsAddTransactionInModal(false);
  };

  return (
    <>
      <div
        className="bg-white overflow-hidden"
        style={{ flex: 1, aspectRatio: '525 / 632', display: 'flex', flexDirection: 'column', borderRadius: '20px' }}
      >
        {/* Header */}
        <div style={{ padding: '15px 20px', borderBottom: '1px solid #F3F4F6' }}>
          <div className="hidden md:flex items-center justify-between mb-3">
            <h2 style={{ fontFamily: 'Inter', fontSize: '24px', fontWeight: 500, color: '#000' }}>
              Transactions
            </h2>
          </div>

          <div className="flex items-center justify-between">
            {/* View Mode Toggle + Filter Button */}
            <div className="flex gap-2">
              {/* View Mode Toggle */}
              <button
                type="button"
                onClick={() => {
                  setViewMode(viewMode === 'list' ? 'calendar' : 'list');
                }}
                className="group"
                style={{
                  height: '48px',
                  minHeight: '48px',
                  minWidth: '48px',
                  width: '48px',
                  backgroundColor: '#fff',
                  border: '1px solid #F3F4F6',
                  borderRadius: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#000'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#fff'; }}
              >
                {viewMode === 'list' ? (
                  <List size={20} className="text-black group-hover:text-white transition-colors" />
                ) : (
                  <Calendar size={20} className="text-black group-hover:text-white transition-colors" />
                )}
              </button>

              {/* Filter Button - Only show in list view */}
              {viewMode === 'list' && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      onMouseEnter={(e) => {
                        if (categoryFilter === "all" && typeFilter === "all") {
                          e.currentTarget.style.backgroundColor = '#000';
                          const icon = e.currentTarget.querySelector('svg');
                          if (icon) icon.style.color = '#fff';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (categoryFilter === "all" && typeFilter === "all") {
                          e.currentTarget.style.backgroundColor = '#fff';
                          const icon = e.currentTarget.querySelector('svg');
                          if (icon) icon.style.color = '#000';
                        }
                      }}
                      style={{
                        width: '48px',
                        height: '48px',
                        minHeight: '48px',
                        minWidth: '48px',
                        backgroundColor: categoryFilter !== "all" || typeFilter !== "all" ? '#F3F4F6' : '#fff',
                        border: '1px solid #F3F4F6',
                        borderRadius: '30px',
                        padding: '0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background-color 0.2s'
                      }}
                    >
                      <ListFilter style={{ width: '20px', height: '20px', color: '#000', transition: 'color 0.2s' }} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-4" align="start">
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">Category</label>
                        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                          <SelectTrigger className="w-full h-9 text-sm">
                            <SelectValue placeholder="All Categories" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Categories</SelectItem>
                            {categories.map((category) => (
                              <SelectItem key={category.id} value={category.id}>
                                {category.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-2 block">Type</label>
                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                          <SelectTrigger className="w-full h-9 text-sm">
                            <SelectValue placeholder="All Types" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="expense">Expenses</SelectItem>
                            <SelectItem value="income">Income</SelectItem>
                            <SelectItem value="transfer">Transfers</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {(categoryFilter !== "all" || typeFilter !== "all") && (
                        <div className="pt-2 border-t border-gray-200">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full h-8 text-sm text-gray-600 hover:text-gray-800"
                            onClick={() => {
                              setCategoryFilter("all");
                              setTypeFilter("all");
                            }}
                          >
                            Reset Filters
                          </Button>
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Add Transaction Button */}
            <>
              <style>{`
                .add-transaction-btn {
                  width: 48px;
                  padding: 0;
                }
                @media (min-width: 1300px) {
                  .add-transaction-btn {
                    width: 160px;
                    padding-left: 18px;
                    padding-right: 18px;
                  }
                }
                .add-transaction-icon {
                  display: block;
                }
                .add-transaction-text {
                  display: none;
                }
                @media (min-width: 1300px) {
                  .add-transaction-icon {
                    display: none;
                  }
                  .add-transaction-text {
                    display: inline;
                  }
                }
              `}</style>
              <Button
                onClick={() => onAddTransaction()}
                style={{
                  height: '48px',
                  minHeight: '48px',
                  minWidth: '48px',
                  fontFamily: 'Inter',
                  fontSize: '14px',
                  fontWeight: 500,
                  borderRadius: '30px'
                }}
                className="bg-[#F3F4F6] text-black hover:bg-black hover:text-white add-transaction-btn"
              >
                <Plus className="w-5 h-5 add-transaction-icon" />
                <span className="add-transaction-text">Add Transaction</span>
              </Button>
            </>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '15px 20px' }}>
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-pulse">Loading...</div>
            </div>
          ) : viewMode === 'calendar' ? (
            // Calendar View
            <div>
              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className="text-center" style={{ fontFamily: 'Inter', fontSize: '10px', fontWeight: 600, color: '#6B7280', padding: '8px 0' }}>
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1">
                {(() => {
                  const monthStart = startOfMonth(selectedDate);
                  const monthEnd = endOfMonth(selectedDate);
                  const startDay = getDay(monthStart);
                  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

                  // Add empty cells for days before month starts
                  const cells: JSX.Element[] = [];
                  for (let i = 0; i < startDay; i++) {
                    cells.push(<div key={`empty-${i}`} />);
                  }

                  // Add day cells
                  days.forEach((day) => {
                    const { income, expense } = calculateDayTotals(day);
                    const isCurrentDay = isToday(day);
                    const hasTransactions = income > 0 || expense > 0;

                    cells.push(
                      <div
                        key={day.toISOString()}
                        onClick={() => handleDateClick(day)}
                        className="cursor-pointer transition-all"
                        style={{
                          border: isCurrentDay ? '2px solid #000' : '1px solid #E5E7EB',
                          borderRadius: '8px',
                          padding: '6px 4px',
                          minHeight: '70px',
                          display: 'flex',
                          flexDirection: 'column',
                          backgroundColor: '#fff',
                          color: '#000'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                      >
                        <div
                          style={{
                            fontFamily: 'Inter',
                            fontSize: '11px',
                            fontWeight: isCurrentDay ? 700 : 500,
                            marginBottom: '4px',
                            textAlign: 'center'
                          }}
                        >
                          {format(day, 'd')}
                        </div>
                        {hasTransactions && (
                          <div style={{ fontSize: '9px', fontFamily: 'Inter', lineHeight: '1.2' }}>
                            {income > 0 && (
                              <div style={{ color: '#10B981', fontWeight: 500, textAlign: 'center' }}>
                                +{formatCurrency(income.toString())}
                              </div>
                            )}
                            {expense > 0 && (
                              <div style={{ color: '#EF4444', fontWeight: 500, textAlign: 'center' }}>
                                -{formatCurrency(expense.toString())}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  });

                  return cells;
                })()}
              </div>
            </div>
          ) : Object.keys(groupedTransactions).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <WalletIcon className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No transactions found</h3>
              <p className="text-gray-600 text-center">
                {categoryFilter !== "all" || typeFilter !== "all"
                  ? "Try adjusting your filters to see more transactions."
                  : "Start by adding your first transaction."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.keys(groupedTransactions).map((dateKey) => (
                <div key={dateKey}>
                  {/* Date Header */}
                  <div
                    className="sticky"
                    style={{
                      top: 0,
                      backgroundColor: '#fff',
                      zIndex: 10,
                      paddingBottom: '8px',
                      borderBottom: '1px solid #E5E7EB',
                      marginBottom: '8px'
                    }}
                  >
                    <p style={{ fontFamily: 'Inter', fontSize: '10px', fontWeight: 600, color: '#6B7280' }}>
                      {getDateHeader(dateKey)}
                    </p>
                  </div>

                  {/* Transactions for this date */}
                  <div className="space-y-2">
                    {groupedTransactions[dateKey].map((transaction) => {
                      const isTransfer = transaction.type === 'transfer';
                      const category = getCategory(transaction.categoryId);
                      const categoryName = category?.name || "Unknown";
                      const walletName = getWalletName(transaction.walletId);
                      const fromWalletName = getWalletName(transaction.fromWalletId);
                      const toWalletName = getWalletName(transaction.toWalletId);
                      const emoji = isTransfer ? getTransferEmoji() : (category ? getCategoryEmoji(category) : "📋");
                      const isIncome = transaction.type === 'income';

                      return (
                        <div
                          key={transaction.id}
                          className="flex items-center justify-between p-3 md:p-2 hover:bg-gray-50 rounded-lg cursor-pointer"
                          onClick={() => handleEditTransaction(transaction)}
                        >
                          <div className="flex items-center gap-3 md:gap-2 flex-1 min-w-0">
                            <div className="w-10 h-10 md:w-8 md:h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-lg md:text-base">{emoji}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {transaction.description || (isTransfer ? `${fromWalletName} → ${toWalletName}` : categoryName)}
                              </p>
                              <div className="flex items-center gap-2">
                                <p className="text-xs text-gray-600">
                                  {isTransfer ? (
                                    <span className="flex items-center gap-1">
                                      {fromWalletName} <ArrowRight className="w-3 h-3" /> {toWalletName}
                                    </span>
                                  ) : (
                                    categoryName
                                  )}
                                </p>
                                {transaction.excludeFromBudget && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded">
                                    Excluded
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-right flex-shrink-0">
                            <p className={`text-base md:text-sm font-semibold flex items-center justify-end ${
                              isIncome ? "text-green-600" : isTransfer ? "text-blue-600" : "text-black"
                            }`}>
                              {isTransfer ? "" : (isIncome ? "+" : "-")}{formatCurrency(transaction.amount)}
                              {isTransfer ? (
                                <ArrowRight className="w-3 h-3 ml-1" />
                              ) : isIncome ? (
                                <TrendingUp className="w-3 h-3 ml-1" />
                              ) : (
                                <TrendingDown className="w-3 h-3 ml-1" />
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <TransactionEditDialog
        transaction={editingTransaction}
        isOpen={isEditDialogOpen}
        onClose={handleCloseEditDialog}
        onDelete={handleDeleteTransaction}
      />

      {/* Date Transactions Modal */}
      <Dialog open={isDateModalOpen} onOpenChange={(open) => {
        setIsDateModalOpen(open);
        if (!open) {
          setSelectedCalendarDate(null);
          setIsAddTransactionInModal(false);
        }
      }}>
        <DialogContent className="max-w-2xl lg:max-w-3xl rounded-2xl">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Inter', fontSize: '20px', fontWeight: 600, color: '#000' }}>
              {selectedCalendarDate && format(selectedCalendarDate, 'MMMM d, yyyy')}
            </DialogTitle>
          </DialogHeader>

          {isAddTransactionInModal ? (
            <div className="mt-4">
              <TransactionForm
                onSuccess={() => {
                  setIsAddTransactionInModal(false);
                  queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
                }}
                initialDate={selectedCalendarDate || undefined}
              />
            </div>
          ) : (
            <>
              <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '10px 0' }}>
                {selectedCalendarDate && getTransactionsForDate(selectedCalendarDate).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                      <WalletIcon className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-gray-600 text-sm">No transactions on this date</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedCalendarDate && getTransactionsForDate(selectedCalendarDate).map((transaction) => {
                      const isTransfer = transaction.type === 'transfer';
                      const category = getCategory(transaction.categoryId);
                      const categoryName = category?.name || "Unknown";
                      const walletName = getWalletName(transaction.walletId);
                      const fromWalletName = getWalletName(transaction.fromWalletId);
                      const toWalletName = getWalletName(transaction.toWalletId);
                      const emoji = isTransfer ? getTransferEmoji() : (category ? getCategoryEmoji(category) : "📋");
                      const isIncome = transaction.type === 'income';

                      return (
                        <div
                          key={transaction.id}
                          className="flex items-center justify-between p-3 md:p-2 hover:bg-gray-50 rounded-lg cursor-pointer border border-gray-100"
                          onClick={() => {
                            setIsDateModalOpen(false);
                            handleEditTransaction(transaction);
                          }}
                        >
                          <div className="flex items-center gap-3 md:gap-2 flex-1 min-w-0">
                            <div className="w-10 h-10 md:w-8 md:h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-lg md:text-base">{emoji}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {transaction.description || (isTransfer ? `${fromWalletName} → ${toWalletName}` : categoryName)}
                              </p>
                              <div className="flex items-center gap-2">
                                <p className="text-xs text-gray-600">
                                  {isTransfer ? (
                                    <span className="flex items-center gap-1">
                                      {fromWalletName} <ArrowRight className="w-3 h-3" /> {toWalletName}
                                    </span>
                                  ) : (
                                    categoryName
                                  )}
                                </p>
                                {transaction.excludeFromBudget && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded">
                                    Excluded
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-right flex-shrink-0">
                            <p className={`text-base md:text-sm font-semibold flex items-center justify-end ${
                              isIncome ? "text-green-600" : isTransfer ? "text-blue-600" : "text-black"
                            }`}>
                              {isTransfer ? "" : (isIncome ? "+" : "-")}{formatCurrency(transaction.amount)}
                              {isTransfer ? (
                                <ArrowRight className="w-3 h-3 ml-1" />
                              ) : isIncome ? (
                                <TrendingUp className="w-3 h-3 ml-1" />
                              ) : (
                                <TrendingDown className="w-3 h-3 ml-1" />
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200">
                <Button
                  onClick={() => setIsAddTransactionInModal(true)}
                  style={{
                    width: '100%',
                    height: '40px',
                    backgroundColor: '#000',
                    color: '#fff',
                    fontFamily: 'Inter',
                    fontSize: '14px',
                    fontWeight: 500,
                    borderRadius: '30px'
                  }}
                  className="hover:bg-gray-800"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Transaction
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
