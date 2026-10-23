import { useEffect, useState } from "react";
import { POSITIVE, NEGATIVE } from "@/lib/colors";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, isToday, isYesterday, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, getDay } from "date-fns";
import { Wallet as WalletIcon, TrendingUp, TrendingDown, ArrowRight, Plus, ListFilter, List, Calendar, FileUp, Search as SearchIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/hooks/useCurrency";
import type { Transaction, Category, Wallet } from "@shared/schema";
import TransactionEditDialog from "@/components/track/transaction-edit-dialog";
import TransactionForm from "@/components/track/transaction-form";
import { displayMerchantName } from "@/lib/merchantName";
import ImportWiseDialog from "@/components/settings/import-wise-dialog";
import { PillTabs } from "@/components/overview/category-breakdown";
import { TransactionFilters, type TypeFilter } from "./transaction-filters";
import { SpendingCalendar } from "./spending-calendar";
import { EntityIcon } from "@/components/ui/entity-icon";
import { sectionColor, useSections } from "@/lib/sectionUtils";

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
  const [importOpen, setImportOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [walletFilter, setWalletFilter] = useState<string>("all");
  // The search/filter bar is shown on demand; focusKey moves focus into it.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  const openFilters = () => {
    setFiltersOpen(true);
    setFocusKey((k) => k + 1);
  };
  // ⌘F / Ctrl+F opens the bar and puts the cursor in search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        openFilters();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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

  const { data: allSections = [] } = useSections();
  /** Icon tint: the category's group color; transfers stay neutral. */
  const iconColor = (category: Category | null) =>
    category?.section ? sectionColor(allSections, category.section, category.type as "income" | "expense") : undefined;

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

  const query = search.trim().toLowerCase();
  const filteredTransactions = transactions.filter(transaction => {
    // Opening-balance transactions are managed in Settings → Wallets and never
    // shown in the transaction list.
    if (transaction.isOpening) return false;
    if (categoryFilter !== "all") {
      if (transaction.type === "transfer") {
        return false;
      }
      if (transaction.categoryId !== categoryFilter) {
        return false;
      }
    }
    if (typeFilter !== "all" && transaction.type !== typeFilter) return false;
    if (walletFilter !== "all" && ![transaction.walletId, transaction.fromWalletId, transaction.toWalletId].includes(walletFilter)) return false;
    if (query) {
      const category = categories.find((c) => c.id === transaction.categoryId);
      const haystack = [
        transaction.description,
        displayMerchantName(transaction.description),
        category?.name,
        transaction.amount,
      ].join(" ").toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
  const filtersActive = categoryFilter !== "all" || typeFilter !== "all" || walletFilter !== "all" || query !== "";
  const filteredNet = filteredTransactions.reduce(
    (sum, t) => sum + (t.type === "income" ? 1 : t.type === "expense" ? -1 : 0) * parseFloat(t.amount),
    0,
  );
  const clearFilters = () => {
    setCategoryFilter("all");
    setTypeFilter("all");
    setWalletFilter("all");
    setSearch("");
  };

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
        {/* Header — the same shape as the Budget plan panel: title on the
            left, controls on the right; filters on the second row. */}
        <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid #F3F4F6' }}>
          <div className="flex items-center gap-x-3 gap-y-2 flex-wrap">
            <h2 className="hidden md:block mr-auto" style={{ fontFamily: 'Inter', fontSize: '22px', fontWeight: 500, color: '#000' }}>
              Transactions
            </h2>
            <PillTabs
              tabs={[["list", "List"], ["calendar", "Calendar"]]}
              value={viewMode}
              onChange={setViewMode}
              size="sm"
            />
            <div className="flex items-center gap-2">
              {/* Search and filters — opens the bar below; a dot means the list is filtered */}
              <Button
                onClick={() => (filtersOpen ? setFiltersOpen(false) : openFilters())}
                title="Search and filter (⌘F)"
                aria-label="Search and filter"
                aria-expanded={filtersOpen}
                style={{ height: 40, width: 40, minWidth: 40, padding: 0, borderRadius: 30, position: "relative" }}
                className={filtersOpen ? "bg-black text-white hover:bg-gray-800" : "bg-[#F3F4F6] text-black hover:bg-black hover:text-white"}
              >
                <SearchIcon className="w-[18px] h-[18px]" />
                {filtersActive && !filtersOpen && (
                  <span className="absolute top-2 right-2 h-2 w-2 rounded-full" style={{ backgroundColor: "#111827", boxShadow: "0 0 0 2px #F3F4F6" }} />
                )}
              </Button>
              {/* Import Wise statement — same dialog as Settings → Data */}
              <Button
                onClick={() => setImportOpen(true)}
                title="Import Wise statement"
                aria-label="Import Wise statement"
                style={{ height: 40, width: 40, minWidth: 40, padding: 0, borderRadius: 30 }}
                className="bg-[#F3F4F6] text-black hover:bg-black hover:text-white"
              >
                <FileUp className="w-[18px] h-[18px]" />
              </Button>
              <Button
                onClick={() => onAddTransaction()}
                title="Add transaction"
                aria-label="Add transaction"
                style={{ height: 40, width: 40, minWidth: 40, padding: 0, borderRadius: 30 }}
                className="bg-[#F3F4F6] text-black hover:bg-black hover:text-white"
              >
                <Plus className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Slides open under the header (grid rows 0fr → 1fr). */}
          <div
            className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
            style={{ gridTemplateRows: filtersOpen ? "1fr" : "0fr", opacity: filtersOpen ? 1 : 0 }}
            aria-hidden={!filtersOpen}
            {...(filtersOpen ? {} : ({ inert: "" } as any))}
          >
            <div className="overflow-hidden min-w-0">
              <div className="pt-3 px-0.5 pb-0.5">
                <TransactionFilters
                  search={search}
                  onSearch={setSearch}
                  type={typeFilter}
                  onType={setTypeFilter}
                  categoryId={categoryFilter}
                  onCategory={setCategoryFilter}
                  categories={categories}
                  walletId={walletFilter}
                  onWallet={setWalletFilter}
                  wallets={wallets}
                  focusKey={focusKey}
                  onEscape={() => setFiltersOpen(false)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        {/* No top padding here: the sticky date headers carry it, so rows
            scrolling up disappear under a header instead of peeking above it. */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 15px' }}>
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-pulse">Loading...</div>
            </div>
          ) : viewMode === 'calendar' ? (
            <SpendingCalendar
              month={selectedDate}
              transactions={filteredTransactions}
              categories={categories}
              formatCurrency={(n) => formatCurrency(n)}
              onDayClick={handleDateClick}
            />
          ) : Object.keys(groupedTransactions).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <WalletIcon className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No transactions found</h3>
              <p className="text-gray-600 text-center">
                {filtersActive
                  ? "Nothing matches these filters this month."
                  : "Start by adding your first transaction."}
              </p>
              {filtersActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 h-9 px-4 rounded-full bg-[#F3F4F6] text-[13px] font-medium text-black hover:bg-black hover:text-white transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {filtersActive && (
                <div className="flex items-center justify-between pt-3 text-xs text-gray-500">
                  <span className="tabular-nums">
                    {filteredTransactions.length} {filteredTransactions.length === 1 ? "transaction" : "transactions"}
                    {" · "}
                    <span className={filteredNet < 0 ? "text-red-700" : "text-emerald-700"}>
                      {filteredNet < 0 ? "−" : "+"}{formatCurrency(Math.abs(filteredNet))}
                    </span>
                  </span>
                  <button type="button" onClick={clearFilters} className="font-medium text-gray-900 hover:underline">
                    Clear filters
                  </button>
                </div>
              )}
              {Object.keys(groupedTransactions).map((dateKey) => (
                <div key={dateKey}>
                  {/* Date Header */}
                  <div
                    className="sticky"
                    style={{
                      top: 0,
                      backgroundColor: '#fff',
                      zIndex: 10,
                      paddingTop: '15px',
                      paddingBottom: '8px',
                      borderBottom: '1px solid #E5E7EB',
                      marginBottom: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <p style={{ fontFamily: 'Inter', fontSize: '10px', fontWeight: 600, color: '#6B7280', margin: 0 }}>
                        {getDateHeader(dateKey)}
                      </p>
                      {(() => {
                        const { income, expense } = calculateDayTotals(new Date(dateKey));
                        return (
                          <div style={{ display: 'inline-flex', gap: '10px', fontFamily: 'Inter', fontSize: '10px', fontWeight: 600 }}>
                            {income > 0 && (
                              <span style={{ color: POSITIVE }}>
                                +{formatCurrency(income)}
                              </span>
                            )}
                            {expense > 0 && (
                              <span style={{ color: NEGATIVE }}>
                                −{formatCurrency(expense)}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    {/* Soft fade so rows slide out under the header instead of being cut off */}
                    <div
                      aria-hidden
                      style={{
                        position: 'absolute', left: 0, right: 0, top: '100%', height: 14,
                        marginTop: 1, pointerEvents: 'none',
                        background: 'linear-gradient(#fff, rgba(255,255,255,0))',
                      }}
                    />
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
                            <EntityIcon emoji={emoji} color={isTransfer ? null : iconColor(category)} size={36} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate" title={transaction.description || undefined}>
                                {displayMerchantName(transaction.description) || (isTransfer ? `${fromWalletName} → ${toWalletName}` : categoryName)}
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
                              isTransfer ? "text-gray-500" : "text-black"
                            }`} style={isIncome ? { color: POSITIVE } : undefined}>
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
                            <EntityIcon emoji={emoji} color={isTransfer ? null : iconColor(category)} size={36} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate" title={transaction.description || undefined}>
                                {displayMerchantName(transaction.description) || (isTransfer ? `${fromWalletName} → ${toWalletName}` : categoryName)}
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
                              isTransfer ? "text-gray-500" : "text-black"
                            }`} style={isIncome ? { color: POSITIVE } : undefined}>
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

      <ImportWiseDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}
