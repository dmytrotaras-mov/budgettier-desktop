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
export function calculateYearsProgress(transactions: any[], selectedYear: number, currentWalletBalance: number = 0) {
  const years: number[] = [];
  for (let i = 4; i >= 0; i--) years.push(selectedYear - i);

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

    let cumulativeHistorical = 0;
    for (let day = 1; day <= 31; day++) {
      cumulativeHistorical += historicalDaily[day];
      previousMonthsData[day].push(cumulativeHistorical);
    }
  }

  // Calculate averages
  const averageDaily: number[] = new Array(32).fill(0);
  for (let day = 1; day <= 31; day++) {
    const data = previousMonthsData[day];
    averageDaily[day] = data.length > 0 ? data.reduce((sum, val) => sum + val, 0) / data.length : 0;
  }

  // Build chart data
  const chartData: { day: number; currentMonth?: number; average: number }[] = [];
  let cumulativeCurrent = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    cumulativeCurrent += currentMonthDaily[day];
    const dataPoint: { day: number; currentMonth?: number; average: number } = {
      day,
      average: averageDaily[day] || 0
    };

    if (!isFutureMonth && day <= today) {
      dataPoint.currentMonth = cumulativeCurrent;
    }

    chartData.push(dataPoint);
  }

  return { chartData, totalSpent: cumulativeCurrent, isCurrentMonth, todayDay: isCurrentMonth ? today : null };
}

// Category icon helper
export function getCategoryIcon(categoryName: string): string {
  const iconMap: Record<string, string> = {
    'Rent/Mortgage': '🏠', 'Groceries': '🛒', 'Restaurants/Cafes': '🍽️',
    'Transportation': '🚗', 'Entertainment': '🎬', 'Shopping': '🛍️',
    'Healthcare': '🏥', 'Utilities': '⚡', 'Travel': '✈️',
    'Education': '📚', 'Miscellaneous': '📦', 'Other': '📦'
  };
  return iconMap[categoryName] || '💰';
}

// Default section mapping for categories
export function getDefaultSection(categoryName: string): string {
  const sectionMap: Record<string, string> = {
    'Rent/Mortgage': 'Housing & Utilities',
    'Electricity': 'Housing & Utilities',
    'Water': 'Housing & Utilities',
    'Gas/Heating': 'Housing & Utilities',
    'Internet/Phone': 'Housing & Utilities',
    'Groceries': 'Food & Drinks',
    'Restaurants/Cafes': 'Food & Drinks',
    'Food Delivery': 'Food & Drinks',
    'Public Transport': 'Transportation',
    'Fuel/Gas': 'Transportation',
    'Taxi/Ride Sharing': 'Transportation',
    'Car Maintenance': 'Transportation',
    'Health Insurance': 'Health & Wellness',
    'Doctor/Dentist': 'Health & Wellness',
    'Medications': 'Health & Wellness',
    'Gym/Fitness': 'Health & Wellness',
    'Clothing': 'Shopping',
    'Electronics': 'Shopping',
    'Home Goods': 'Shopping',
    'Movies/Concerts': 'Entertainment',
    'Streaming Services': 'Entertainment',
    'Hobbies': 'Entertainment',
    'Books/Education': 'Education & Other',
    'Courses/Training': 'Education & Other',
    'Gifts': 'Education & Other',
    'Charity': 'Education & Other',
    'Miscellaneous': 'Education & Other',
  };
  return sectionMap[categoryName] || 'Other';
}

export function getExpandedPanelTitle(panelId: string | null): string {
  switch (panelId) {
    case 'monthly-progress': return 'Monthly Spending Progress';
    case 'year-budget': return 'Year Budget Overview';
    case 'top-categories': return 'Spending Categories Breakdown';
    default: return 'Details';
  }
}
