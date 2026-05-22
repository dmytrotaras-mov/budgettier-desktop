import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/hooks/useCurrency";
import { startOfMonth, endOfMonth, format } from "date-fns";
import type { Transaction, Category, BudgetPlan, BudgetCategoryAllocation } from "@shared/schema";

interface CategoryProgress {
  categoryId: string;
  categoryName: string;
  emoji?: string;
  budgeted: number;
  spent: number;
  percentage: number;
  status: 'good' | 'warning' | 'over';
}

interface BudgetOverviewProps {
  selectedDate: Date;
  onEditBudget?: () => void;
}

export default function BudgetOverview({ selectedDate, onEditBudget }: BudgetOverviewProps) {
  const { formatCurrency } = useCurrency();

  // Fetch categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  // Fetch transactions for the selected month
  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

  // Fetch budget plan for the selected month
  const month = format(selectedDate, 'yyyy-MM');
  const { data: budgetPlan } = useQuery<BudgetPlan>({
    queryKey: ["/api/budget-plans", "monthly", month],
    queryFn: () => fetch(`/api/budget-plans?period=monthly&month=${month}`).then(res => res.json()),
  });

  // Fetch budget allocations if we have a budget plan
  const { data: budgetAllocations = [] } = useQuery<BudgetCategoryAllocation[]>({
    queryKey: ["/api/budget-allocations", budgetPlan?.id],
    queryFn: () => fetch(`/api/budget-allocations/${budgetPlan?.id}`).then(res => res.json()),
    enabled: !!budgetPlan?.id,
  });

  // Calculate month range
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);

  // Filter transactions for the current month
  const monthTransactions = transactions.filter((transaction: any) => {
    const transactionDate = new Date(transaction.date);
    return transactionDate >= monthStart && transactionDate <= monthEnd;
  });

  // Calculate category progress from real budget allocations
  const categoryProgress: CategoryProgress[] = budgetAllocations.map(allocation => {
    const category = categories.find(cat => cat.id === allocation.categoryId);
    
    // Calculate spent amount for this category
    const spent = monthTransactions
      .filter((transaction: any) =>
        transaction.type === 'expense' &&
        transaction.categoryId === allocation.categoryId &&
        !transaction.excludeFromBudget
      )
      .reduce((sum: number, transaction: any) => sum + parseFloat(transaction.amount), 0);

    const budgeted = parseFloat(allocation.allocatedAmount);
    const percentage = budgeted > 0 ? (spent / budgeted) * 100 : 0;
    
    let status: 'good' | 'warning' | 'over' = 'good';
    if (percentage >= 100) status = 'over';
    else if (percentage >= 80) status = 'warning';

    return {
      categoryId: allocation.categoryId || 'unknown',
      categoryName: category?.name || 'Unknown Category',
      emoji: category?.emoji || "📋",
      budgeted,
      spent,
      percentage: Math.min(percentage, 100),
      status
    };
  });

  // Calculate totals from budget plan or category progress
  const totalBudgeted = budgetPlan ? parseFloat(budgetPlan.expenseBudget) : categoryProgress.reduce((sum, cat) => sum + cat.budgeted, 0);
  const totalSpent = categoryProgress.reduce((sum, cat) => sum + cat.spent, 0);
  const overallPercentage = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

  const getProgressColor = (status: 'good' | 'warning' | 'over') => {
    switch (status) {
      case 'good': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'over': return 'bg-red-500';
      default: return 'bg-gray-300';
    }
  };

  const getStatusText = (status: 'good' | 'warning' | 'over') => {
    switch (status) {
      case 'good': return 'On track';
      case 'warning': return 'Close to limit';
      case 'over': return 'Over budget';
      default: return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Budget Summary - Only show if we have a budget plan */}
      {budgetPlan && (
        <>
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm">📊</span>
                </div>
                <span className="font-medium text-gray-700">Budget Overview</span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onEditBudget}
                data-testid="button-edit-budget"
              >
                Edit Budget
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{formatCurrency(totalSpent)}</div>
                <div className="text-sm text-gray-600">Spent</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{formatCurrency(totalBudgeted)}</div>
                <div className="text-sm text-gray-600">Budgeted</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Overall Progress</span>
                <span className="font-medium">{overallPercentage.toFixed(1)}%</span>
              </div>
              <Progress 
                value={Math.min(overallPercentage, 100)} 
                className={`h-2 ${overallPercentage >= 100 ? '[&>div]:bg-red-500' : overallPercentage >= 80 ? '[&>div]:bg-yellow-500' : '[&>div]:bg-green-500'}`}
              />
            </div>
          </div>

          {/* Category List */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-700">Category Breakdown</h3>
        
        <div className="space-y-3">
          {categoryProgress.map((category) => (
            <div key={category.categoryId} className="bg-white border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{category.emoji}</span>
                  <div>
                    <div className="font-medium text-gray-900">{category.categoryName}</div>
                    <div className="text-sm text-gray-500">
                      {formatCurrency(category.spent)} of {formatCurrency(category.budgeted)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-gray-900">{category.percentage.toFixed(1)}%</div>
                  <div className={`text-xs ${
                    category.status === 'good' ? 'text-green-600' :
                    category.status === 'warning' ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {getStatusText(category.status)}
                  </div>
                </div>
              </div>
              
              <Progress 
                value={category.percentage} 
                className={`h-2 [&>div]:${getProgressColor(category.status)}`}
              />
              
              {category.status === 'over' && (
                <div className="mt-2 text-sm text-red-600">
                  Over by {formatCurrency(category.spent - category.budgeted)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="h-12" data-testid="button-view-insights">
          📈 View Insights
        </Button>
        <Button variant="outline" className="h-12" data-testid="button-export-budget">
          📄 Export Budget
        </Button>
      </div>
        </>
      )}

      {/* No Budget Message */}
      {!budgetPlan && (
        <div className="text-center py-8 text-gray-500">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="text-lg font-medium mb-2">No Budget Set</h3>
          <p className="text-sm mb-4">Create a budget plan to track your spending for {format(selectedDate, 'MMMM yyyy')}</p>
          <Button onClick={onEditBudget} data-testid="button-create-budget">
            Create Budget
          </Button>
        </div>
      )}
    </div>
  );
}