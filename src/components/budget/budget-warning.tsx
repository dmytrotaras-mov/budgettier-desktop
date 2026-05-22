import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { startOfMonth, endOfMonth } from "date-fns";
import { useCurrency } from "@/hooks/useCurrency";

interface BudgetWarningProps {
  categoryId?: string;
  className?: string;
}

export default function BudgetWarning({ categoryId, className }: BudgetWarningProps) {
  const { formatCurrency } = useCurrency();
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // Get budget goals
  const { data: budgetGoals = [] } = useQuery<any[]>({ 
    queryKey: ["/api/budget-goals"] 
  });

  // Get current month transactions
  const { data: transactions = [] } = useQuery<any[]>({
    queryKey: ["/api/transactions", monthStart.toISOString(), monthEnd.toISOString()],
    queryFn: async () => {
      const response = await fetch(`/api/transactions?startDate=${monthStart.toISOString()}&endDate=${monthEnd.toISOString()}`);
      return response.json();
    },
  });

  // Get categories
  const { data: categories = [] } = useQuery<any[]>({ 
    queryKey: ["/api/categories"] 
  });

  // Calculate spending by category for current month
  const categorySpending = transactions
    .filter((t: any) => t.type === "expense")
    .reduce((acc: any, t: any) => {
      acc[t.categoryId] = (acc[t.categoryId] || 0) + parseFloat(t.amount);
      return acc;
    }, {});

  // Check budget goals and find warnings
  const budgetWarnings = budgetGoals
    .map((goal: any) => {
      const spent = categorySpending[goal.categoryId] || 0;
      const limit = parseFloat(goal.monthlyLimit);
      const percentage = (spent / limit) * 100;
      const category = categories.find((c: any) => c.id === goal.categoryId);
      
      return {
        ...goal,
        categoryName: category?.name || "Unknown Category",
        spent,
        percentage,
        isOverBudget: percentage >= 100,
        isNearLimit: percentage >= 80 && percentage < 100
      };
    })
    .filter((warning: any) => {
      // If categoryId is specified, only show warning for that category
      if (categoryId) {
        return warning.categoryId === categoryId && (warning.isOverBudget || warning.isNearLimit);
      }
      // Otherwise show all warnings
      return warning.isOverBudget || warning.isNearLimit;
    });

  if (budgetWarnings.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      {budgetWarnings.map((warning: any) => (
        <Alert
          key={warning.id}
          className={`mb-2 ${
            warning.isOverBudget
              ? "border-red-600 bg-red-50"
              : "border-yellow-600 bg-yellow-50"
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {warning.isOverBudget ? "Budget Exceeded!" : "Approaching Budget Limit"}
          </AlertTitle>
          <AlertDescription className="mt-2">
            <div className="flex justify-between text-sm mb-2">
              <span>{warning.categoryName}</span>
              <span className="font-semibold">
                {formatCurrency(warning.spent)} / {formatCurrency(parseFloat(warning.monthlyLimit))}
              </span>
            </div>
            <Progress 
              value={Math.min(warning.percentage, 100)} 
              className="h-2"
            />
            <p className="text-xs mt-1">
              {warning.isOverBudget
                ? `You've exceeded your monthly budget by ${formatCurrency(warning.spent - parseFloat(warning.monthlyLimit))}`
                : `${(100 - warning.percentage).toFixed(1)}% of budget remaining`
              }
            </p>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}