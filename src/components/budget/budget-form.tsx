import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrency } from "@/hooks/useCurrency";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import type { Category, BudgetPlan, BudgetCategoryAllocation } from "@shared/schema";

interface CategoryAllocation {
  categoryId: string;
  categoryName: string;
  amount: number;
  emoji?: string;
}

interface BudgetFormData {
  totalBudget: number;
  savingsAmount: number;
  savingsPercentage: number;
  expenseBudget: number;
  categoryAllocations: CategoryAllocation[];
}

interface BudgetFormProps {
  selectedDate: Date;
  onSave?: (data: BudgetFormData) => void;
  editMode?: boolean;
}

export default function BudgetForm({ selectedDate, onSave, editMode = false }: BudgetFormProps) {
  const { formatCurrency, currencySymbol } = useCurrency();
  const { toast } = useToast();
  const [budgetData, setBudgetData] = useState<BudgetFormData>({
    totalBudget: 3000,
    savingsAmount: 300,
    savingsPercentage: 10,
    expenseBudget: 2700,
    categoryAllocations: []
  });

  const [newCategoryId, setNewCategoryId] = useState<string>("");
  const [newCategoryAmount, setNewCategoryAmount] = useState<string>("");

  // Fetch expense categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const expenseCategories = categories.filter(cat => cat.type === 'expense');

  // Fetch existing budget plan when in edit mode
  const { data: existingBudgetPlan } = useQuery<BudgetPlan>({
    queryKey: ["/api/budget-plans", format(selectedDate, 'yyyy-MM')],
    enabled: editMode,
  });

  // Fetch existing budget allocations when in edit mode
  const { data: existingAllocations = [] } = useQuery<BudgetCategoryAllocation[]>({
    queryKey: ["/api/budget-allocations", existingBudgetPlan?.id],
    enabled: editMode && !!existingBudgetPlan?.id,
  });

  // Mutations for saving budget plan and allocations
  const createBudgetPlanMutation = useMutation({
    mutationFn: async (budgetPlan: any) => {
      return apiRequest("POST", "/api/budget-plans", budgetPlan);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budget-plans"] });
    },
  });

  const createAllocationMutation = useMutation({
    mutationFn: async (allocation: any) => {
      return apiRequest("POST", "/api/budget-allocations", allocation);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budget-allocations"] });
    },
  });

  // Update mutations for edit mode
  const updateBudgetPlanMutation = useMutation({
    mutationFn: async (budgetPlan: any) => {
      return apiRequest("PUT", `/api/budget-plans/${budgetPlan.id}`, budgetPlan);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budget-plans"] });
    },
  });

  // Populate form with existing data when in edit mode
  useEffect(() => {
    if (editMode && existingBudgetPlan && existingAllocations.length > 0) {
      const categoryAllocations: CategoryAllocation[] = existingAllocations.map(allocation => {
        const category = expenseCategories.find(cat => cat.id === allocation.categoryId);
        return {
          categoryId: allocation.categoryId || '',
          categoryName: category?.name || 'Unknown Category',
          amount: parseFloat(allocation.allocatedAmount),
          emoji: category?.emoji || "📋"
        };
      });

      setBudgetData({
        totalBudget: parseFloat(existingBudgetPlan.totalBudget),
        savingsAmount: parseFloat(existingBudgetPlan.savingsAmount),
        savingsPercentage: parseFloat(existingBudgetPlan.savingsPercentage),
        expenseBudget: parseFloat(existingBudgetPlan.expenseBudget),
        categoryAllocations
      });
    }
  }, [editMode, existingBudgetPlan, existingAllocations, expenseCategories]);

  // Calculate expense budget when total budget or savings changes
  useEffect(() => {
    const expenseBudget = budgetData.totalBudget - budgetData.savingsAmount;
    setBudgetData(prev => ({ ...prev, expenseBudget }));
  }, [budgetData.totalBudget, budgetData.savingsAmount]);

  // Handle total budget change
  const handleBudgetChange = (value: string) => {
    const totalBudget = parseFloat(value) || 0;
    setBudgetData(prev => ({
      ...prev,
      totalBudget,
      savingsPercentage: totalBudget > 0 ? (prev.savingsAmount / totalBudget) * 100 : 0
    }));
  };

  // Handle savings amount change
  const handleSavingsAmountChange = (value: string) => {
    const savingsAmount = parseFloat(value) || 0;
    setBudgetData(prev => ({
      ...prev,
      savingsAmount,
      savingsPercentage: prev.totalBudget > 0 ? (savingsAmount / prev.totalBudget) * 100 : 0
    }));
  };

  // Handle savings percentage change
  const handleSavingsPercentageChange = (value: string) => {
    const savingsPercentage = parseFloat(value) || 0;
    const savingsAmount = (budgetData.totalBudget * savingsPercentage) / 100;
    setBudgetData(prev => ({
      ...prev,
      savingsPercentage,
      savingsAmount
    }));
  };

  // Add category allocation
  const handleAddCategory = () => {
    if (!newCategoryId || !newCategoryAmount) return;
    
    const category = expenseCategories.find(cat => cat.id === newCategoryId);
    if (!category) return;

    const amount = parseFloat(newCategoryAmount);
    if (amount <= 0) return;

    const newAllocation: CategoryAllocation = {
      categoryId: category.id,
      categoryName: category.name,
      amount,
      emoji: category.emoji || "📋"
    };

    setBudgetData(prev => ({
      ...prev,
      categoryAllocations: [...prev.categoryAllocations, newAllocation]
    }));

    setNewCategoryId("");
    setNewCategoryAmount("");
  };

  // Remove category allocation
  const handleRemoveCategory = (categoryId: string) => {
    setBudgetData(prev => ({
      ...prev,
      categoryAllocations: prev.categoryAllocations.filter(alloc => alloc.categoryId !== categoryId)
    }));
  };

  // Calculate total allocated amount
  const totalAllocated = budgetData.categoryAllocations.reduce((sum, alloc) => sum + alloc.amount, 0);
  const remainingBudget = budgetData.expenseBudget - totalAllocated;

  // Get available categories (not already allocated)
  const availableCategories = expenseCategories.filter(
    cat => !budgetData.categoryAllocations.some(alloc => alloc.categoryId === cat.id)
  );

  // Handle save budget plan
  const handleSaveBudget = async () => {
    try {
      const month = format(selectedDate, 'yyyy-MM');
      let budgetPlanId: string;
      
      const budgetPlanData = {
        name: `${format(selectedDate, 'MMMM yyyy')} Budget`,
        totalBudget: budgetData.totalBudget.toString(),
        savingsAmount: budgetData.savingsAmount.toString(),
        savingsPercentage: budgetData.savingsPercentage.toString(),
        expenseBudget: budgetData.expenseBudget.toString(),
        period: "monthly",
        month: month,
        year: null,
        isActive: true
      };

      if (editMode && existingBudgetPlan) {
        // Update existing budget plan
        const updatedPlan = await updateBudgetPlanMutation.mutateAsync({
          ...budgetPlanData,
          id: existingBudgetPlan.id
        });
        const updatedPlanData = await updatedPlan.json();
        budgetPlanId = updatedPlanData.id;

        // TODO: Handle updating existing allocations (delete old ones and create new ones)
        // For now, we'll just create new allocations
      } else {
        // Create new budget plan
        const createdPlan = await createBudgetPlanMutation.mutateAsync(budgetPlanData);
        const createdPlanData = await createdPlan.json();
        budgetPlanId = createdPlanData.id;
      }

      // Create category allocations
      for (const allocation of budgetData.categoryAllocations) {
        await createAllocationMutation.mutateAsync({
          budgetPlanId: budgetPlanId,
          categoryId: allocation.categoryId,
          allocatedAmount: allocation.amount.toString()
        });
      }

      toast({
        title: editMode ? "Budget Updated" : "Budget Saved",
        description: editMode ? "Your budget plan has been updated successfully!" : "Your budget plan has been saved successfully!",
      });

      onSave?.(budgetData);
    } catch (error) {
      console.error('Error saving budget:', error);
      toast({
        title: "Error",
        description: `Failed to ${editMode ? 'update' : 'save'} budget plan. Please try again.`,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Budget Amount */}
      <div className="space-y-2">
        <Label htmlFor="budget" className="text-sm font-medium text-gray-700">
          What's your budget?
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-lg font-semibold">
            {currencySymbol}
          </span>
          <Input
            id="budget"
            type="number"
            value={budgetData.totalBudget}
            onChange={(e) => handleBudgetChange(e.target.value)}
            className="pl-8 text-2xl font-bold h-14 text-center bg-gray-50"
            placeholder="3000"
            data-testid="input-total-budget"
          />
        </div>
      </div>

      {/* Parameters Section */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center">
            <span className="text-white text-sm">✓</span>
          </div>
          <span className="font-medium text-gray-700">Parameters</span>
        </div>

        {/* Savings Section */}
        <div className="space-y-3">
          <Label className="text-sm font-medium text-gray-600">
            How much you wanna save?
          </Label>
          
          <div className="grid grid-cols-2 gap-3">
            {/* Percentage Input */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-semibold">
                %
              </span>
              <Input
                type="number"
                value={budgetData.savingsPercentage.toFixed(0)}
                onChange={(e) => handleSavingsPercentageChange(e.target.value)}
                className="pl-8 text-xl font-bold h-12 text-center"
                placeholder="10"
                step="0.1"
                min="0"
                max="100"
                data-testid="input-savings-percentage"
              />
            </div>

            {/* Amount Input */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-semibold">
                {currencySymbol}
              </span>
              <Input
                type="number"
                value={budgetData.savingsAmount}
                onChange={(e) => handleSavingsAmountChange(e.target.value)}
                className="pl-8 text-xl font-bold h-12 text-center"
                placeholder="300"
                min="0"
                data-testid="input-savings-amount"
              />
            </div>
          </div>
        </div>

        {/* Budget for Expenses */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-600">
            Budget for expenses
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-lg font-semibold">
              {currencySymbol}
            </span>
            <div className="pl-8 text-2xl font-bold h-12 bg-white border rounded-md flex items-center">
              {budgetData.expenseBudget.toFixed(0)}
            </div>
          </div>
        </div>
      </div>

      {/* Plan Expenses Section */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-700">
            Plan you expenses
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-lg font-semibold">
              {currencySymbol}
            </span>
            <div className="pl-8 text-2xl font-bold h-12 bg-gray-50 border rounded-md flex items-center">
              {totalAllocated.toFixed(0)}
            </div>
          </div>
          {remainingBudget !== 0 && (
            <p className={`text-sm ${remainingBudget > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {remainingBudget > 0 ? 'Remaining: ' : 'Over budget: '}{formatCurrency(Math.abs(remainingBudget))}
            </p>
          )}
        </div>

        {/* Category Allocations List */}
        <div className="space-y-3">
          {budgetData.categoryAllocations.map((allocation) => (
            <div key={allocation.categoryId} className="flex items-center justify-between p-3 bg-white rounded-lg border">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{allocation.emoji}</span>
                <span className="font-medium text-gray-700">{allocation.categoryName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900">{formatCurrency(allocation.amount)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveCategory(allocation.categoryId)}
                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                  data-testid={`button-remove-category-${allocation.categoryId}`}
                >
                  ×
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Add Category Form */}
        {availableCategories.length > 0 && (
          <div className="flex gap-2">
            <Select value={newCategoryId} onValueChange={setNewCategoryId}>
              <SelectTrigger className="flex-1" data-testid="select-new-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {availableCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    <div className="flex items-center gap-2">
                      <span>{category.emoji || "📋"}</span>
                      <span>{category.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <div className="relative w-24">
              <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">{currencySymbol}</span>
              <Input
                type="number"
                value={newCategoryAmount}
                onChange={(e) => setNewCategoryAmount(e.target.value)}
                placeholder="0"
                className="pl-6 text-center"
                min="0"
                data-testid="input-new-category-amount"
              />
            </div>
            
            <Button
              onClick={handleAddCategory}
              disabled={!newCategoryId || !newCategoryAmount}
              className="px-6"
              data-testid="button-add-category"
            >
              Add
            </Button>
          </div>
        )}
      </div>

      {/* Save Button */}
      <Button
        onClick={handleSaveBudget}
        disabled={createBudgetPlanMutation.isPending || createAllocationMutation.isPending}
        className="w-full bg-gray-600 hover:bg-gray-700 text-white font-medium h-12"
        data-testid="button-save-budget"
      >
        {(createBudgetPlanMutation.isPending || createAllocationMutation.isPending) ? "Saving..." : "Save Budget Plan"}
      </Button>
    </div>
  );
}