import { startOfMonth, endOfMonth, subMonths } from "date-fns";

// Calculate cumulative balance up to a specific date
// Current wallet balance represents the balance NOW after all transactions
// To get historical balance: current balance - transactions that happened AFTER cutoffDate
export function calculateCumulativeBalance(transactions: any[], cutoffDate: Date, currentWalletBalance: number = 0): number {
  let futureBalance = 0;
  for (const t of transactions) {
    const transactionDate = new Date(t.date);
    if (transactionDate <= cutoffDate) continue;
    const amount = parseFloat(t.amount);
    if (t.type === "income") futureBalance += amount;
    else if (t.type === "expense") futureBalance -= amount;
  }
  return currentWalletBalance - futureBalance;
}

// Year Overview Calculator
export function calculateYearOverview(transactions: any[], selectedDate: Date, currentWalletBalance: number = 0) {
  const year = selectedDate.getFullYear();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return months.map((month, index) => {
    const monthStart = new Date(Date.UTC(year, index, 1));
    const monthEnd = new Date(Date.UTC(year, index + 1, 0, 23, 59, 59, 999));

    let income = 0;
    let expenses = 0;
    let hasTransactions = false;

    for (const t of transactions) {
      const transactionDate = new Date(t.date);
      if (transactionDate < monthStart || transactionDate > monthEnd) continue;
      hasTransactions = true;
      if (t.excludeFromBudget) continue;
      const amount = parseFloat(t.amount);
      if (t.type === "income") income += amount;
      else if (t.type === "expense") expenses += amount;
    }

    const balanceAtMonthEnd = calculateCumulativeBalance(transactions, monthEnd, currentWalletBalance);

    return {
      month,
      income,
      expenses,
      savings: income - expenses,
      balance: hasTransactions ? balanceAtMonthEnd : null
    };
  });
}

// Calculate Years Progress
// Only includes years where transactions actually exist. The selected year is
// always included even if empty (so the user still sees their current period).
export function calculateYearsProgress(transactions: any[], selectedYear: number, currentWalletBalance: number = 0) {
  // Discover which years have any transaction data at all.
  const yearsWithData = new Set<number>();
  for (const t of transactions) {
    yearsWithData.add(new Date(t.date).getFullYear());
  }
  yearsWithData.add(selectedYear);
  const years = Array.from(yearsWithData).sort((a, b) => a - b);

  return years.map(year => {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);

    let income = 0;
    let expenses = 0;

    for (const t of transactions) {
      const transactionDate = new Date(t.date);
      if (transactionDate < yearStart || transactionDate > yearEnd) continue;
      if (t.excludeFromBudget) continue;
      const amount = parseFloat(t.amount);
      if (t.type === "income") income += amount;
      else if (t.type === "expense") expenses += amount;
    }

    const balanceAtYearEnd = calculateCumulativeBalance(transactions, yearEnd, currentWalletBalance);

    return {
      year: year.toString(),
      income,
      expenses,
      savings: income - expenses,
      balance: balanceAtYearEnd
    };
  });
}

// Monthly Progress Calculator
export function calculateCurrentMonthProgression(transactions: any[], selectedDate: Date) {
  const now = new Date();
  const currentMonthStart = startOfMonth(selectedDate);
  const currentMonthEnd = endOfMonth(selectedDate);
  const isCurrentMonth = selectedDate.getFullYear() === now.getFullYear() && selectedDate.getMonth() === now.getMonth();
  const isFutureMonth = selectedDate > now;

  const today = isCurrentMonth ? now.getDate() : currentMonthEnd.getDate();
  const daysInMonth = currentMonthEnd.getDate();

  // Build daily expense totals for current month
  const currentMonthDaily: number[] = new Array(daysInMonth + 1).fill(0);

  for (const t of transactions) {
    const transactionDate = new Date(t.date);
    if (transactionDate < currentMonthStart || transactionDate > currentMonthEnd || t.type !== "expense") continue;
    currentMonthDaily[transactionDate.getDate()] += parseFloat(t.amount);
  }

  // Build historical averages from previous 6 months
  const previousMonthsData: number[][] = [];
  for (let day = 0; day <= 31; day++) previousMonthsData[day] = [];
  let monthsWithData = 0;

  for (let monthOffset = 1; monthOffset <= 6; monthOffset++) {
    const monthStart = startOfMonth(subMonths(now, monthOffset));
    const monthEnd = endOfMonth(subMonths(now, monthOffset));

    const historicalDaily: number[] = new Array(32).fill(0);
    let hasData = false;

    for (const t of transactions) {
      const transactionDate = new Date(t.date);
      if (transactionDate < monthStart || transactionDate > monthEnd || t.type !== "expense") continue;
      historicalDaily[transactionDate.getDate()] += parseFloat(t.amount);
      hasData = true;
    }

    if (!hasData) continue;
    monthsWithData += 1;

    let cumulativeHistorical = 0;
    for (let day = 1; day <= 31; day++) {
      cumulativeHistorical += historicalDaily[day];
      previousMonthsData[day].push(cumulativeHistorical);
    }
  }

  // Average is statistically useless if we have less than 3 months of history.
  // We compute it anyway for backwards compat but flag the caller so the UI
  // can skip the line altogether.
  const hasEnoughAverageData = monthsWithData >= 3;

  // Calculate averages
  const averageDaily: number[] = new Array(32).fill(0);
  for (let day = 1; day <= 31; day++) {
    const data = previousMonthsData[day];
    averageDaily[day] = data.length > 0 ? data.reduce((sum, val) => sum + val, 0) / data.length : 0;
  }

  // Build chart data. Omit `average` field entirely if data is too thin —
  // recharts will then not render the line.
  const chartData: { day: number; currentMonth?: number; average?: number }[] = [];
  let cumulativeCurrent = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    cumulativeCurrent += currentMonthDaily[day];
    const dataPoint: { day: number; currentMonth?: number; average?: number } = { day };
    if (hasEnoughAverageData) {
      dataPoint.average = averageDaily[day] || 0;
    }
    if (!isFutureMonth && day <= today) {
      dataPoint.currentMonth = cumulativeCurrent;
    }
    chartData.push(dataPoint);
  }

  return {
    chartData,
    totalSpent: cumulativeCurrent,
    isCurrentMonth,
    todayDay: isCurrentMonth ? today : null,
    hasEnoughAverageData,
    monthsWithHistory: monthsWithData,
  };
}

export function getExpandedPanelTitle(panelId: string | null): string {
  switch (panelId) {
    case 'monthly-progress': return 'Monthly Spending Progress';
    case 'year-budget': return 'Year Budget Overview';
    case 'top-categories': return 'Spending Categories Breakdown';
    default: return 'Details';
  }
}
