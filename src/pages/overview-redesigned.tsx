import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer as RechartsResponsiveContainer } from "recharts";
import { Checkbox } from "@/components/ui/checkbox";
import { TrendingUp, TrendingDown, Wallet, ChevronLeft, ChevronRight, Expand, PiggyBank, ChevronDown, Check } from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { useCurrency } from "@/hooks/useCurrency";
import ResponsiveContainer from "@/components/layout/responsive-container";
import { getSectionEmojiFromStorage } from "@/lib/sectionUtils";
import {
  calculateYearOverview,
  calculateYearsProgress,
  calculateCurrentMonthProgression,
  getDefaultSection,
  getExpandedPanelTitle,
} from "@/lib/overviewCalculations";

function renderExpandedPanel(panelId: string, data: any, formatCurrency: (amount: number) => string): JSX.Element {
  const { chartDataVisibility, toggleDataSeries } = data || {};

  switch (panelId) {
    case 'monthly-progress': {
      const panel2DataSeries = [
        { key: 'currentMonth', name: 'Current Month', color: '#ED4040' },
        { key: 'average', name: 'Average', color: '#9ca3af' },
        { key: 'yearIncome', name: 'Income', color: '#10b981' },
        { key: 'yearExpenses', name: 'Expenses', color: '#ef4444' }
      ];

      return (
        <div className="p-3 md:p-6">
          <div style={{ minHeight: '400px', display: 'flex', alignItems: 'center' }}>
            <RechartsResponsiveContainer width="100%" height={400}>
              <LineChart
                data={data.viewMode === 'month' ? data.currentMonthProgression?.chartData || [] : data.yearsProgressData || []}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey={data.viewMode === 'month' ? "day" : "year"}
                tick={{ fontSize: 10, fill: "#666" }}
                stroke="#ccc"
                type={data.viewMode === 'month' ? "number" : "category"}
                domain={data.viewMode === 'month' ? [1, 31] : undefined}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#666" }}
                stroke="#ccc"
                axisLine={false}
                tickLine={false}
                width={50}
              />
              <Tooltip
                contentStyle={{ backgroundColor: 'white', border: '1px solid #ccc', borderRadius: '8px', fontSize: '12px', padding: '8px' }}
                formatter={(value: any, name: string) => [formatCurrency(Number(value)), name === 'currentMonth' ? 'Current Month' : name === 'average' ? 'Average' : name]}
              />
              {data.viewMode === 'month' ? (
                <>
                  {(data.panel2ChartVisibility?.currentMonth ?? true) && <Line
                    type="monotone"
                    dataKey="currentMonth"
                    stroke="#ED4040"
                    strokeWidth={2}
                    dot={(props: any) => {
                      // Show dot only at today's position for current month
                      if (data.currentMonthProgression?.isCurrentMonth && props.payload.day === data.currentMonthProgression?.todayDay) {
                        return <circle cx={props.cx} cy={props.cy} r={4} fill="#ED4040" />;
                      }
                      return null;
                    }}
                    name="Current Month"
                    connectNulls={false}
                  />}
                  {(data.panel2ChartVisibility?.average ?? true) && <Line type="monotone" dataKey="average" stroke="#9ca3af" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Average" connectNulls={true} />}
                </>
              ) : (
                <>
                  {(data.panel2ChartVisibility?.yearIncome ?? true) && <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981", r: 4 }} name="Income" />}
                  {(data.panel2ChartVisibility?.yearExpenses ?? true) && <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={{ fill: "#ef4444", r: 4 }} name="Expenses" />}
                </>
              )}
            </LineChart>
          </RechartsResponsiveContainer>
          </div>

          {/* Checkboxes for toggling data series */}
          <div className="mt-4 md:mt-8 flex flex-nowrap gap-3 md:gap-6 justify-center px-2">
            {data.viewMode === 'month' ? (
              <>
                {[panel2DataSeries[0], panel2DataSeries[1]].map((series) => (
                  <div key={series.key} className="flex flex-col items-center gap-1.5 md:gap-2">
                    <Checkbox
                      id={`modal-checkbox-${series.key}`}
                      checked={data.panel2ChartVisibility?.[series.key as keyof typeof data.panel2ChartVisibility] ?? true}
                      onCheckedChange={() => data.togglePanel2DataSeries?.(series.key as keyof typeof data.panel2ChartVisibility)}
                      className="data-[state=checked]:border-0 w-6 h-6 md:w-5 md:h-5"
                      style={{
                        backgroundColor: (data.panel2ChartVisibility?.[series.key as keyof typeof data.panel2ChartVisibility] ?? true) ? series.color : 'transparent',
                        borderColor: series.color
                      }}
                    />
                    <label htmlFor={`modal-checkbox-${series.key}`} className="cursor-pointer text-[10px] md:text-sm font-medium text-center leading-tight">{series.name}</label>
                  </div>
                ))}
              </>
            ) : (
              <>
                {[panel2DataSeries[2], panel2DataSeries[3]].map((series) => (
                  <div key={series.key} className="flex flex-col items-center gap-1.5 md:gap-2">
                    <Checkbox
                      id={`modal-checkbox-${series.key}`}
                      checked={data.panel2ChartVisibility?.[series.key as keyof typeof data.panel2ChartVisibility] ?? true}
                      onCheckedChange={() => data.togglePanel2DataSeries?.(series.key as keyof typeof data.panel2ChartVisibility)}
                      className="data-[state=checked]:border-0 w-6 h-6 md:w-5 md:h-5"
                      style={{
                        backgroundColor: (data.panel2ChartVisibility?.[series.key as keyof typeof data.panel2ChartVisibility] ?? true) ? series.color : 'transparent',
                        borderColor: series.color
                      }}
                    />
                    <label htmlFor={`modal-checkbox-${series.key}`} className="cursor-pointer text-[10px] md:text-sm font-medium text-center leading-tight">{series.name}</label>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      );
    }

    case 'year-budget': {
      const dataSeries = [
        { key: 'income', name: 'Income', color: '#10b981' },
        { key: 'expenses', name: 'Expenses', color: '#ef4444' },
        { key: 'savings', name: 'Savings', color: '#f59e0b' },
        { key: 'balance', name: 'Balance', color: '#1f2937' }
      ];

      return (
        <div className="p-3 md:p-6">
          <div style={{ minHeight: '400px', display: 'flex', alignItems: 'center' }}>
            <RechartsResponsiveContainer width="100%" height={400}>
              <LineChart
                data={data.viewMode === 'month' ? data.yearOverviewData || [] : data.multiYearBudgetData || []}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey={data.viewMode === 'month' ? "month" : "year"}
                tick={{ fontSize: 10, fill: "#666" }}
                stroke="#ccc"
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#666" }}
                stroke="#ccc"
                axisLine={false}
                tickLine={false}
                width={50}
              />
              <Tooltip
                contentStyle={{ backgroundColor: 'white', border: '1px solid #ccc', borderRadius: '8px', fontSize: '12px', padding: '8px' }}
                formatter={(value: any) => [formatCurrency(Number(value)), '']}
              />
              {(chartDataVisibility?.income ?? true) && <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981", r: 4 }} name="Income" />}
              {(chartDataVisibility?.expenses ?? true) && <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={{ fill: "#ef4444", r: 4 }} name="Expenses" />}
              {(chartDataVisibility?.savings ?? true) && <Line type="monotone" dataKey="savings" stroke="#f59e0b" strokeWidth={2} dot={{ fill: "#f59e0b", r: 4 }} name="Savings" />}
              {(chartDataVisibility?.balance ?? true) && <Line type="monotone" dataKey="balance" stroke="#1f2937" strokeWidth={2.5} dot={{ fill: "#1f2937", r: 4 }} name="Balance" connectNulls={false} />}
            </LineChart>
          </RechartsResponsiveContainer>
          </div>

          <div className="mt-4 md:mt-8 flex flex-nowrap gap-3 md:gap-6 justify-center px-2">
            {dataSeries.map((series) => (
              <div key={series.key} className="flex flex-col items-center gap-1.5 md:gap-2">
                <Checkbox
                  id={`checkbox-${series.key}`}
                  checked={chartDataVisibility?.[series.key as keyof typeof chartDataVisibility] ?? true}
                  onCheckedChange={() => toggleDataSeries?.(series.key as keyof typeof chartDataVisibility)}
                  className="data-[state=checked]:border-0 w-6 h-6 md:w-5 md:h-5"
                  style={{
                    backgroundColor: (chartDataVisibility?.[series.key as keyof typeof chartDataVisibility] ?? true) ? series.color : 'transparent',
                    borderColor: series.color
                  }}
                />
                <label htmlFor={`checkbox-${series.key}`} className="cursor-pointer text-[10px] md:text-sm font-medium text-center leading-tight">{series.name}</label>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'top-categories': {
      const displayData = data.categoryViewMode === "head-categories" ? data.headCategoryArray : data.categoryData;

      return (
        <div className="p-4 md:p-6">
          {/* Hero switcher and header in one row */}
          <div className="flex items-center justify-between mb-4 md:mb-6">
            {/* Switcher on the left */}
            <div className="relative">
              <button
                onClick={() => data.setModalCategoryDropdownOpen(!data.modalCategoryDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm md:text-base font-medium text-gray-900">
                  {data.categoryViewMode === "categories" ? "Categories" : "Head Categories"}
                </span>
                <ChevronDown size={16} className="text-gray-600" />
              </button>

              {data.modalCategoryDropdownOpen && (
                <div
                  className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-200 z-50 min-w-[180px]"
                  style={{ boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' }}
                >
                  <button
                    onClick={() => {
                      data.setCategoryViewMode("categories");
                      data.setModalCategoryDropdownOpen(false);
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center justify-between rounded-t-xl"
                  >
                    <span className="text-sm font-medium text-gray-900">Categories</span>
                    {data.categoryViewMode === "categories" && <Check size={16} className="text-gray-900" />}
                  </button>
                  <button
                    onClick={() => {
                      data.setCategoryViewMode("head-categories");
                      data.setModalCategoryDropdownOpen(false);
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center justify-between rounded-b-xl"
                  >
                    <span className="text-sm font-medium text-gray-900">Head Categories</span>
                    {data.categoryViewMode === "head-categories" && <Check size={16} className="text-gray-900" />}
                  </button>
                </div>
              )}
            </div>

            {/* Total count on the right */}
            <span className="text-xs text-gray-500">
              {displayData.length} {displayData.length === 1 ? 'item' : 'items'}
            </span>
          </div>

          {/* Chart-first layout: Chart left (60%), List right (40%) on desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr,1fr] gap-6 md:gap-8">
            {/* Pie Chart - Hero Element */}
            <div className="flex flex-col items-center justify-center min-h-[320px] lg:min-h-[450px]">
              <RechartsResponsiveContainer width="100%" height={320} className="lg:!h-[450px]">
                <PieChart>
                  <Pie
                    data={displayData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={false}
                    outerRadius="90%"
                    fill="#8884d8"
                    dataKey="amount"
                  >
                    {displayData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={data.COLORS[index % data.COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div
                            style={{
                              backgroundColor: 'white',
                              border: '1px solid #e5e7eb',
                              borderRadius: '8px',
                              padding: '8px 12px',
                              fontSize: '13px',
                            }}
                          >
                            <p style={{ margin: 0, fontWeight: 500 }}>
                              {data.emoji || '💰'} {data.name}: {formatCurrency(Number(data.amount))}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </RechartsResponsiveContainer>

              {/* Legend below chart */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 w-full max-w-md">
                {displayData.slice(0, 8).map((category: any, index: number) => (
                  <div key={category.name} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: data.COLORS[index % data.COLORS.length] }}
                    />
                    <span className="text-xs text-gray-700 truncate">{category.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Category List - All categories with scroll */}
            <div className="flex flex-col max-h-[450px] overflow-y-auto pr-2">
              <div className="space-y-2.5">
                {displayData.map((category: any, index: number) => (
                  <div key={category.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <span className="text-xl flex-shrink-0">{category.emoji || '💰'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 text-sm truncate">{category.name}</div>
                        <div className="text-xs text-gray-500">
                          {((category.amount / data.totalExpenses) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-gray-900 flex-shrink-0 ml-3">{formatCurrency(category.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    default:
      return <div className="p-6"><p className="text-lg text-gray-600">Expanded view for {getExpandedPanelTitle(panelId)}</p></div>;
  }
}

export default function OverviewRedesignedPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"month" | "year">("month");
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null);
  const [healthPanelMode, setHealthPanelMode] = useState<"savings" | "budget">("savings");
  const [categoryViewMode, setCategoryViewMode] = useState<"categories" | "head-categories">("categories");
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [modalCategoryDropdownOpen, setModalCategoryDropdownOpen] = useState(false);

  const [chartDataVisibility, setChartDataVisibility] = useState({
    income: true,
    expenses: true,
    savings: true,
    balance: true
  });

  const [panel2ChartVisibility, setPanel2ChartVisibility] = useState({
    currentMonth: true,
    average: true,
    yearIncome: true,
    yearExpenses: true
  });

  const toggleDataSeries = (series: keyof typeof chartDataVisibility) => {
    setChartDataVisibility(prev => ({ ...prev, [series]: !prev[series] }));
  };

  const togglePanel2DataSeries = (series: keyof typeof panel2ChartVisibility) => {
    setPanel2ChartVisibility(prev => ({ ...prev, [series]: !prev[series] }));
  };

  const dateRange = viewMode === "month"
    ? { start: startOfMonth(selectedDate), end: endOfMonth(selectedDate) }
    : { start: new Date(selectedDate.getFullYear(), 0, 1), end: new Date(selectedDate.getFullYear(), 11, 31) };

  const { data: transactions = [] } = useQuery({
    queryKey: ["/api/transactions", dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: async () => {
      const response = await fetch(`/api/transactions?startDate=${dateRange.start.toISOString()}&endDate=${dateRange.end.toISOString()}`);
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: categories = [] } = useQuery<any[]>({ queryKey: ["/api/categories"] });
  const { data: wallets = [] } = useQuery<any[]>({ queryKey: ["/api/wallets"] });
  const { data: allTransactions = [] } = useQuery<any[]>({
    queryKey: ["/api/transactions"],
    staleTime: 60000, // 1 min staleTime for the full dataset to reduce refetches
  });
  const { formatCurrency } = useCurrency();

  // Build category lookup Map for O(1) access instead of .find() in loops
  const categoryMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const c of categories) {
      map.set(c.id, c);
    }
    return map;
  }, [categories]);

  // Ensure transactions is an array before filtering
  const transactionsArray = useMemo(() => Array.isArray(transactions) ? transactions : [], [transactions]);

  const { totalIncome, totalExpenses } = useMemo(() => {
    let income = 0;
    let expenses = 0;
    for (const t of transactionsArray) {
      if (t.excludeFromBudget) continue;
      const amount = parseFloat(t.amount);
      if (t.type === "income") income += amount;
      else if (t.type === "expense") expenses += amount;
    }
    return { totalIncome: income, totalExpenses: expenses };
  }, [transactionsArray]);

  const balance = useMemo(
    () => (wallets as any[]).reduce((sum: number, wallet: any) => sum + parseFloat(wallet.balance || "0"), 0),
    [wallets]
  );
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

  const categorySpending = useMemo(() => {
    const acc: Record<string, { name: string; emoji: string; amount: number }> = {};
    for (const t of transactionsArray) {
      if (t.type !== "expense" || t.excludeFromBudget) continue;
      const category = categoryMap.get(t.categoryId);
      const categoryId = category?.id || "other";

      if (!acc[categoryId]) {
        acc[categoryId] = {
          name: category?.name || "Other",
          emoji: category?.emoji || "💰",
          amount: 0
        };
      }
      acc[categoryId].amount += parseFloat(t.amount);
    }
    return acc;
  }, [transactionsArray, categoryMap]);

  const COLORS = ["#3B82F6", "#10B981", "#EF4444", "#F97316", "#8B5CF6", "#06B6D4", "#EC4899", "#EAB308", "#6366F1"];

  const categoryData = useMemo(() =>
    Object.values(categorySpending)
      .map((cat: any, index: number) => ({
        name: cat.name,
        amount: Number(cat.amount),
        emoji: cat.emoji,
        fill: COLORS[index % COLORS.length]
      }))
      .sort((a: any, b: any) => b.amount - a.amount),
    [categorySpending]
  );

  // Group categories by head category (section)
  const headCategoryArray = useMemo(() => {
    const acc: Record<string, { name: string; amount: number; emoji: string; categories: string[] }> = {};
    for (const t of transactionsArray) {
      if (t.type !== "expense" || t.excludeFromBudget) continue;
      const category = categoryMap.get(t.categoryId);
      const categoryName = category?.name || "Other";
      const section = category?.section || getDefaultSection(categoryName);

      if (!acc[section]) {
        acc[section] = {
          name: section,
          amount: 0,
          emoji: getSectionEmojiFromStorage(section, "expense"),
          categories: []
        };
      }

      acc[section].amount += parseFloat(t.amount);
      if (!acc[section].categories.includes(categoryName)) {
        acc[section].categories.push(categoryName);
      }
    }

    return Object.values(acc)
      .map((section, index) => ({
        name: section.name,
        amount: Number(section.amount),
        emoji: section.emoji,
        fill: COLORS[index % COLORS.length]
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [transactionsArray, categoryMap]);

  const displayCategoryData = categoryViewMode === "head-categories" ? headCategoryArray : categoryData;

  const currentMonthProgression = useMemo(
    () => viewMode === "month" ? calculateCurrentMonthProgression(allTransactions, selectedDate) : null,
    [allTransactions, selectedDate, viewMode]
  );
  const yearsProgressData = useMemo(
    () => viewMode === "year" ? calculateYearsProgress(allTransactions, selectedDate.getFullYear(), balance) : null,
    [allTransactions, selectedDate, viewMode, balance]
  );
  const yearOverviewData = useMemo(
    () => viewMode === "month" ? calculateYearOverview(allTransactions, selectedDate, balance) : null,
    [allTransactions, selectedDate, viewMode, balance]
  );
  // Reuse yearsProgressData instead of calling calculateYearsProgress twice
  const multiYearBudgetData = yearsProgressData;

  const handlePreviousMonth = useCallback(() => setSelectedDate(viewMode === "month" ? subMonths(selectedDate, 1) : new Date(selectedDate.getFullYear() - 1, 0, 1)), [viewMode, selectedDate]);
  const handleNextMonth = useCallback(() => setSelectedDate(viewMode === "month" ? addMonths(selectedDate, 1) : new Date(selectedDate.getFullYear() + 1, 0, 1)), [viewMode, selectedDate]);
  const handleToday = useCallback(() => setSelectedDate(new Date()), []);

  const isCurrentPeriod = viewMode === "month"
    ? format(selectedDate, "yyyy-MM") === format(new Date(), "yyyy-MM")
    : selectedDate.getFullYear() === new Date().getFullYear();

  return (
    <>
      <div className="flex-1 overflow-auto pb-20 md:pb-0" style={{ backgroundColor: '#F3F4F6' }}>
        <ResponsiveContainer className="py-8">

          {/* Calendar Switcher */}
          <div className="flex flex-col items-center mb-4 gap-2">
            {/* Month/Year Navigation and Current Month Button */}
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-0 w-full sm:justify-between">
              {/* Spacer for desktop to center the month switcher */}
              <div className="hidden sm:block sm:w-[150px]"></div>

              {/* Month/Year Navigation - centered */}
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
                  onClick={(e) => {
                    // Toggle on mobile and tablet (screen width < 1024px)
                    if (window.innerWidth < 1024) {
                      setViewMode(viewMode === "month" ? "year" : "month");
                    }
                  }}
                  className="lg:cursor-default cursor-pointer"
                  style={{
                    fontFamily: 'Inter',
                    fontSize: '20px',
                    fontWeight: 500,
                    minWidth: '200px',
                    textAlign: 'center'
                  }}
                >
                  {viewMode === "month" ? format(selectedDate, "MMMM yyyy") : format(selectedDate, "yyyy")}
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

              {/* Right side: Current Period Button (tablet/desktop) + View Mode Selector (desktop only) */}
              <div className="hidden sm:flex sm:w-[150px] sm:justify-end items-center gap-2 sm:min-h-[48px]">
                {/* Current Period Button - Tablet/Desktop: on the right */}
                {!isCurrentPeriod && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToday}
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
                    {viewMode === "month" ? "Current Month" : "Current Year"}
                  </Button>
                )}
                {/* View Mode Toggle - shown only on desktop (≥1024px) */}
                <div className="hidden lg:block">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewMode(viewMode === "month" ? "year" : "month")}
                    style={{
                      width: '140px',
                      height: '48px',
                      minHeight: '48px',
                      fontFamily: 'Inter',
                      fontSize: '14px',
                      fontWeight: 500,
                      borderRadius: '30px'
                    }}
                  >
                    {viewMode === "month" ? "Month" : "Year"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Panel */}
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
                  {formatCurrency(totalIncome - totalExpenses)}
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
                <Wallet className="w-[16px] h-[16px] sm:w-[20px] sm:h-[20px]" style={{ color: '#000' }} />
                <p className="text-[13px] sm:text-[15px]" style={{ fontFamily: 'Inter', fontWeight: 400, color: '#000' }}>Balance</p>
              </div>
              <p className="text-[20px] sm:text-[24px]" style={{ fontFamily: 'Inter', fontWeight: 700, color: '#000' }}>
                {formatCurrency(balance)}
              </p>
            </div>
          </div>

          {/* 4 Panels Grid */}
          <style>{`
            /* Mobile: 1:1 aspect ratio for panels */
            @media (max-width: 767px) {
              .overview-panel {
                aspect-ratio: 1 / 1 !important;
              }
            }
          `}</style>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[11px]">

            {/* Panel 1: Year Financial Overview */}
            <div className="bg-white overflow-hidden overview-panel" style={{ aspectRatio: '525 / 310.5', borderRadius: '20px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '15px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontFamily: 'Inter', fontSize: '24px', fontWeight: 500, color: '#000' }}>
                  Year
                </h2>
                <button
                  onClick={() => setExpandedPanel('year-budget')}
                  style={{
                    width: '48px',
                    height: '48px',
                    minWidth: '48px',
                    minHeight: '48px',
                    backgroundColor: '#fff',
                    border: '1px solid #F3F4F6',
                    borderRadius: '30px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                  className="hover:bg-gray-50"
                >
                  <Expand size={18} style={{ color: '#000' }} />
                </button>
              </div>
              <div style={{ flex: 1, padding: '10px 20px', overflowY: 'auto', display: 'flex', alignItems: 'center' }}>
                <RechartsResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={viewMode === "month" ? yearOverviewData || [] : multiYearBudgetData || []}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey={viewMode === "month" ? "month" : "year"}
                      tick={{ fontSize: 11, fill: "#666" }}
                      stroke="#ccc"
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#666" }}
                      stroke="#ccc"
                      axisLine={false}
                      tickLine={false}
                      width={35}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #ccc',
                        borderRadius: '8px',
                        fontSize: '12px',
                        padding: '10px'
                      }}
                      formatter={(value: any) => [formatCurrency(Number(value)), '']}
                    />
                    {chartDataVisibility.income && <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2.5} dot={{ fill: "#10b981", r: 4 }} name="Income" />}
                    {chartDataVisibility.expenses && <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2.5} dot={{ fill: "#ef4444", r: 4 }} name="Expenses" />}
                    {chartDataVisibility.savings && <Line type="monotone" dataKey="savings" stroke="#f59e0b" strokeWidth={2.5} dot={{ fill: "#f59e0b", r: 4 }} name="Savings" />}
                    {chartDataVisibility.balance && <Line type="monotone" dataKey="balance" stroke="#1f2937" strokeWidth={3} dot={{ fill: "#1f2937", r: 5 }} name="Balance" connectNulls={false} />}
                  </LineChart>
                </RechartsResponsiveContainer>
              </div>
            </div>

            {/* Panel 2: Monthly Spending Progress */}
            <div className="bg-white overflow-hidden overview-panel" style={{ aspectRatio: '525 / 310.5', borderRadius: '20px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '15px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontFamily: 'Inter', fontSize: '24px', fontWeight: 500, color: '#000' }}>
                  {viewMode === "month" ? "Month" : "Year-over-Year Progress"}
                </h2>
                <button
                  onClick={() => setExpandedPanel('monthly-progress')}
                  style={{
                    width: '48px',
                    height: '48px',
                    minWidth: '48px',
                    minHeight: '48px',
                    backgroundColor: '#fff',
                    border: '1px solid #F3F4F6',
                    borderRadius: '30px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                  className="hover:bg-gray-50"
                >
                  <Expand size={18} style={{ color: '#000' }} />
                </button>
              </div>
              <div style={{ flex: 1, padding: '10px 20px', overflowY: 'auto', display: 'flex', alignItems: 'center' }}>
                <RechartsResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={viewMode === "month" ? currentMonthProgression?.chartData : yearsProgressData || []}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey={viewMode === "month" ? "day" : "year"}
                      tick={{ fontSize: 11, fill: "#666" }}
                      stroke="#ccc"
                      type={viewMode === "month" ? "number" : "category"}
                      domain={viewMode === "month" ? [1, 31] : undefined}
                      ticks={viewMode === "month" ? [1, 5, 10, 15, 20, 25, 30] : undefined}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "#666" }} stroke="#ccc" axisLine={false} tickLine={false} width={35} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'white', border: '1px solid #ccc', borderRadius: '6px', fontSize: '12px', padding: '10px' }}
                      labelFormatter={(value: any) => {
                        if (viewMode === "month") {
                          const day = Number(value);
                          const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
                          return `${day}${suffix}`;
                        }
                        return value;
                      }}
                      formatter={(value: any, name: string) => {
                        const label = name === 'currentMonth' ? 'Current Month' : name === 'average' ? 'Average' : name;
                        return [formatCurrency(Number(value)), label];
                      }}
                    />
                    {viewMode === "month" ? (
                      <>
                        {panel2ChartVisibility.currentMonth && <Line
                          type="monotone"
                          dataKey="currentMonth"
                          stroke="#ED4040"
                          strokeWidth={2.5}
                          dot={(props: any) => {
                            // Show dot only at today's position for current month
                            if (currentMonthProgression?.isCurrentMonth && props.payload.day === currentMonthProgression?.todayDay) {
                              return <circle cx={props.cx} cy={props.cy} r={4} fill="#ED4040" />;
                            }
                            return null;
                          }}
                          name="currentMonth"
                          connectNulls={false}
                        />}
                        {panel2ChartVisibility.average && <Line type="monotone" dataKey="average" stroke="#9ca3af" strokeWidth={2} strokeDasharray="5 5" dot={false} name="average" connectNulls={true} />}
                      </>
                    ) : (
                      <>
                        {panel2ChartVisibility.yearIncome && <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2.5} dot={{ fill: "#10b981", r: 4 }} name="Income" />}
                        {panel2ChartVisibility.yearExpenses && <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2.5} dot={{ fill: "#ef4444", r: 4 }} name="Expenses" />}
                      </>
                    )}
                  </LineChart>
                </RechartsResponsiveContainer>
              </div>
            </div>

            {/* Panel 3: Categories */}
            <div className="bg-white overflow-hidden overview-panel" style={{ aspectRatio: '525 / 310.5', borderRadius: '20px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '15px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="relative">
                  <button
                    onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                    className="flex items-center gap-2 hover:opacity-70 transition-opacity"
                  >
                    <h2 style={{ fontFamily: 'Inter', fontSize: '24px', fontWeight: 500, color: '#000' }}>
                      {categoryViewMode === "categories" ? "Categories" : "Head Categories"}
                    </h2>
                    <ChevronDown size={18} style={{ color: '#000' }} />
                  </button>

                  {/* Dropdown Menu */}
                  {categoryDropdownOpen && (
                    <div
                      className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-200 z-50 min-w-[200px]"
                      style={{ boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' }}
                    >
                      <button
                        onClick={() => {
                          setCategoryViewMode("categories");
                          setCategoryDropdownOpen(false);
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center justify-between rounded-t-xl"
                      >
                        <span className="text-sm font-medium text-gray-900">Categories</span>
                        {categoryViewMode === "categories" && <Check size={16} className="text-gray-900" />}
                      </button>
                      <button
                        onClick={() => {
                          setCategoryViewMode("head-categories");
                          setCategoryDropdownOpen(false);
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center justify-between rounded-b-xl"
                      >
                        <span className="text-sm font-medium text-gray-900">Head Categories</span>
                        {categoryViewMode === "head-categories" && <Check size={16} className="text-gray-900" />}
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setExpandedPanel('top-categories')}
                  style={{
                    width: '48px',
                    height: '48px',
                    minWidth: '48px',
                    minHeight: '48px',
                    backgroundColor: '#fff',
                    border: '1px solid #F3F4F6',
                    borderRadius: '30px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                  className="hover:bg-gray-50"
                >
                  <Expand size={18} style={{ color: '#000' }} />
                </button>
              </div>
              <div style={{ flex: 1, padding: '15px 20px', overflowY: 'auto' }}>
                {/* Single column list - similar to mobile */}
                <div className="space-y-2">
                  {displayCategoryData.slice(0, 5).map((category) => (
                    <div key={category.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="text-2xl flex-shrink-0">{category.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-900">{category.name}</div>
                          <div className="text-xs text-gray-600">
                            {((category.amount / totalExpenses) * 100).toFixed(1)}% of expenses
                          </div>
                        </div>
                      </div>
                      <span className="text-base font-bold text-gray-900 flex-shrink-0 ml-2">{formatCurrency(category.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Panel 4: Multi-function (Savings/Budget/Actions) */}
            <div className="bg-white overflow-hidden overview-panel" style={{ aspectRatio: '525 / 310.5', borderRadius: '20px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '15px 20px', borderBottom: '1px solid #F3F4F6' }}>
                <div className="flex items-center justify-between">
                  <h2 style={{ fontFamily: 'Inter', fontSize: '24px', fontWeight: 500, color: '#000' }}>
                    Financial Health
                  </h2>

                  {/* View Mode Toggle */}
                  <div className="flex">
                    <button
                      onClick={() => setHealthPanelMode('savings')}
                      style={{
                        minWidth: '95px',
                        height: '48px',
                        minHeight: '48px',
                        backgroundColor: healthPanelMode === 'savings' ? '#F3F4F6' : '#fff',
                        border: '1px solid #F3F4F6',
                        borderRadius: '30px 0 0 30px',
                        fontFamily: 'Inter',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#000',
                        padding: '0 16px'
                      }}
                      className="hover:bg-gray-50"
                    >
                      Savings
                    </button>
                    <button
                      onClick={() => setHealthPanelMode('budget')}
                      style={{
                        minWidth: '95px',
                        height: '48px',
                        minHeight: '48px',
                        backgroundColor: healthPanelMode === 'budget' ? '#F3F4F6' : '#fff',
                        border: '1px solid #F3F4F6',
                        borderRadius: '0 30px 30px 0',
                        fontFamily: 'Inter',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#000',
                        padding: '0 16px'
                      }}
                      className="hover:bg-gray-50"
                    >
                      Budget
                    </button>
                  </div>
                </div>
              </div>
              <div style={{ flex: 1, padding: '15px 20px', overflowY: 'auto' }}>

                {/* Savings View */}
                {healthPanelMode === 'savings' && (
                  <div className="space-y-2">
                    <div className="p-2.5 bg-gray-50 rounded-xl">
                      <div className="text-xs text-gray-600 mb-1">Monthly Savings Rate</div>
                      <div className="text-lg font-bold text-gray-900">{savingsRate.toFixed(1)}%</div>
                    </div>
                    <div className="p-2.5 bg-gray-50 rounded-xl">
                      <div className="text-xs text-gray-600 mb-1">Total Saved This {viewMode === 'month' ? 'Month' : 'Year'}</div>
                      <div className="text-lg font-bold text-gray-900">{formatCurrency(totalIncome - totalExpenses)}</div>
                    </div>
                    <div className="p-2.5 bg-gray-50 rounded-xl">
                      <div className="text-xs text-gray-600 mb-1">Total Balance</div>
                      <div className="text-lg font-bold text-gray-900">{formatCurrency(balance)}</div>
                    </div>
                  </div>
                )}

                {/* Budget Health View */}
                {healthPanelMode === 'budget' && (
                  <div className="space-y-3">
                    <div className="p-3 bg-gray-50 rounded-xl">
                      <div className="text-sm text-gray-600 mb-2">Budget Status</div>
                      <div className="text-lg font-bold text-gray-900">
                        {totalExpenses < totalIncome ? '✓ On Track' : '⚠ Over Budget'}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {totalExpenses < totalIncome
                          ? `${formatCurrency(totalIncome - totalExpenses)} under budget`
                          : `${formatCurrency(totalExpenses - totalIncome)} over budget`}
                      </div>
                    </div>

                    <div className="p-3 bg-gray-50 rounded-xl">
                      <div className="text-sm text-gray-600 mb-2">Top Category</div>
                      <div className="text-lg font-bold text-gray-900">
                        {categoryData[0]?.name || 'N/A'}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {categoryData[0] ? formatCurrency(categoryData[0].amount) : '-'}
                      </div>
                    </div>
                  </div>
                )}


              </div>
            </div>

          </div>

        </ResponsiveContainer>
      </div>

      {/* Expandable Panel Dialog */}
      <Dialog open={expandedPanel !== null} onOpenChange={() => setExpandedPanel(null)}>
        <DialogContent className="max-w-[95vw] md:max-w-[85vw] lg:max-w-[1100px] max-h-[95vh] overflow-y-auto [&>button]:w-10 [&>button]:h-10 [&>button]:md:w-8 [&>button]:md:h-8" style={{ borderRadius: '20px' }} aria-describedby="dialog-description">
          <DialogHeader>
            <DialogTitle className="text-xl md:text-2xl">{getExpandedPanelTitle(expandedPanel)}</DialogTitle>
            <DialogDescription id="dialog-description" className="hidden">
              Detailed view with expanded charts and comprehensive insights.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {expandedPanel && renderExpandedPanel(expandedPanel, {
              currentMonthProgression,
              yearOverviewData,
              yearsProgressData,
              multiYearBudgetData,
              viewMode,
              categoryData,
              headCategoryArray,
              categoryViewMode,
              setCategoryViewMode,
              modalCategoryDropdownOpen,
              setModalCategoryDropdownOpen,
              totalIncome,
              totalExpenses,
              COLORS,
              chartDataVisibility,
              toggleDataSeries,
              panel2ChartVisibility,
              togglePanel2DataSeries
            }, formatCurrency)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
