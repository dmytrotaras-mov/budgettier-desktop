import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Target, Plus } from "lucide-react";
import { format, getDaysInMonth, isSameMonth } from "date-fns";
import { invoke } from "@tauri-apps/api/core";
import { PillTabs } from "@/components/overview/category-breakdown";
import { BudgetStatusList, BudgetSummary, type BudgetItem, type BudgetView, type UnbudgetedItem } from "./budget-status-list";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/hooks/useCurrency";
import type { Transaction, Category, BudgetCategoryAllocation } from "@shared/schema";
import CategorySelector from "@/components/track/category-selector-redesigned";
import { useSections, visibleSections, resolveCategorySection, isHiddenCategory, sectionColor, UNGROUPED_SECTION_NAME } from "@/lib/sectionUtils";

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

interface MonthBudget {
  budgetPlanId: string;
  allocations: BudgetCategoryAllocation[];
  month: string;
  exists: boolean;
  copySource: string | null;
}

interface BudgetPlanPanelProps {
  dateRange: {
    start: Date;
    end: Date;
  };
  selectedDate: Date;
}

export default function BudgetPlanPanel({ dateRange, selectedDate }: BudgetPlanPanelProps) {
  const [budgetView, setBudgetViewState] = useState<BudgetView>(() => {
    try {
      return localStorage.getItem("budgetView") === "groups" ? "groups" : "status";
    } catch {
      return "status";
    }
  });
  const setBudgetView = (view: BudgetView) => {
    setBudgetViewState(view);
    try {
      localStorage.setItem("budgetView", view);
    } catch {
      // Remembering the view is a convenience; ignore storage errors.
    }
  };
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
  const { data: allSections = [] } = useSections();

  // The budget of the month being viewed. Current/future months are created
  // on first view as a copy of the latest earlier budget; past months aren't.
  const monthKey = format(selectedDate, "yyyy-MM");
  const { data: budgetData, isLoading: isBudgetLoading } = useQuery<MonthBudget>({
    queryKey: ["budget-month", monthKey],
    queryFn: () => invoke<MonthBudget>("get_month_budget", { month: monthKey }),
  });
  const refreshBudget = () => {
    queryClient.invalidateQueries({ queryKey: ["budget-month"] });
    queryClient.invalidateQueries({ queryKey: ["/api/budget-allocations/current-month"] });
  };
  const createMonthBudget = useMutation({
    mutationFn: () => invoke<MonthBudget>("create_month_budget", { month: monthKey }),
    onSuccess: refreshBudget,
    onError: (error: any) =>
      toast({ title: "Couldn't create budget", description: String(error?.message || error), variant: "destructive" }),
  });

  const budgetAllocations = budgetData?.allocations || [];
  const budgetPlanId = budgetData?.budgetPlanId || "";
  const expenseCategories = categories.filter(c => c.type === 'expense' && !isHiddenCategory(c, allSections));

  const getCategoryEmoji = (category: Category) => {
    // Use the category's emoji from database first, fallback to hardcoded mapping for legacy categories
    return category.emoji || categoryEmojis[category.name as keyof typeof categoryEmojis] || "📋";
  };

  const calculateCategorySpending = (categoryId: string): number => {
    return transactions
      .filter((t: any) => t.type === 'expense' && t.categoryId === categoryId && !t.excludeFromBudget)
      .reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0);
  };

  // Built-in sections first (in Settings order), then custom sections,
  // then ungrouped "Custom Categories" last.
  const sectionOrder = visibleSections(allSections, "expense").map((s) => s.name);
  const sectionRank = (section: string) => {
    if (section === UNGROUPED_SECTION_NAME) return 1000;
    const idx = sectionOrder.indexOf(section);
    return idx === -1 ? 500 : idx;
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
        // Same section resolution Settings and Overview use.
        const section = resolveCategorySection(category);

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
      const rankA = sectionRank(a.section);
      const rankB = sectionRank(b.section);
      if (rankA !== rankB) return rankA - rankB;
      if (a.section !== b.section) return a.section.localeCompare(b.section);
      // Within same section, sort by category name
      return a.category.name.localeCompare(b.category.name);
    });
  };

  const statusItems: BudgetItem[] = getSortedBudgetAllocations().map(({ allocation, category, spent, budget, section }) => ({
    id: allocation.id,
    name: category.name.trim(),
    emoji: getCategoryEmoji(category),
    section,
    spent,
    budget,
  }));

  // Spending this month in categories that have no limit.
  const budgetedIds = new Set(budgetAllocations.map((a) => a.categoryId));
  const unbudgeted: UnbudgetedItem[] = Object.values(
    transactions.reduce<Record<string, UnbudgetedItem>>((acc, t: any) => {
      if (t.type !== "expense" || t.excludeFromBudget || t.isOpening || !t.categoryId || budgetedIds.has(t.categoryId)) return acc;
      const category = categories.find((c) => c.id === t.categoryId);
      if (!category || isHiddenCategory(category, allSections)) return acc;
      (acc[t.categoryId] ??= { categoryId: t.categoryId, name: category.name.trim(), spent: 0 }).spent += parseFloat(t.amount);
      return acc;
    }, {}),
  ).sort((a, b) => b.spent - a.spent);

  // How far into the selected month we are: drives the "today" marker.
  const today = new Date();
  const daysInMonth = getDaysInMonth(selectedDate);
  const isThisMonth = isSameMonth(selectedDate, today);
  const isPastMonth = !isThisMonth && selectedDate < today;
  const pace = isThisMonth ? today.getDate() / daysInMonth : isPastMonth ? 1 : null;
  const daysLeft = isThisMonth ? daysInMonth - today.getDate() + 1 : isPastMonth ? 0 : null;

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
      refreshBudget();
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
      refreshBudget();
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
      refreshBudget();
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
        style={{ flex: 1, aspectRatio: '525 / 632', minWidth: 0, display: 'flex', flexDirection: 'column', borderRadius: '20px' }}
      >
        {/* Header — same two-row grid as the Transactions panel: title, tabs
            and the add button on one line; the month summary on the second. */}
        <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid #F3F4F6' }}>
          <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
            <h2 className="hidden md:block" style={{ fontFamily: 'Inter', fontSize: '22px', fontWeight: 500, color: '#000' }}>
              Budget
            </h2>
            <PillTabs
              tabs={[["status", "Status"], ["groups", "Groups"]]}
              value={budgetView}
              onChange={setBudgetView}
              size="sm"
            />
            <Button
              onClick={handleOpenEditModal}
              title="Add a category to the budget"
              aria-label="Add a category to the budget"
              style={{ height: 40, width: 40, minWidth: 40, padding: 0, borderRadius: 30 }}
              className="bg-[#F3F4F6] text-black hover:bg-black hover:text-white ml-auto"
            >
              <Plus className="w-5 h-5" />
            </Button>
          </div>

          {budgetData?.exists && budgetAllocations.length > 0 && (
            <div className="mt-3 min-h-[58px]">
              <BudgetSummary
                items={statusItems}
                monthName={format(selectedDate, "MMMM")}
                pace={pace}
                daysLeft={daysLeft}
                formatCurrency={(n) => formatCurrency(n)}
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 20px 15px',
            // Rows slide out softly under the pinned summary.
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 14px)',
            maskImage: 'linear-gradient(to bottom, transparent 0, #000 14px)',
          }}
        >
          {isBudgetLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center">
                <Target className="w-8 h-8 text-purple-600 animate-pulse" />
              </div>
            </div>
          ) : budgetData && !budgetData.exists ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mb-4">
                <Target className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">No budget for {format(selectedDate, "MMMM yyyy")}</h3>
              <p className="text-sm text-gray-500 mb-4">
                {budgetData.copySource
                  ? `Start from the limits you had in ${format(new Date(`${budgetData.copySource}-01T00:00:00`), "MMMM yyyy")}.`
                  : "Create a budget for this month to compare spending with limits."}
              </p>
              <Button
                onClick={() => createMonthBudget.mutate()}
                disabled={createMonthBudget.isPending}
                className="rounded-full bg-black text-white hover:bg-gray-800"
              >
                {budgetData.copySource
                  ? `Copy from ${format(new Date(`${budgetData.copySource}-01T00:00:00`), "MMMM")}`
                  : "Create budget"}
              </Button>
            </div>
          ) : budgetAllocations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mb-4">
                <Target className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">Set a monthly budget</h3>
              <p className="text-sm text-gray-500 mb-4">Pick the categories you want to keep an eye on and give each a limit.</p>
              <Button onClick={handleOpenEditModal} className="rounded-full bg-black text-white hover:bg-gray-800">
                <Plus className="w-4 h-4 mr-1" /> Add category
              </Button>
            </div>
          ) : (
            <BudgetStatusList
              items={statusItems}
              unbudgeted={unbudgeted}
              view={budgetView}
              sectionOrder={sectionRank}
              groupColor={(section) => sectionColor(allSections, section, "expense")}
              pace={pace}
              formatCurrency={(n) => formatCurrency(n)}
              onEdit={(id) => {
                const allocation = budgetAllocations.find((a) => a.id === id);
                if (allocation) handleEditAllocation(allocation);
              }}
              onAddUnbudgeted={(u) => {
                setEditingAllocationId(null);
                setSelectedCategoryId(u.categoryId);
                setBudgetAmount(String(Math.ceil(u.spent / 10) * 10));
                setIsEditModalOpen(true);
              }}
            />
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
