import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Target, X, Plus, BarChart3, PieChart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/hooks/useCurrency";
import type { Transaction, Category, BudgetCategoryAllocation } from "@shared/schema";
import CategorySelector from "@/components/track/category-selector-redesigned";

// Category emojis and sections mapping
const categoryEmojis = {
  "Rent/Mortgage": "🏠", "Electricity": "⚡", "Water": "💧", "Gas/Heating": "🔥",
  "Internet/Phone": "📶", "Home Maintenance": "🔨", "Property Tax": "🏠", "Home Insurance": "🏠",
  "Groceries": "🛒", "Restaurants/Cafes": "☕", "Food Delivery": "🛍️", "Coffee/Snacks": "☕",
  "Public Transport": "🚌", "Fuel/Gas": "⛽", "Taxi/Ride Sharing": "🚗", "Car Maintenance": "🔧",
  "Car Insurance": "🚗", "Parking": "🅿️", "Health Insurance": "🏥", "Doctor/Dentist": "👩‍⚕️",
  "Medicine": "💊", "Gym/Fitness": "💪", "Mental Health": "🧠", "Subscriptions": "📺",
  "Hobbies": "🎨", "Travel": "✈️", "Events/Cinema": "🎬", "Books/Media": "📚",
  "Clothes/Shoes": "👕", "Home Goods": "🏠", "Electronics": "💻", "Personal Care": "🧴",
  "Loans/Credit": "💳", "Savings/Investments": "📈", "Insurance": "🛡️", "Bank Fees": "🏦",
  "Education": "📖", "Gifts/Charity": "🎁", "Miscellaneous": "📋",
  "Salary": "💰", "Freelance": "💼", "Business": "🏢", "Investments": "📊",
  "Rental Income": "🏠", "Other Income": "💵",
};

const categorySections: { [key: string]: string } = {
  "Rent/Mortgage": "Housing & Utilities", "Electricity": "Housing & Utilities",
  "Water": "Housing & Utilities", "Gas/Heating": "Housing & Utilities",
  "Internet/Phone": "Housing & Utilities", "Home Maintenance": "Housing & Utilities",
  "Property Tax": "Housing & Utilities", "Home Insurance": "Housing & Utilities",
  "Groceries": "Food & Drinks", "Restaurants/Cafes": "Food & Drinks",
  "Food Delivery": "Food & Drinks", "Coffee/Snacks": "Food & Drinks",
  "Public Transport": "Transportation", "Fuel/Gas": "Transportation",
  "Taxi/Ride Sharing": "Transportation", "Car Maintenance": "Transportation",
  "Car Insurance": "Transportation", "Parking": "Transportation",
  "Health Insurance": "Health & Wellness", "Doctor/Dentist": "Health & Wellness",
  "Medicine": "Health & Wellness", "Gym/Fitness": "Health & Wellness",
  "Mental Health": "Health & Wellness", "Subscriptions": "Entertainment & Leisure",
  "Hobbies": "Entertainment & Leisure", "Travel": "Entertainment & Leisure",
  "Events/Cinema": "Entertainment & Leisure", "Books/Media": "Entertainment & Leisure",
  "Clothes/Shoes": "Shopping", "Home Goods": "Shopping",
  "Electronics": "Shopping", "Personal Care": "Shopping",
  "Loans/Credit": "Finance & Obligations", "Savings/Investments": "Finance & Obligations",
  "Insurance": "Finance & Obligations", "Bank Fees": "Finance & Obligations",
  "Education": "Other", "Gifts/Charity": "Other", "Miscellaneous": "Other",
};

interface BudgetPlanPanelProps {
  dateRange: {
    start: Date;
    end: Date;
  };
  selectedDate: Date;
}

export default function BudgetPlanPanel({ dateRange, selectedDate }: BudgetPlanPanelProps) {
  const [budgetViewMode, setBudgetViewMode] = useState<'bar' | 'circle'>('bar');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [budgetAmount, setBudgetAmount] = useState<string>("");
  const [editingAllocationId, setEditingAllocationId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { formatCurrency, currencySymbol } = useCurrency();

  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions", dateRange.start.toISOString(), dateRange.end.toISOString()],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: budgetData, isLoading: isBudgetLoading } = useQuery<{ budgetPlanId: string; allocations: BudgetCategoryAllocation[] }>({
    queryKey: ["/api/budget-allocations/current-month"],
  });

  const budgetAllocations = budgetData?.allocations || [];
  const budgetPlanId = budgetData?.budgetPlanId || "";
  const expenseCategories = categories.filter(c => c.type === 'expense');

  const getCategoryEmoji = (category: Category) => {
    // Use the category's emoji from database first, fallback to hardcoded mapping for legacy categories
    return category.emoji || categoryEmojis[category.name as keyof typeof categoryEmojis] || "📋";
  };

  const calculateCategorySpending = (categoryId: string): number => {
    return transactions
      .filter((t: any) => t.type === 'expense' && t.categoryId === categoryId && !t.excludeFromBudget)
      .reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0);
  };

  const getSortedBudgetAllocations = () => {
    // Define section order matching the category selector
    const sectionOrder = [
      "Housing & Utilities",
      "Food & Drinks",
      "Transportation",
      "Health & Wellness",
      "Entertainment & Leisure",
      "Shopping",
      "Finance & Obligations",
      "Other"
    ];

    const allocationsWithData = budgetAllocations
      .map((allocation) => {
        if (!allocation.categoryId) return null;
        const category = categories.find(c => c.id === allocation.categoryId);
        if (!category) return null;

        const spent = calculateCategorySpending(allocation.categoryId);
        const budget = parseFloat(allocation.allocatedAmount);
        const remaining = budget - spent;
        // Use the category's section field from database, fallback to hardcoded mapping for legacy categories
        const section = category.section || categorySections[category.name] || "Other";

        return { allocation, category, spent, budget, remaining, section };
      })
      .filter(Boolean) as Array<{
        allocation: BudgetCategoryAllocation;
        category: Category;
        spent: number;
        budget: number;
        remaining: number;
        section: string;
      }>;

    // Always sort by section in the defined order
    return allocationsWithData.sort((a, b) => {
      const sectionIndexA = sectionOrder.indexOf(a.section);
      const sectionIndexB = sectionOrder.indexOf(b.section);

      if (sectionIndexA !== sectionIndexB) {
        return sectionIndexA - sectionIndexB;
      }
      // Within same section, sort by category name
      return a.category.name.localeCompare(b.category.name);
    });
  };

  // Calculate total budget and total spent
  const totalBudget = budgetAllocations.reduce((sum, allocation) =>
    sum + parseFloat(allocation.allocatedAmount || "0"), 0
  );

  const totalSpent = budgetAllocations.reduce((sum, allocation) => {
    if (!allocation.categoryId) return sum;
    return sum + calculateCategorySpending(allocation.categoryId);
  }, 0);

  const addBudgetAllocationMutation = useMutation({
    mutationFn: (allocation: { budgetPlanId: string; categoryId: string; allocatedAmount: string }) =>
      apiRequest("POST", "/api/budget-allocations", allocation),
    onSuccess: () => {
      toast({ title: "Success", description: "Budget category added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/budget-allocations/current-month"] });
      setIsEditModalOpen(false);
      setSelectedCategoryId("");
      setBudgetAmount("");
      setEditingAllocationId(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add budget category", variant: "destructive" });
    },
  });

  const updateBudgetAllocationMutation = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: string }) =>
      apiRequest("PUT", `/api/budget-allocations/${id}`, { allocatedAmount: amount }),
    onSuccess: () => {
      toast({ title: "Success", description: "Budget updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/budget-allocations/current-month"] });
      setIsEditModalOpen(false);
      setSelectedCategoryId("");
      setBudgetAmount("");
      setEditingAllocationId(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update budget", variant: "destructive" });
    },
  });

  const deleteBudgetAllocationMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", "/api/budget-allocations/" + id),
    onSuccess: () => {
      toast({ title: "Success", description: "Budget category removed successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/budget-allocations/current-month"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove budget category", variant: "destructive" });
    },
  });

  const handleOpenEditModal = () => {
    setEditingAllocationId(null);
    setSelectedCategoryId("");
    setBudgetAmount("");
    setIsEditModalOpen(true);
  };

  const handleEditAllocation = (allocation: BudgetCategoryAllocation) => {
    setEditingAllocationId(allocation.id);
    setSelectedCategoryId(allocation.categoryId || "");
    setBudgetAmount(allocation.allocatedAmount);
    setIsEditModalOpen(true);
  };

  const handleSaveBudget = () => {
    if (!selectedCategoryId || !budgetAmount || parseFloat(budgetAmount) <= 0) {
      toast({
        title: "Error",
        description: "Please select a category and enter a valid budget amount",
        variant: "destructive",
      });
      return;
    }

    if (editingAllocationId) {
      updateBudgetAllocationMutation.mutate({ id: editingAllocationId, amount: budgetAmount });
    } else {
      addBudgetAllocationMutation.mutate({
        budgetPlanId,
        categoryId: selectedCategoryId,
        allocatedAmount: budgetAmount,
      });
    }
  };

  const handleDeleteBudgetAllocation = (id: string) => {
    if (window.confirm("Are you sure you want to remove this budget category?")) {
      deleteBudgetAllocationMutation.mutate(id);
    }
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
              Budget
            </h2>
          </div>

          <div className="flex items-center justify-between gap-2">
            {/* Left side - Budget summary and view toggle */}
            <div className="flex items-center gap-2">
              {/* Budget Summary Card */}
              <div
                style={{
                  height: '48px',
                  backgroundColor: '#fff',
                  border: '1px solid #F3F4F6',
                  borderRadius: '30px',
                  fontFamily: 'Inter',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#000',
                  padding: '0 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                {currencySymbol}{totalSpent.toFixed(0)} / {currencySymbol}{totalBudget.toFixed(0)}
              </div>

              {/* View Mode Toggle Button */}
              <button
              type="button"
              onClick={() => setBudgetViewMode(budgetViewMode === 'bar' ? 'circle' : 'bar')}
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
            >
              {budgetViewMode === 'bar' ? (
                <BarChart3 size={20} className="text-black group-hover:text-white transition-colors" />
              ) : (
                <PieChart size={20} className="text-black group-hover:text-white transition-colors" />
              )}
            </button>
            </div>

            {/* Add Button - Right side */}
            <Button
                onClick={handleOpenEditModal}
                style={{
                  height: '48px',
                  minHeight: '48px',
                  minWidth: '48px',
                  width: '48px',
                  borderRadius: '30px'
                }}
                className="bg-[#F3F4F6] text-black hover:bg-black hover:text-white p-0"
              >
                <Plus className="w-5 h-5" />
              </Button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '15px 20px' }}>
          {isBudgetLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center">
                <Target className="w-8 h-8 text-purple-600 animate-pulse" />
              </div>
            </div>
          ) : budgetAllocations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mb-4">
                <Target className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Budget Categories</h3>
              <p className="text-gray-600">Click Edit to add categories</p>
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

                  const showSectionHeader = section !== lastSection;
                  if (showSectionHeader) {
                    lastSection = section;
                  }

                  return (
                    <div key={allocation.id}>
                      {showSectionHeader && (
                        <div className="sticky top-0 bg-white z-10 pt-2 pb-2">
                          <h3 style={{ fontFamily: 'Inter', fontSize: '10px', fontWeight: 600, color: '#6B7280' }}>
                            {section}
                          </h3>
                        </div>
                      )}
                      <div
                        className="p-3 border border-gray-100 rounded-lg hover:bg-gray-50 group cursor-pointer"
                        onClick={() => handleEditAllocation(allocation)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 flex-1">
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: categoryColor + '20' }}
                            >
                              <span className="text-lg">{emoji}</span>
                            </div>
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900 mb-1 text-sm">{category.name}</h4>
                              <p className="text-xs text-gray-600 mb-2">
                                {formatCurrency(spent.toString())} / {formatCurrency(allocation.allocatedAmount)}
                              </p>
                              <Progress value={Math.min(percentage, 100)} className="h-1.5" />
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteBudgetAllocation(allocation.id);
                            }}
                            disabled={deleteBudgetAllocationMutation.isPending}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {(() => {
                const sortedData = getSortedBudgetAllocations();
                let lastSection = '';
                const result: JSX.Element[] = [];

                sortedData.forEach((item) => {
                  const { allocation, category, spent, budget, remaining, section } = item;
                  const percentage = budget > 0 ? (spent / budget) * 100 : 0;
                  const emoji = getCategoryEmoji(category);
                  const categoryColor = category.color || "#6B7280";

                  const showSectionHeader = section !== lastSection;
                  if (showSectionHeader) {
                    lastSection = section;
                    result.push(
                      <div key={`section-${section}`} className="col-span-4 sticky top-0 bg-white z-10 pt-2 pb-2">
                        <h3 style={{ fontFamily: 'Inter', fontSize: '10px', fontWeight: 600, color: '#6B7280' }}>
                          {section}
                        </h3>
                      </div>
                    );
                  }

                  const radius = 90;
                  const circumference = 2 * Math.PI * 36;
                  const strokeDashoffset = circumference - (percentage / 100) * circumference;

                  result.push(
                    <div
                      key={allocation.id}
                      className="relative flex flex-col items-center p-2 border border-gray-100 rounded-lg hover:bg-gray-50 group cursor-pointer"
                      onClick={() => handleEditAllocation(allocation)}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 p-0 hover:bg-red-100 hover:text-red-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBudgetAllocation(allocation.id);
                        }}
                        disabled={deleteBudgetAllocationMutation.isPending}
                      >
                        <X className="h-3 w-3" />
                      </Button>

                      <svg width="90" height="90" className="transform -rotate-90">
                        <circle cx="45" cy="45" r="36" fill="none" stroke="#f3f4f6" strokeWidth="6" />
                        <circle
                          cx="45" cy="45" r="36" fill="none" stroke={categoryColor}
                          strokeWidth="6" strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset} strokeLinecap="round"
                        />
                      </svg>

                      <div className="absolute top-[10px] left-0 right-0 flex flex-col items-center justify-center h-[90px]">
                        <span className="text-xl mb-0.5">{emoji}</span>
                        <span className="text-[9px] font-medium text-gray-900">
                          {formatCurrency(remaining.toString())}
                        </span>
                      </div>

                      <p className="text-[10px] font-medium text-center text-gray-900 mt-1 line-clamp-2">
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
      </div>

      {/* Edit Budget Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-2xl rounded-2xl" aria-describedby="add-budget-category-description">
          <DialogDescription id="add-budget-category-description" className="sr-only">
            {editingAllocationId
              ? "Update the budget amount for this category"
              : "Select a category and set a monthly budget to track your spending"}
          </DialogDescription>

          <div className="flex flex-col h-full md:block md:h-auto md:space-y-6">
            {/* Top Section: Title + Form Fields (scrollable on mobile) */}
            <div className="flex-1 overflow-y-auto px-6 md:px-0 md:overflow-visible">
              {/* Title */}
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 text-center mb-5 md:mb-6 pt-2">
                {editingAllocationId ? "Edit Budget" : "Add Budget Category"}
              </h2>

              {/* Form Fields */}
              <div className="space-y-5 md:space-y-6">
                {/* Amount Field - Large bold numbers */}
                <div>
                  <div className="relative" style={{
                    fontSize: (() => {
                      const displayLength = budgetAmount.replace(/\./g, '').length;
                      let fontSizeMobile = '90px';
                      let fontSizeDesktop = '90px';
                      if (displayLength > 13) {
                        fontSizeMobile = '40px';
                        fontSizeDesktop = '46px';
                      } else if (displayLength > 11) {
                        fontSizeMobile = '44px';
                        fontSizeDesktop = '50px';
                      } else if (displayLength > 9) {
                        fontSizeMobile = '46px';
                        fontSizeDesktop = '52px';
                      } else if (displayLength > 8) {
                        fontSizeMobile = '50px';
                        fontSizeDesktop = '58px';
                      } else if (displayLength > 7) {
                        fontSizeMobile = '54px';
                        fontSizeDesktop = '62px';
                      } else if (displayLength > 6) {
                        fontSizeMobile = '60px';
                        fontSizeDesktop = '70px';
                      } else {
                        fontSizeMobile = '70px';
                        fontSizeDesktop = '85px';
                      }
                      return `clamp(${fontSizeMobile}, 5vw, ${fontSizeDesktop})`;
                    })()
                  }}>
                    <span className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-[clamp(20px,calc(4px+2vw),35px)] font-normal" style={{ pointerEvents: 'none', zIndex: 1 }}>
                      {currencySymbol}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      autoComplete="one-time-code"
                      className={`h-[120px] md:h-28 w-full font-bold text-center border-0 bg-gray-50 rounded-2xl focus:bg-gray-50 focus:ring-0 focus:outline-none ${
                        (() => {
                          const displayLength = budgetAmount.replace(/\./g, '').length;
                          if (displayLength > 13) return 'pl-8 sm:pl-10 pr-8 sm:pr-10';
                          if (displayLength > 11) return 'pl-10 sm:pl-12 pr-10 sm:pr-12';
                          if (displayLength > 9) return 'pl-10 sm:pl-12 pr-10 sm:pr-12';
                          if (displayLength > 8) return 'pl-12 sm:pl-14 pr-12 sm:pr-14';
                          if (displayLength > 7) return 'pl-12 sm:pl-16 pr-12 sm:pr-16';
                          if (displayLength > 6) return 'pl-14 sm:pl-16 pr-14 sm:pr-16';
                          return 'pl-16 sm:pl-20 pr-16 sm:pr-20';
                        })()
                      } placeholder-gray-300`}
                      style={{
                        caretColor: 'auto',
                        fontSize: 'max(16px, inherit)',
                        lineHeight: '1.2'
                      }}
                      value={budgetAmount}
                      onChange={(e) => {
                        let value = e.target.value;
                        // Allow only numbers and decimal point
                        value = value.replace(/[^\d.]/g, '');
                        // Allow only one decimal point
                        const parts = value.split('.');
                        if (parts.length > 2) return;
                        // Limit to 2 decimal places
                        if (parts[1] && parts[1].length > 2) return;
                        setBudgetAmount(value);
                      }}
                    />
                  </div>
                </div>

                {/* Category Selector */}
                <div className="[&>button]:h-14 md:[&>button]:h-12 [&>button]:text-sm [&>button]:border [&>button]:border-gray-200 [&>button]:bg-gray-50 [&>button]:rounded-xl [&>button]:hover:bg-white [&>button]:hover:border-gray-300 [&>button]:focus:bg-white [&>button]:focus:border-gray-900 [&>button]:transition-all">
                  <CategorySelector
                    value={selectedCategoryId}
                    onValueChange={setSelectedCategoryId}
                    type="expense"
                    disabled={!!editingAllocationId}
                  />
                </div>
              </div>
            </div>

            {/* Bottom Section: Save Button */}
            <div className="flex-shrink-0 p-6 pt-6 md:pt-0 md:px-0 bg-background">
              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleSaveBudget}
                  disabled={addBudgetAllocationMutation.isPending || updateBudgetAllocationMutation.isPending}
                  className="w-full h-16 md:h-14 text-base font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  style={{
                    backgroundColor: '#000',
                    color: '#FFF'
                  }}
                >
                  {(addBudgetAllocationMutation.isPending || updateBudgetAllocationMutation.isPending)
                    ? "Saving..."
                    : editingAllocationId
                      ? "Update Budget"
                      : "Add Category"}
                </Button>

                {editingAllocationId && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (window.confirm("Are you sure you want to delete this budget category?")) {
                        handleDeleteBudgetAllocation(editingAllocationId);
                        setIsEditModalOpen(false);
                        setSelectedCategoryId("");
                        setBudgetAmount("");
                        setEditingAllocationId(null);
                      }
                    }}
                    disabled={deleteBudgetAllocationMutation.isPending}
                    className="w-full h-16 md:h-14 text-base font-semibold rounded-xl text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                  >
                    {deleteBudgetAllocationMutation.isPending ? "Deleting..." : "Delete Budget"}
                  </Button>
                )}

                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setSelectedCategoryId("");
                    setBudgetAmount("");
                    setEditingAllocationId(null);
                  }}
                  className="md:hidden w-full h-16 text-base font-semibold rounded-xl"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
