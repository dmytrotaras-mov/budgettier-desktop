import { useQuery } from "@tanstack/react-query";

export function useCurrency() {
  const { data: settings } = useQuery<any>({
    queryKey: ["/api/settings"],
  });

  const getCurrencySymbol = (curr: string) => {
    switch (curr) {
      case 'EUR': return '€';
      case 'GBP': return '£';
      case 'JPY': return '¥';
      case 'UAH': return '₴';
      case 'USD':
      default: return '$';
    }
  };

  const currencySymbol = getCurrencySymbol(settings?.currency || 'USD');
  const currency = settings?.currency || 'USD';
  
  const formatCurrency = (amount: number | string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    // A real minus before the symbol: "−€5.93", not "€-5.93".
    const sign = numAmount < 0 && Math.abs(numAmount) >= 0.005 ? '−' : '';
    const abs = Math.abs(numAmount);
    // JPY doesn't use decimal places
    if (currency === 'JPY') {
      return `${sign}${currencySymbol}${Math.round(abs)}`;
    }
    return `${sign}${currencySymbol}${abs.toFixed(2)}`;
  };
  
  return { currencySymbol, currency, formatCurrency };
}