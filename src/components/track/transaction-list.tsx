import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns";
import {
  Wallet as WalletIcon,
  TrendingUp,
  TrendingDown,
  Trash2,
  Edit,
  ArrowRight,
  Calendar,
  List,
  Target,
  Plus,
  X,
  DollarSign
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/hooks/useCurrency";
import type { Transaction, Category, Wallet, BudgetCategoryAllocation } from "@shared/schema";
import TransactionEditDialog from "./transaction-edit-dialog";
import StartingBalanceDialog from "@/components/wallets/starting-balance-dialog";

// Category emojis mapping (same as in category selector)
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

// Category sections mapping
const categorySections: { [key: string]: string } = {
  // Housing & Utilities
  "Rent/Mortgage": "Housing & Utilities",
  "Electricity": "Housing & Utilities",
  "Water": "Housing & Utilities",
  "Gas/Heating": "Housing & Utilities",
  "Internet/Phone": "Housing & Utilities",
  "Home Maintenance": "Housing & Utilities",
  "Property Tax": "Housing & Utilities",
  "Home Insurance": "Housing & Utilities",

  // Food & Drinks
  "Groceries": "Food & Drinks",
  "Restaurants/Cafes": "Food & Drinks",
  "Food Delivery": "Food & Drinks",
  "Coffee/Snacks": "Food & Drinks",

  // Transportation
  "Public Transport": "Transportation",
  "Fuel/Gas": "Transportation",
  "Taxi/Ride Sharing": "Transportation",
  "Car Maintenance": "Transportation",
  "Car Insurance": "Transportation",
  "Parking": "Transportation",

  // Health & Wellness
  "Health Insurance": "Health & Wellness",
  "Doctor/Dentist": "Health & Wellness",
  "Medicine": "Health & Wellness",
  "Gym/Fitness": "Health & Wellness",
  "Mental Health": "Health & Wellness",

  // Entertainment & Leisure
  "Subscriptions": "Entertainment & Leisure",
  "Hobbies": "Entertainment & Leisure",
  "Travel": "Entertainment & Leisure",
  "Events/Cinema": "Entertainment & Leisure",
  "Books/Media": "Entertainment & Leisure",

  // Shopping
  "Clothes/Shoes": "Shopping",
  "Home Goods": "Shopping",
  "Electronics": "Shopping",
  "Personal Care": "Shopping",

  // Finance & Obligations
  "Loans/Credit": "Finance & Obligations",
  "Savings/Investments": "Finance & Obligations",
  "Insurance": "Finance & Obligations",
  "Bank Fees": "Finance & Obligations",

  // Other
  "Education": "Other",
  "Gifts/Charity": "Other",
  "Miscellaneous": "Other",
};

interface TransactionListProps {
  dateRange?: {
    start: Date;
    end: Date;
  };
  showAddButton?: boolean;
  onAddClick?: (date?: Date | null) => void;
  planOnly?: boolean;
}

export default function TransactionList({ dateRange }: TransactionListProps) {
  const [viewMode, setViewMode] = useState<'list' | 'calendar' | 'plan'>('list');
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAddCategoryDialogOpen, setIsAddCategoryDialogOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [budgetAmount, setBudgetAmount] = useState<string>("");
  const [budgetViewMode, setBudgetViewMode] = useState<'bar' | 'circle'>('bar');
  const [budgetSortMode, setBudgetSortMode] = useState<'section' | 'spent' | 'remaining'>('section');
  const [isStartingBalanceDialogOpen, setIsStartingBalanceDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();

  // Use provided date range or default to current month
  const currentMonth = new Date();
  const defaultStartOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const defaultEndOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
  
  const startDate = dateRange?.start || defaultStartOfMonth;
  const endDate = dateRange?.end || defaultEndOfMonth;

  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions", startDate.toISOString(), endDate.toISOString()],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ["/api/wallets"],
  });

  // Filter out balance adjustment transactions for the purpose of showing starting balance button
  const nonAdjustmentTransactions = transactions.filter(t => t.description !== "Balance adjustment");

  const { data: budgetData, isLoading: isBudgetLoading } = useQuery<{ budgetPlanId: string; allocations: BudgetCategoryAllocation[] }>({
    queryKey: ["/api/budget-allocations/current-month"],
    enabled: viewMode === 'plan',
  });

  const budgetAllocations = budgetData?.allocations || [];
  const budgetPlanId = budgetData?.budgetPlanId || "";

  const expenseCategories = categories.filter(c => c.type === 'expense');

  const getCategory = (categoryId: string | null): Category | undefined => {
    if (!categoryId) return undefined;
    return categories.find(c => c.id === categoryId);
  };

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return "Unknown";
    const category = categories.find(c => c.id === categoryId);
    return category?.name || "Unknown";
  };

  const getWalletName = (walletId: string | null) => {
    if (!walletId) return "Unknown";
    const wallet = wallets.find(w => w.id === walletId);
    return wallet?.name || "Unknown";
  };

  const getCategoryEmoji = (category: Category) => {
    return category.emoji || categoryEmojis[category.name as keyof typeof categoryEmojis] || "📋";
  };

  const getTransferEmoji = () => {
    return "🔄";
  };

  const deleteTransactionMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", "/api/transactions/" + id),
    onMutate: async (id: string) => {
      // Find the transaction being deleted
      const transaction = transactions.find(t => t.id === id);
      if (!transaction) return;

      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ["/api/wallets"] });

      // Snapshot the previous wallet state
      const previousWallets = queryClient.getQueryData(["/api/wallets"]);

      // Optimistically update wallet balances by reversing the transaction
      queryClient.setQueryData(["/api/wallets"], (old: any) => {
        if (!old) return old;

        const amount = parseFloat(transaction.amount);

        return old.map((wallet: any) => {
          let balance = parseFloat(wallet.balance);

          // Reverse the transaction's effect on wallet balance
          if (transaction.type === "income" && wallet.id === transaction.walletId) {
            balance -= amount; // Remove the income
          } else if (transaction.type === "expense" && wallet.id === transaction.walletId) {
            balance += amount; // Add back the expense
          } else if (transaction.type === "transfer") {
            if (wallet.id === transaction.fromWalletId) {
              balance += amount; // Add back to source wallet
            }
            if (wallet.id === transaction.toWalletId) {
              balance -= amount; // Remove from destination wallet
            }
          }

          return {
            ...wallet,
            balance: balance.toFixed(2)
          };
        });
      });

      // Return context with the snapshot for rollback
      return { previousWallets };
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Transaction deleted successfully",
      });
      // Invalidate all transaction-related queries (including date-range queries)
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budget-goals"] });
    },
    onError: (error, variables, context: any) => {
      // Rollback to previous state on error
      if (context?.previousWallets) {
        queryClient.setQueryData(["/api/wallets"], context.previousWallets);
      }
      toast({
        title: "Error",
        description: "Failed to delete transaction",
        variant: "destructive",
      });
    },
  });

  const addBudgetAllocationMutation = useMutation({
    mutationFn: (allocation: { budgetPlanId: string; categoryId: string; allocatedAmount: string }) =>
      apiRequest("POST", "/api/budget-allocations", allocation),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Budget category added successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/budget-allocations/current-month"] });
      setIsAddCategoryDialogOpen(false);
      setSelectedCategoryId("");
      setBudgetAmount("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add budget category",
        variant: "destructive",
      });
    },
  });

  const deleteBudgetAllocationMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", "/api/budget-allocations/" + id),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Budget category removed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/budget-allocations/current-month"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove budget category",
        variant: "destructive",
      });
    },
  });

  const filteredTransactions = transactions.filter(transaction => {
    // Handle category filtering - transfers don't have categories
    if (categoryFilter !== "all") {
      if (transaction.type === "transfer") {
        return false; // Transfers don't match any category filter
      }
      if (transaction.categoryId !== categoryFilter) {
        return false;
      }
    }
    // Handle type filtering
    if (typeFilter !== "all" && transaction.type !== typeFilter) return false;
    return true;
  });

  const handleDeleteTransaction = (id: string) => {
    if (window.confirm("Are you sure you want to delete this transaction?")) {
      deleteTransactionMutation.mutate(id);
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

  const handleAddBudgetCategory = () => {
    if (!selectedCategoryId || !budgetAmount || parseFloat(budgetAmount) <= 0) {
      toast({
        title: "Error",
        description: "Please select a category and enter a valid budget amount",
        variant: "destructive",
      });
      return;
    }

    addBudgetAllocationMutation.mutate({
      budgetPlanId,
      categoryId: selectedCategoryId,
      allocatedAmount: budgetAmount,
    });
  };

  const handleDeleteBudgetAllocation = (id: string) => {
    if (window.confirm("Are you sure you want to remove this budget category?")) {
      deleteBudgetAllocationMutation.mutate(id);
    }
  };

  const calculateCategorySpending = (categoryId: string): number => {
    return transactions
      .filter(t => t.type === 'expense' && t.categoryId === categoryId)
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);
  };

  const getSortedBudgetAllocations = () => {
    const allocationsWithData = budgetAllocations
      .map((allocation) => {
        if (!allocation.categoryId) return null;
        const category = categories.find(c => c.id === allocation.categoryId);
        if (!category) return null;

        const spent = calculateCategorySpending(allocation.categoryId);
        const budget = parseFloat(allocation.allocatedAmount);
        const remaining = budget - spent;
        const section = categorySections[category.name] || "Other";

        return {
          allocation,
          category,
          spent,
          budget,
          remaining,
          section,
        };
      })
      .filter(Boolean) as Array<{
        allocation: BudgetCategoryAllocation;
        category: Category;
        spent: number;
        budget: number;
        remaining: number;
        section: string;
      }>;

    // Sort based on current sort mode
    if (budgetSortMode === 'spent') {
      return allocationsWithData.sort((a, b) => b.spent - a.spent);
    } else if (budgetSortMode === 'remaining') {
      return allocationsWithData.sort((a, b) => a.remaining - b.remaining);
    } else {
      // Sort by section, then by category name within each section
      return allocationsWithData.sort((a, b) => {
        if (a.section !== b.section) {
          return a.section.localeCompare(b.section);
        }
        return a.category.name.localeCompare(b.category.name);
      });
    }
  };

  // Calendar helper functions
  const getDailyTransactionSums = (date: Date): { income: number; expenses: number; total: number; transfers: number } => {
    const dayTransactions = filteredTransactions.filter(transaction => {
      const transactionDate = new Date(transaction.date);
      return transactionDate.toDateString() === date.toDateString();
    });

    let income = 0;
    let expenses = 0;
    let transfers = 0;

    dayTransactions.forEach(transaction => {
      if (transaction.type === 'income') {
        income += parseFloat(transaction.amount);
      } else if (transaction.type === 'expense') {
        expenses += parseFloat(transaction.amount);
      } else if (transaction.type === 'transfer') {
        transfers += parseFloat(transaction.amount);
      }
    });

    return { income, expenses, total: income + expenses, transfers };
  };

  const getCalendarDays = (): (Date | null)[] => {
    const monthStart = startOfMonth(startDate);
    const monthEnd = endOfMonth(startDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    // Add padding days at the beginning to align with week start
    const startDayOfWeek = getDay(monthStart);
    const paddingDays = [];
    
    // Add empty days at the beginning (Monday = 1, so we adjust for Monday start)
    const mondayOffset = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    
    for (let i = 0; i < mondayOffset; i++) {
      paddingDays.push(null);
    }
    
    return [...paddingDays, ...days];
  };

  const renderCalendarView = () => {
    const calendarDays = getCalendarDays();
    
    return (
      <div className="p-3 sm:p-4">
        {/* Calendar Header */}
        <div className="grid grid-cols-7 gap-1 mb-3">
          {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(day => (
            <div key={day} className="text-center text-xs font-medium text-mono-gray-600 py-1">
              {day}
            </div>
          ))}
        </div>
        
        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1.5">
          {calendarDays.map((day, index) => {
            if (!day) {
              return <div key={index} className="h-20"></div>;
            }
            
            const dayNumber = format(day, 'd');
            const { income, expenses, total, transfers } = getDailyTransactionSums(day);
            
            // Check what type of transactions should be shown based on filter
            const showTransfers = typeFilter === "transfer";
            const showIncomeExpenses = typeFilter === "all" || typeFilter === "income" || typeFilter === "expense";
            
            const hasTransactions = showIncomeExpenses ? (income > 0 || expenses > 0) : showTransfers ? transfers > 0 : false;
            const netAmount = income - expenses;
            
            // Use consistent light purple background for all frames
            const bgColor = 'border-[#e9d5ff]'; // light purple border
            const textColor = 'text-gray-900';
            const frameStyle = hasTransactions ? 'shadow-sm' : '';
            
            return (
              <div
                key={day.toISOString()}
                className={`
                  h-16 sm:h-20 rounded-xl p-1.5 sm:p-2 flex flex-col items-center justify-center text-center transition-all duration-200 border overflow-hidden
                  ${bgColor} ${frameStyle}
                  hover:shadow-lg hover:scale-105 cursor-pointer
                `}
                style={{ backgroundColor: '#faf5ff' }}
                data-testid={`calendar-day-${dayNumber}`}
              >
                <div className={`text-sm sm:text-base font-bold mb-0.5 ${textColor}`}>
                  {dayNumber}
                </div>
                <div className="text-[10px] sm:text-xs leading-tight">
                  {hasTransactions ? (
                    <div className="space-y-0.5">
                      {showTransfers && transfers > 0 && (
                        <div className="font-bold text-[9px] sm:text-xs truncate" style={{ color: '#6366f1' }}>
                          {formatCurrency(transfers)}
                        </div>
                      )}
                      {showIncomeExpenses && income > 0 && (
                        <div className="font-bold text-[9px] sm:text-xs truncate" style={{ color: '#00C821' }}>
                          {formatCurrency(income)}
                        </div>
                      )}
                      {showIncomeExpenses && expenses > 0 && (
                        <div className="font-bold text-[9px] sm:text-xs truncate" style={{ color: '#FF4A4A' }}>
                          {formatCurrency(expenses)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-gray-500 text-[9px] sm:text-xs">{formatCurrency(0)}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="bg-mono-white border border-mono-gray-100 rounded-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-mono-gray-100 rounded w-1/4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-mono-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-mono-white border border-mono-gray-100 rounded-lg">
      {/* Header */}
      <div className="p-3 sm:p-6 border-b border-mono-gray-100">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:justify-between">
          {/* View Mode Toggle */}
          <button
            type="button"
            onClick={() => {
              // Cycle through views: list -> calendar -> list
              if (viewMode === 'list') setViewMode('calendar');
              else setViewMode('list');
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
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#000';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#fff';
            }}
            data-testid="button-view-toggle"
          >
            {viewMode === 'list' ? (
              <List size={20} className="text-black group-hover:text-white transition-colors" />
            ) : (
              <Calendar size={20} className="text-black group-hover:text-white transition-colors" />
            )}
          </button>
          {/* Combined Filter Button */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={`h-8 sm:h-9 px-2 sm:px-3 gap-1.5 sm:gap-2 text-xs sm:text-sm ${
                  categoryFilter !== "all" || typeFilter !== "all"
                    ? 'bg-[#f3e9ff] text-[#9334eb] border-[#f3e9ff] hover:bg-[#f3e9ff] hover:text-[#9334eb]'
                    : 'hover:bg-gray-50 hover:text-[#9334eb]'
                }`}
                data-testid="button-filter"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5H2"/>
                  <path d="M6 12h12"/>
                  <path d="M9 19h6"/>
                  <path d="M16 5h6"/>
                  <path d="M19 8V2"/>
                </svg>
                Filter
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="end">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Category</label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-full h-9 text-sm" data-testid="select-category-filter">
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
                    <SelectTrigger className="w-full h-9 text-sm" data-testid="select-type-filter">
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
                
                {/* Reset Filters Button */}
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
                      data-testid="button-reset-filters"
                    >
                      Reset Filters
                    </Button>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {/* Content - List or Calendar View */}
      {viewMode === 'list' ? (
        <div className="divide-y divide-mono-gray-100 max-h-96 overflow-y-auto">
        {filteredTransactions.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-mono-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <WalletIcon className="w-8 h-8 text-mono-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-mono-black mb-2">No transactions found</h3>
            <p className="text-mono-gray-600 mb-4">
              {categoryFilter !== "all" || typeFilter !== "all"
                ? "Try adjusting your filters to see more transactions."
                : "Start by adding your first transaction above."}
            </p>
            {/* Show starting balance button only when no transactions exist and wallets have zero balance */}
            {nonAdjustmentTransactions.length === 0 && categoryFilter === "all" && typeFilter === "all" &&
             wallets.every(w => parseFloat(w.balance) === 0) && (
              <div className="mt-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
                <DollarSign className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                <h4 className="text-sm font-semibold text-gray-900 mb-1">Set Up Your Starting Balance</h4>
                <p className="text-xs text-gray-600 mb-3">
                  Add the current amount in your wallets to start tracking
                </p>
                <Button
                  onClick={() => setIsStartingBalanceDialogOpen(true)}
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Set Starting Balance
                </Button>
              </div>
            )}
          </div>
        ) : (
          filteredTransactions.map((transaction) => {
            const isTransfer = transaction.type === 'transfer';
            const category = getCategory(transaction.categoryId);
            const categoryName = getCategoryName(transaction.categoryId);
            const walletName = getWalletName(transaction.walletId);
            const fromWalletName = getWalletName(transaction.fromWalletId);
            const toWalletName = getWalletName(transaction.toWalletId);
            const emoji = isTransfer ? getTransferEmoji() : (category ? getCategoryEmoji(category) : "📋");
            const isIncome = transaction.type === 'income';
            
            return (
              <div key={transaction.id} className="p-3 sm:p-4 hover:bg-mono-gray-50 group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-mono-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-lg sm:text-xl">{emoji}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-mono-black truncate">
                        {transaction.description || (isTransfer ? `${fromWalletName} → ${toWalletName}` : categoryName)}
                      </p>
                      <p className="text-xs sm:text-xs text-mono-gray-600">
                        {isTransfer ? (
                          <span className="flex items-center gap-1">
                            {fromWalletName} <ArrowRight className="w-3 h-3" /> {toWalletName}
                          </span>
                        ) : (
                          categoryName
                        )} • {format(new Date(transaction.date), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
                    <div className="text-right">
                      <p className={`text-sm font-semibold flex items-center justify-end ${
                        isIncome ? "text-mono-black" : "text-mono-black"
                      }`}>
                        {isTransfer ? "" : (isIncome ? "+" : "-")}{formatCurrency(transaction.amount)}
                        {isTransfer ? (
                          <ArrowRight className="w-3 h-3 ml-1 text-blue-600" />
                        ) : isIncome ? (
                          <TrendingUp className="w-3 h-3 ml-1 text-green-600" />
                        ) : (
                          <TrendingDown className="w-3 h-3 ml-1 text-red-600" />
                        )}
                      </p>
                      <p className="text-xs text-mono-gray-600 hidden sm:block">
                        {isTransfer ? `${fromWalletName} → ${toWalletName}` : walletName}
                      </p>
                    </div>
                    <div className="flex space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity h-8 w-8 p-0 hover:bg-mono-gray-100 touch-manipulation"
                        onClick={() => handleEditTransaction(transaction)}
                        data-testid={`button-edit-${transaction.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity h-8 w-8 p-0 hover:bg-red-100 hover:text-red-600 touch-manipulation"
                        onClick={() => handleDeleteTransaction(transaction.id)}
                        disabled={deleteTransactionMutation.isPending}
                        data-testid={`button-delete-${transaction.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        </div>
      ) : viewMode === 'calendar' ? (
        renderCalendarView()
      ) : (
        <div className="p-4 sm:p-6">
          {/* Header with Add Button and Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
            <Button
              onClick={() => setIsAddCategoryDialogOpen(true)}
              disabled={isBudgetLoading}
              className="bg-mono-black hover:bg-mono-gray-800 text-mono-white h-9 sm:h-auto"
              data-testid="button-add-budget-category"
            >
              <Plus className="w-4 h-4 mr-2" />
              {isBudgetLoading ? "Loading..." : "Add Category"}
            </Button>

            {/* View Mode and Sort Controls */}
            <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto">
              {/* View Mode Toggle */}
              <div className="flex flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBudgetViewMode('bar')}
                  className={`rounded-r-none h-8 px-2.5 sm:h-9 sm:px-4 text-xs sm:text-sm ${
                    budgetViewMode === 'bar'
                      ? 'bg-[#f3e9ff] text-[#9334eb] border-[#f3e9ff] hover:bg-[#f3e9ff] hover:text-[#9334eb]'
                      : 'hover:bg-gray-50 hover:text-[#9334eb]'
                  }`}
                >
                  Bar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBudgetViewMode('circle')}
                  className={`rounded-l-none h-8 px-2.5 sm:h-9 sm:px-4 text-xs sm:text-sm ${
                    budgetViewMode === 'circle'
                      ? 'bg-[#f3e9ff] text-[#9334eb] border-[#f3e9ff] hover:bg-[#f3e9ff] hover:text-[#9334eb]'
                      : 'hover:bg-gray-50 hover:text-[#9334eb]'
                  }`}
                >
                  Circle
                </Button>
              </div>

              {/* Sort Mode Toggle */}
              <div className="flex gap-1 border-l border-gray-200 pl-2 sm:pl-3 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBudgetSortMode('section')}
                  className={`h-8 px-2 sm:h-9 sm:px-3 text-xs sm:text-sm ${
                    budgetSortMode === 'section'
                      ? 'bg-[#f3e9ff] text-[#9334eb] border-[#f3e9ff] hover:bg-[#f3e9ff] hover:text-[#9334eb]'
                      : 'hover:bg-gray-50 hover:text-[#9334eb]'
                  }`}
                >
                  Section
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBudgetSortMode('spent')}
                  className={`h-8 px-2 sm:h-9 sm:px-3 text-xs sm:text-sm ${
                    budgetSortMode === 'spent'
                      ? 'bg-[#f3e9ff] text-[#9334eb] border-[#f3e9ff] hover:bg-[#f3e9ff] hover:text-[#9334eb]'
                      : 'hover:bg-gray-50 hover:text-[#9334eb]'
                  }`}
                >
                  Spent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBudgetSortMode('remaining')}
                  className={`h-8 px-2 sm:h-9 sm:px-3 text-xs sm:text-sm ${
                    budgetSortMode === 'remaining'
                      ? 'bg-[#f3e9ff] text-[#9334eb] border-[#f3e9ff] hover:bg-[#f3e9ff] hover:text-[#9334eb]'
                      : 'hover:bg-gray-50 hover:text-[#9334eb]'
                  }`}
                >
                  Left
                </Button>
              </div>
            </div>
          </div>

          {isBudgetLoading ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Target className="w-8 h-8 text-purple-600 animate-pulse" />
              </div>
              <p className="text-gray-600">Loading budget plan...</p>
            </div>
          ) : budgetAllocations.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Target className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Budget Categories</h3>
              <p className="text-gray-600">
                Add categories to track your spending against your budget
              </p>
            </div>
          ) : budgetViewMode === 'bar' ? (
            <div className="space-y-3">
              {(() => {
                const sortedData = getSortedBudgetAllocations();
                let lastSection = '';

                return sortedData.map((item) => {
                  const { allocation, category, spent, budget, remaining, section } = item;
                  const percentage = budget > 0 ? (spent / budget) * 100 : 0;
                  const emoji = getCategoryEmoji(category);
                  const categoryColor = category.color || "#6B7280";

                  // Show section header only when sorting by section and section changes
                  const showSectionHeader = budgetSortMode === 'section' && section !== lastSection;
                  if (showSectionHeader) {
                    lastSection = section;
                  }

                  return (
                    <div key={allocation.id}>
                      {showSectionHeader && (
                        <div className="sticky top-0 bg-white z-10 pt-4 pb-2 -mx-1 px-1">
                          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                            {section}
                          </h3>
                        </div>
                      )}
                      <div
                        className="p-4 border border-mono-gray-100 rounded-lg hover:bg-mono-gray-50 group"
                        data-testid={`budget-category-${allocation.id}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 flex-1">
                            <div
                              className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: categoryColor + '20' }}
                            >
                              <span className="text-xl">{emoji}</span>
                            </div>
                            <div className="flex-1">
                              <h4 className="font-medium text-mono-black mb-1">{category.name}</h4>
                              <p className="text-sm text-mono-gray-600 mb-2">
                                {formatCurrency(spent.toString())} / {formatCurrency(allocation.allocatedAmount)}
                              </p>
                              <Progress value={Math.min(percentage, 100)} className="h-2" />
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity h-8 w-8 p-0 hover:bg-red-100 hover:text-red-600"
                            onClick={() => handleDeleteBudgetAllocation(allocation.id)}
                            disabled={deleteBudgetAllocationMutation.isPending}
                            data-testid={`button-delete-budget-${allocation.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {(() => {
                const sortedData = getSortedBudgetAllocations();
                let lastSection = '';
                const result: JSX.Element[] = [];

                sortedData.forEach((item, index) => {
                  const { allocation, category, spent, budget, remaining, section } = item;
                  const percentage = budget > 0 ? (spent / budget) * 100 : 0;
                  const emoji = getCategoryEmoji(category);
                  const categoryColor = category.color || "#6B7280";

                  // Show section header only when sorting by section and section changes
                  const showSectionHeader = budgetSortMode === 'section' && section !== lastSection;
                  if (showSectionHeader) {
                    lastSection = section;
                    // Section header spans all columns
                    result.push(
                      <div key={`section-${section}`} className="col-span-2 sm:col-span-3 md:col-span-4 sticky top-0 bg-white z-10 pt-4 pb-2">
                        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                          {section}
                        </h3>
                      </div>
                    );
                  }

                  // Circle progress indicator
                  const radius = 90;
                  const circumference = 2 * Math.PI * radius;
                  const strokeDashoffset = circumference - (percentage / 100) * circumference;

                  result.push(
                    <div
                      key={allocation.id}
                      className="relative flex flex-col items-center p-3 border border-mono-gray-100 rounded-lg hover:bg-mono-gray-50 group"
                      data-testid={`budget-category-circle-${allocation.id}`}
                    >
                      {/* Delete button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-1 right-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600"
                        onClick={() => handleDeleteBudgetAllocation(allocation.id)}
                        disabled={deleteBudgetAllocationMutation.isPending}
                        data-testid={`button-delete-budget-circle-${allocation.id}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>

                      {/* SVG Circle */}
                      <svg width="90" height="90" className="transform -rotate-90">
                        {/* Background circle */}
                        <circle
                          cx="45"
                          cy="45"
                          r="36"
                          fill="none"
                          stroke="#f3f4f6"
                          strokeWidth="6"
                        />
                        {/* Progress circle */}
                        <circle
                          cx="45"
                          cy="45"
                          r="36"
                          fill="none"
                          stroke={categoryColor}
                          strokeWidth="6"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                        />
                      </svg>

                      {/* Center content */}
                      <div className="absolute top-[17px] left-0 right-0 flex flex-col items-center justify-center h-[90px]">
                        <span className="text-2xl mb-1">{emoji}</span>
                        <span className="text-[10px] font-medium text-gray-900">
                          {formatCurrency(remaining.toString())}
                        </span>
                      </div>

                      {/* Category name */}
                      <p className="text-xs font-medium text-center text-gray-900 mt-2 line-clamp-2">
                        {category.name}
                      </p>
                    </div>
                  );
                });

                return result;
              })()}
            </div>
          )}
        </div>
      )}
      <TransactionEditDialog
        transaction={editingTransaction}
        isOpen={isEditDialogOpen}
        onClose={handleCloseEditDialog}
      />

      <StartingBalanceDialog
        isOpen={isStartingBalanceDialogOpen}
        onClose={() => setIsStartingBalanceDialogOpen(false)}
      />

      <Dialog open={isAddCategoryDialogOpen} onOpenChange={setIsAddCategoryDialogOpen}>
        <DialogContent data-testid="dialog-add-budget-category">
          <DialogHeader>
            <DialogTitle>Add Budget Category</DialogTitle>
            <DialogDescription>
              Select a category and set a monthly budget to track your spending.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger id="category" data-testid="select-budget-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories
                    .filter(cat => !budgetAllocations.some(alloc => alloc.categoryId === cat.id))
                    .map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {getCategoryEmoji(category)} {category.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget">Monthly Budget</Label>
              <Input
                id="budget"
                type="number"
                placeholder="Enter amount"
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(e.target.value)}
                min="0"
                step="0.01"
                data-testid="input-budget-amount"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddCategoryDialogOpen(false);
                setSelectedCategoryId("");
                setBudgetAmount("");
              }}
              data-testid="button-cancel-budget"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddBudgetCategory}
              disabled={addBudgetAllocationMutation.isPending}
              className="bg-mono-black hover:bg-mono-gray-800 text-mono-white"
              data-testid="button-save-budget"
            >
              {addBudgetAllocationMutation.isPending ? "Adding..." : "Add Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
