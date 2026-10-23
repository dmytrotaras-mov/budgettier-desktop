import { useSelectedMonth } from "@/hooks/useSelectedMonth";
import { useState, useMemo, useCallback } from "react";
import { POSITIVE, NEGATIVE, INK, withAlpha } from "@/lib/colors";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer as RechartsResponsiveContainer } from "recharts";
import { Checkbox } from "@/components/ui/checkbox";
import { TrendingUp, TrendingDown, Wallet, ChevronLeft, ChevronRight, Expand, PiggyBank, ChevronDown, Check } from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { useCurrency } from "@/hooks/useCurrency";
import ResponsiveContainer from "@/components/layout/responsive-container";
import { useSections, sectionEmoji, sectionColor, categoryShade, resolveCategorySection } from "@/lib/sectionUtils";
import { CategoryBreakdown, BreakdownTabs, PillTabs, colorOf, type BreakdownMode } from "@/components/overview/category-breakdown";
import { OverviewCard, LegendChips, compactMoney } from "@/components/overview/overview-card";
import { InsightsCard } from "@/components/overview/insights-card";
import { WalletsCard } from "@/components/overview/wallets-card";
import { StatsBar } from "@/components/overview/stats-bar";
import { CashFlowChart, CASH_FLOW_SERIES, type CashFlowMode } from "@/components/overview/cash-flow-chart";
import { SpendingPaceChart } from "@/components/overview/spending-pace-chart";
import { EntityIcon } from "@/components/ui/entity-icon";
import { invoke } from "@tauri-apps/api/core";
import {
  calculateYearOverview,
  calculateYearsProgress,
  calculateCurrentMonthProgression,
  getExpandedPanelTitle,
} from "@/lib/overviewCalculations";


function renderExpandedPanel(panelId: string, data: any, formatCurrency: (amount: number) => string): JSX.Element {
  const { chartDataVisibility, toggleDataSeries } = data || {};

  switch (panelId) {
    case 'monthly-progress': {
      const panel2DataSeries = [
        { key: 'currentMonth', name: 'Current Month', color: NEGATIVE },
        { key: 'average', name: 'Average', color: '#9ca3af' },
        { key: 'yearIncome', name: 'Income', color: POSITIVE },
        { key: 'yearExpenses', name: 'Expenses', color: NEGATIVE }
      ];

      if (data.viewMode === 'month') {
        return (
          <div className="p-3 md:p-6">
            <SpendingPaceChart
              data={data.currentMonthProgression?.chartData ?? []}
              monthLabel={data.monthLabel}
              todayDay={data.currentMonthProgression?.todayDay ?? null}
              budgetTotal={data.budgetTotal}
              visible={data.panel2ChartVisibility}
              formatCurrency={formatCurrency}
              axisMoney={data.axisMoney}
              height={440}
            />
          </div>
        );
      }

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
                width={56}
                tickFormatter={data.axisMoney}
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
                    stroke={NEGATIVE}
                    strokeWidth={2}
                    dot={(props: any) => {
                      // Show dot only at today's position for current month
                      if (data.currentMonthProgression?.isCurrentMonth && props.payload.day === data.currentMonthProgression?.todayDay) {
                        return <circle key={`dot-${props.index}`} cx={props.cx} cy={props.cy} r={4} fill={NEGATIVE} />;
                      }
                      return <circle key={`dot-${props.index}`} cx={props.cx} cy={props.cy} r={0} fill="transparent" />;
                    }}
                    name="Current Month"
                    connectNulls={false}
                  />}
                  {(data.panel2ChartVisibility?.average ?? true) && <Line type="monotone" dataKey="average" stroke="#9ca3af" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Average" connectNulls={true} />}
                </>
              ) : (
                <>
                  {(data.panel2ChartVisibility?.yearIncome ?? true) && <Line type="monotone" dataKey="income" stroke={POSITIVE} strokeWidth={2} dot={{ fill: POSITIVE, r: 4 }} name="Income" />}
                  {(data.panel2ChartVisibility?.yearExpenses ?? true) && <Line type="monotone" dataKey="expenses" stroke={NEGATIVE} strokeWidth={2} dot={{ fill: NEGATIVE, r: 4 }} name="Expenses" />}
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
      return (
        <div className="p-3 md:p-6">
          <LegendChips
            items={CASH_FLOW_SERIES.map((s) => ({ ...s, active: chartDataVisibility?.[s.key] ?? true }))}
            onToggle={(k) => toggleDataSeries?.(k)}
          />
          <div className="mt-3">
            <CashFlowChart
              data={(data.viewMode === "month" ? data.yearOverviewData : data.multiYearBudgetData) || []}
              xKey={data.viewMode === "month" ? "month" : "year"}
              selected={data.cashFlowSelected}
              inProgress={data.cashFlowInProgress}
              visible={chartDataVisibility}
              mode={data.cashFlowMode}
              formatCurrency={formatCurrency}
              axisMoney={data.axisMoney}
              height={420}
            />
          </div>
        </div>
      );
    }

    case 'top-categories': {
      const displayData = data.categoryViewMode === "groups" ? data.headCategoryArray : data.categoryData;

      return (
        <div className="p-4 md:p-6">
          <div className="mb-3">
            <BreakdownTabs mode={data.categoryViewMode} onChange={data.setCategoryViewMode} />
          </div>

          <CategoryBreakdown
            items={displayData}
            formatCurrency={formatCurrency}
            flowLabel={data.categoryFlowMode === "income" ? "income" : "expenses"}
          />
        </div>
      );
    }

    default:
      return <div className="p-6"><p className="text-lg text-gray-600">Expanded view for {getExpandedPanelTitle(panelId)}</p></div>;
  }
}

export default function OverviewRedesignedPage() {
  const [selectedDate, setSelectedDate] = useSelectedMonth();
  const [viewMode, setViewMode] = useState<"month" | "year">("month");
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null);
  const [categoryViewMode, setCategoryViewModeState] = useState<BreakdownMode>(() => {
    try {
      return localStorage.getItem("overviewCategoryView") === "categories" ? "categories" : "groups";
    } catch {
      return "groups";
    }
  });
  const setCategoryViewMode = (mode: BreakdownMode) => {
    setCategoryViewModeState(mode);
    try {
      localStorage.setItem("overviewCategoryView", mode);
    } catch {
      // Remembering the view is a convenience; ignore storage errors.
    }
  };
  const [categoryFlowMode, setCategoryFlowMode] = useState<"expense" | "income">("expense");
  const [cashFlowMode, setCashFlowModeState] = useState<CashFlowMode>(() => {
    try {
      return localStorage.getItem("cashFlowMode") === "lines" ? "lines" : "bars";
    } catch {
      return "bars";
    }
  });
  const setCashFlowMode = (mode: CashFlowMode) => {
    setCashFlowModeState(mode);
    try {
      localStorage.setItem("cashFlowMode", mode);
    } catch {
      // Remembering the view is a convenience; ignore storage errors.
    }
  };

  const [chartDataVisibility, setChartDataVisibility] = useState({
    income: true,
    expenses: true,
    savings: false,
    balance: true
  });

  const [panel2ChartVisibility, setPanel2ChartVisibility] = useState({
    currentMonth: true,
    average: true,
    range: true,
    forecast: true,
    budget: true,
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

  // Default query function routes this to the local database (date range).
  // A raw fetch() here never reached the database in the desktop app.
  const { data: transactions = [] } = useQuery<any[]>({
    queryKey: ["/api/transactions", dateRange.start.toISOString(), dateRange.end.toISOString()],
  });

  const { data: categories = [] } = useQuery<any[]>({ queryKey: ["/api/categories"] });
  const { data: allSections = [] } = useSections();
  const { data: wallets = [] } = useQuery<any[]>({ queryKey: ["/api/wallets"] });
  const { data: allTransactions = [] } = useQuery<any[]>({
    queryKey: ["/api/transactions"],
    staleTime: 60000, // 1 min staleTime for the full dataset to reduce refetches
  });
  const { formatCurrency, currencySymbol } = useCurrency();

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
      if (t.type !== categoryFlowMode || t.excludeFromBudget) continue;
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
  }, [transactionsArray, categoryMap, categoryFlowMode]);

  const categoryData = useMemo(() =>
    Object.values(categorySpending)
      .map((cat: any) => ({
        name: cat.name,
        amount: Number(cat.amount),
        emoji: cat.emoji
      }))
      .sort((a: any, b: any) => b.amount - a.amount),
    [categorySpending]
  );

  // Group categories by head category (section), keeping each group's
  // categories so the breakdown can open a group.
  const headCategoryArray = useMemo(() => {
    const acc: Record<string, { name: string; amount: number; emoji: string; children: Record<string, { name: string; emoji: string; amount: number }> }> = {};
    for (const t of transactionsArray) {
      if (t.type !== categoryFlowMode || t.excludeFromBudget) continue;
      const category = categoryMap.get(t.categoryId);
      const categoryName = category?.name || "Other";
      // Same resolution Settings uses: DB section → manual assignment →
      // built-in membership → "Custom Categories".
      const section = resolveCategorySection(category);
      const amount = parseFloat(t.amount);

      const group = (acc[section] ??= {
        name: section,
        amount: 0,
        emoji: sectionEmoji(allSections, section, categoryFlowMode),
        children: {},
      });
      group.amount += amount;
      const child = (group.children[categoryName] ??= { name: categoryName, emoji: category?.emoji || "💰", amount: 0 });
      child.amount += amount;
    }

    return Object.values(acc)
      .map((section) => {
        const color = sectionColor(allSections, section.name, categoryFlowMode);
        const children = Object.values(section.children).sort((a, b) => b.amount - a.amount);
        return {
          name: section.name,
          amount: Number(section.amount),
          emoji: section.emoji,
          color,
          // Categories wear shades of their group's color, darkest = biggest.
          children: children.map((c, i) => ({ ...c, color: categoryShade(color, i, children.length) })),
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [transactionsArray, categoryMap, categoryFlowMode, allSections]);

  // Flat category list colored like the groups view: each category keeps its shade.
  const categoryColors = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of headCategoryArray) for (const c of g.children) m.set(c.name, c.color);
    return m;
  }, [headCategoryArray]);

  const coloredCategoryData = useMemo(
    () => categoryData.map((c: any) => ({ ...c, color: categoryColors.get(c.name) })),
    [categoryData, categoryColors],
  );
  const displayCategoryData = categoryViewMode === "groups" ? headCategoryArray : coloredCategoryData;

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

  // Year view steps whole years but keeps the month, so Budget still opens on it.
  const handlePreviousMonth = useCallback(() => setSelectedDate(viewMode === "month" ? subMonths(selectedDate, 1) : subMonths(selectedDate, 12)), [viewMode, selectedDate, setSelectedDate]);
  const handleNextMonth = useCallback(() => setSelectedDate(viewMode === "month" ? addMonths(selectedDate, 1) : addMonths(selectedDate, 12)), [viewMode, selectedDate, setSelectedDate]);
  const handleToday = useCallback(() => setSelectedDate(new Date()), [setSelectedDate]);

  const axisMoney = compactMoney(currencySymbol);

  // The selected month's budget, for the Insights card.
  const monthKey = format(selectedDate, "yyyy-MM");
  const { data: monthBudget } = useQuery<any>({
    queryKey: ["budget-month", monthKey],
    queryFn: () => invoke("get_month_budget", { month: monthKey }),
    enabled: viewMode === "month",
  });

  const budgetTotal: number | null =
    viewMode === "month" && monthBudget?.exists && monthBudget.allocations?.length
      ? monthBudget.allocations.reduce((sum: number, a: any) => sum + parseFloat(a.allocatedAmount || "0"), 0)
      : null;

  // One-line takeaway for the pace card: how far along vs a usual month.
  const roundMoney = (n: number) => formatCurrency(Math.round(n)).replace(/\.00$/, "");
  const paceSubtitle = (() => {
    if (viewMode === "year") return "Total income and spending for each year";
    const p = currentMonthProgression;
    if (!p) return "";
    const point = p.isCurrentMonth ? p.chartData[(p.todayDay ?? 1) - 1] : p.chartData[p.chartData.length - 1];
    const spent = point?.currentMonth ?? p.totalSpent;
    if (!p.hasEnoughAverageData || point?.average === undefined) {
      return `${roundMoney(spent)} spent ${p.isCurrentMonth ? "so far" : `in ${format(selectedDate, "MMMM")}`}`;
    }
    const when = p.isCurrentMonth ? `by day ${p.todayDay}` : `in ${format(selectedDate, "MMMM")}`;
    if (p.isCurrentMonth && p.projectedTotal != null) {
      const vsBudget = budgetTotal
        ? p.projectedTotal > budgetTotal
          ? ` · ${roundMoney(p.projectedTotal - budgetTotal)} over budget`
          : ` · within the ${roundMoney(budgetTotal)} budget`
        : "";
      return `${roundMoney(spent)} ${when} · heading for ${roundMoney(p.projectedTotal)}${vsBudget}`;
    }
    const diff = spent - point.average;
    return `${roundMoney(spent)} ${when} · ${roundMoney(Math.abs(diff))} ${diff > 0 ? "above" : "below"} a usual month`;
  })();

  const cashFlowSelected = viewMode === "month" ? format(selectedDate, "MMM") : String(selectedDate.getFullYear());
  const cashFlowInProgress =
    viewMode === "month"
      ? selectedDate.getFullYear() === new Date().getFullYear() ? format(new Date(), "MMM") : null
      : String(new Date().getFullYear());

  // Cash flow takeaway: how much was saved across the visible periods.
  const cashFlowSubtitle = (() => {
    // Completed periods only: an unfinished month (salary not in yet) would skew it.
    const xKey = viewMode === "month" ? "month" : "year";
    const rows: any[] = ((viewMode === "month" ? yearOverviewData : multiYearBudgetData) || []).filter(
      (r: any) => r.income !== null && r[xKey] !== cashFlowInProgress,
    );
    if (!rows.length) return "Income and spending per month · line: balance";
    const saved = rows.reduce((sum: number, r: any) => sum + (r.savings ?? 0), 0);
    const scope = rows.length === 1 ? `in ${rows[0][xKey]}` : `${rows[0][xKey]}–${rows[rows.length - 1][xKey]}`;
    return `${saved >= 0 ? "Saved" : "Overspent"} ${roundMoney(Math.abs(saved))} ${scope} · ${cashFlowMode === "bars" ? "bars" : "lines"}: income vs spending · black line: balance`;
  })();

  const isCurrentPeriod = viewMode === "month"
    ? format(selectedDate, "yyyy-MM") === format(new Date(), "yyyy-MM")
    : selectedDate.getFullYear() === new Date().getFullYear();

  return (
    <>
      <div className="flex-1 overflow-auto pb-20 md:pb-0" style={{ backgroundColor: '#F3F4F6' }}>
        <ResponsiveContainer className="py-8">

          {/* Period switcher: month/year navigation, back-to-today, Month | Year */}
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-0 w-full sm:justify-between mb-4">
            <div className="hidden sm:block sm:w-[190px]" />
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handlePreviousMonth} className="h-10 w-10 p-0 hover:bg-white" style={{ borderRadius: 30 }} aria-label="Previous">
                <ChevronLeft style={{ width: 26, height: 26 }} />
              </Button>
              <div style={{ fontFamily: "Inter", fontSize: 20, fontWeight: 500, minWidth: 200, textAlign: "center" }}>
                {viewMode === "month" ? format(selectedDate, "MMMM yyyy") : format(selectedDate, "yyyy")}
              </div>
              <Button variant="ghost" size="sm" onClick={handleNextMonth} className="h-10 w-10 p-0 hover:bg-white" style={{ borderRadius: 30 }} aria-label="Next">
                <ChevronRight style={{ width: 26, height: 26 }} />
              </Button>
            </div>
            <div className="flex sm:w-[190px] sm:justify-end items-center gap-2">
              {!isCurrentPeriod && (
                <button
                  type="button"
                  onClick={handleToday}
                  className="h-9 px-3.5 rounded-full text-[13px] font-medium text-gray-600 hover:bg-white hover:text-black transition-colors whitespace-nowrap"
                >
                  Today
                </button>
              )}
              <PillTabs
                tabs={[["month", "Month"], ["year", "Year"]]}
                value={viewMode}
                onChange={(v) => setViewMode(v)}
                size="sm"
              />
            </div>
          </div>

          <StatsBar
            selectedDate={selectedDate}
            viewMode={viewMode}
            transactions={transactionsArray}
            allTransactions={allTransactions}
            wallets={wallets}
          />

          {/* Cards */}
          <style>{`
            @media (max-width: 767px) {
              .overview-panel { aspect-ratio: 1 / 1 !important; }
            }
          `}</style>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[11px]">

            {/* 1. Cash flow by month (or by year) */}
            <OverviewCard
              title={viewMode === "month" ? `Cash flow ${selectedDate.getFullYear()}` : "Cash flow by year"}
              subtitle={cashFlowSubtitle}
              actions={
                <PillTabs
                  tabs={[["bars", "Bars"], ["lines", "Lines"]]}
                  value={cashFlowMode}
                  onChange={setCashFlowMode}
                  size="sm"
                />
              }
              onExpand={() => setExpandedPanel("year-budget")}
              className="md:col-span-2"
              style={{ height: 380 }}
            >
              <LegendChips
                items={CASH_FLOW_SERIES.map((s) => ({ ...s, active: chartDataVisibility[s.key as keyof typeof chartDataVisibility] }))}
                onToggle={(k) => toggleDataSeries(k as keyof typeof chartDataVisibility)}
              />
              <div className="flex-1 min-h-0 px-3 pb-2 pt-2">
                <CashFlowChart
                  data={(viewMode === "month" ? yearOverviewData : multiYearBudgetData) || []}
                  xKey={viewMode === "month" ? "month" : "year"}
                  selected={cashFlowSelected}
                  inProgress={cashFlowInProgress}
                  visible={chartDataVisibility}
                  mode={cashFlowMode}
                  formatCurrency={formatCurrency}
                  axisMoney={axisMoney}
                />
              </div>
            </OverviewCard>

            {/* 2. Spending pace this month (or year over year) */}
            <OverviewCard
              title={viewMode === "month" ? "Spending pace" : "Year over year"}
              subtitle={paceSubtitle}
              onExpand={() => setExpandedPanel("monthly-progress")}
              className="overview-panel"
              style={{ aspectRatio: "525 / 310.5" }}
            >
              <LegendChips
                items={
                  viewMode === "month"
                    ? [
                        { key: "currentMonth", label: format(selectedDate, "MMMM"), color: NEGATIVE, active: panel2ChartVisibility.currentMonth },
                        ...(currentMonthProgression?.hasEnoughAverageData
                          ? [{ key: "range", label: "Usual range", color: "#C4C8CE", active: panel2ChartVisibility.range }]
                          : []),
                        ...(currentMonthProgression?.projectedTotal != null
                          ? [{ key: "forecast", label: "Forecast", color: NEGATIVE, dashed: true, active: panel2ChartVisibility.forecast }]
                          : []),
                        ...(budgetTotal ? [{ key: "budget", label: "Budget plan", color: "#9CA3AF", active: panel2ChartVisibility.budget }] : []),
                      ]
                    : [
                        { key: "yearIncome", label: "Income", color: POSITIVE, active: panel2ChartVisibility.yearIncome },
                        { key: "yearExpenses", label: "Expenses", color: NEGATIVE, active: panel2ChartVisibility.yearExpenses },
                      ]
                }
                onToggle={(k) => togglePanel2DataSeries(k as keyof typeof panel2ChartVisibility)}
              />
              <div className="flex-1 min-h-0 px-3 pb-3 pt-2">
                {viewMode === "month" ? (
                  <SpendingPaceChart
                    data={currentMonthProgression?.chartData ?? []}
                    monthLabel={format(selectedDate, "MMMM")}
                    todayDay={currentMonthProgression?.todayDay ?? null}
                    budgetTotal={budgetTotal}
                    visible={panel2ChartVisibility}
                    formatCurrency={formatCurrency}
                    axisMoney={axisMoney}
                  />
                ) : (
                  <RechartsResponsiveContainer width="100%" height="100%">
                    <LineChart data={yearsProgressData || []} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#F1F2F4" vertical={false} />
                      <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} width={48} tickFormatter={axisMoney} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "white", border: "1px solid #E5E7EB", borderRadius: 12, fontSize: 12, padding: "8px 10px" }}
                        formatter={(value: any, name: string) => [formatCurrency(Number(value)), name]}
                      />
                      {panel2ChartVisibility.yearIncome && <Line type="monotone" dataKey="income" stroke={POSITIVE} strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="Income" />}
                      {panel2ChartVisibility.yearExpenses && <Line type="monotone" dataKey="expenses" stroke={NEGATIVE} strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="Expenses" />}
                    </LineChart>
                  </RechartsResponsiveContainer>
                )}
              </div>
            </OverviewCard>

            {/* 3. Categories */}
            <OverviewCard
              title={categoryFlowMode === "expense" ? "Spending" : "Income"}
              subtitle={`${formatCurrency(categoryFlowMode === "expense" ? totalExpenses : totalIncome)} · ${displayCategoryData.length} ${
                categoryViewMode === "groups" ? (displayCategoryData.length === 1 ? "group" : "groups") : displayCategoryData.length === 1 ? "category" : "categories"
              }`}
              actions={
                <PillTabs
                  tabs={[["expense", "Expense"], ["income", "Income"]]}
                  value={categoryFlowMode}
                  onChange={setCategoryFlowMode}
                  size="sm"
                />
              }
              onExpand={() => setExpandedPanel("top-categories")}
              className="overview-panel"
              style={{ aspectRatio: "525 / 310.5" }}
            >
              <div className="px-5 pb-2">
                <BreakdownTabs mode={categoryViewMode} onChange={setCategoryViewMode} size="sm" />
              </div>
              <div
                className="flex-1 overflow-y-auto px-5 pb-4"
                style={{
                  // The card has a fixed height; fade the last row instead of cutting it.
                  WebkitMaskImage: "linear-gradient(to bottom, #000 calc(100% - 28px), transparent)",
                  maskImage: "linear-gradient(to bottom, #000 calc(100% - 28px), transparent)",
                }}
              >
                <div className="flex flex-col gap-1">
                  {displayCategoryData.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">No {categoryFlowMode} transactions in this period.</p>
                  ) : (
                    displayCategoryData.slice(0, 6).map((category, index) => {
                      const totalForPercent = categoryFlowMode === "expense" ? totalExpenses : totalIncome;
                      const percent = totalForPercent > 0 ? (category.amount / totalForPercent) * 100 : 0;
                      return (
                        <div key={category.name} className="flex items-center gap-3 px-2 py-2 -mx-2 rounded-xl hover:bg-gray-50 transition-colors">
                          <EntityIcon emoji={category.emoji} color={colorOf(category, index)} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-sm font-medium text-gray-900 truncate">{category.name}</span>
                              <span className="text-sm font-semibold text-gray-900 tabular-nums">{formatCurrency(category.amount)}</span>
                            </div>
                            <div className="mt-1.5 h-1 rounded-full bg-gray-100 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${Math.max(percent, 1)}%`, backgroundColor: colorOf(category, index) }} />
                            </div>
                          </div>
                          <span className="text-xs text-gray-500 tabular-nums w-10 text-right flex-shrink-0">{percent.toFixed(0)}%</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </OverviewCard>

            {/* 4. Insights */}
            <InsightsCard
              transactions={allTransactions}
              categories={categories}
              selectedDate={selectedDate}
              viewMode={viewMode}
              budget={viewMode === "month" ? monthBudget : null}
              formatCurrency={formatCurrency}
              wallets={wallets}
            />

            {/* 5. Wallets */}
            <WalletsCard
              wallets={wallets}
              transactions={allTransactions}
              selectedDate={selectedDate}
              viewMode={viewMode}
              formatCurrency={formatCurrency}
            />
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
              categoryData: coloredCategoryData,
              headCategoryArray,
              categoryViewMode,
              setCategoryViewMode,
              totalIncome,
              totalExpenses,
              categoryFlowMode,
              chartDataVisibility,
              toggleDataSeries,
              panel2ChartVisibility,
              togglePanel2DataSeries,
              axisMoney,
              cashFlowSelected,
              cashFlowInProgress,
              budgetTotal,
              cashFlowMode,
              monthLabel: format(selectedDate, "MMMM"),
            }, formatCurrency)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
