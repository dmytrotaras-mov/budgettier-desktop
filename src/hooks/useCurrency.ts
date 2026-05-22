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
      case 'USD':
      default: return '$';
    }
  };

  const currencySymbol = getCurrencySymbol(settings?.currency || 'USD');
  const currency = settings?.currency || 'USD';
  
  const formatCurrency = (amount: number | string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    // JPY doesn't use decimal places
    if (currency === 'JPY') {
      return `${currencySymbol}${Math.round(numAmount)}`;
    }
    return `${currencySymbol}${numAmount.toFixed(2)}`;
  };
  
  return { currencySymbol, currency, formatCurrency };
}