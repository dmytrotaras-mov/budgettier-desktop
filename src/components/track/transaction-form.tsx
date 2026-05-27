import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RepeatPicker, type RepeatConfig } from "@/components/ui/repeat-picker";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertTransactionSchema } from "@shared/schema";
import type { Category, Wallet } from "@shared/schema";
import BudgetWarning from "@/components/budget/budget-warning";
import CategorySelector from "./category-selector-redesigned";
import { WalletSelector } from "./wallet-selector";
import { useCurrency } from "@/hooks/useCurrency";
import { FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { format, isToday, isYesterday, isTomorrow, addDays, subDays } from "date-fns";

const formSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.string().min(1, "Amount is required"),
  description: z.string().optional(),
  date: z.string().min(1, "Date is required"),
  categoryId: z.string().optional(),
  walletId: z.string().optional(),
  fromWalletId: z.string().optional(),
  toWalletId: z.string().optional(),
  repeatType: z.enum(["never", "daily", "weekly", "monthly", "custom"]).optional(),
  repeatFrequency: z.string().optional(),
  repeatInterval: z.enum(["days", "weeks", "months"]).optional(),
  repeatDayOfMonth: z.string().optional(),
  excludeFromBudget: z.boolean().optional(),
}).superRefine((data: any, ctx: any) => {
  // For transfers, require both from and to wallet
  if (data.type === "transfer") {
    if (!data.fromWalletId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "From wallet is required for transfers",
        path: ["fromWalletId"]
      });
    }
    if (!data.toWalletId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "To wallet is required for transfers",
        path: ["toWalletId"]
      });
    }
    if (data.fromWalletId === data.toWalletId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "From and To wallets must be different",
        path: ["toWalletId"]
      });
    }
  }
});

type FormData = z.infer<typeof formSchema>;

interface TransactionFormProps {
  onSuccess?: () => void;
  initialDate?: Date | null;
}

export default function TransactionForm({ onSuccess, initialDate }: TransactionFormProps = {}) {
  const [transactionType, setTransactionType] = useState<"expense" | "income" | "transfer">("expense");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: "expense",
      amount: "",
      description: "",
      date: initialDate && initialDate instanceof Date
        ? (() => {
            const year = initialDate.getFullYear();
            const month = String(initialDate.getMonth() + 1).padStart(2, '0');
            const day = String(initialDate.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          })()
        : new Date().toISOString().split('T')[0],
      categoryId: "",
      walletId: "",
      fromWalletId: "",
      toWalletId: "",
      repeatType: "never",
      repeatFrequency: undefined,
      repeatInterval: undefined,
      repeatDayOfMonth: undefined,
      excludeFromBudget: false,
    },
  });

  // Update form date when initialDate prop changes
  useEffect(() => {
    if (initialDate && initialDate instanceof Date) {
      const year = initialDate.getFullYear();
      const month = String(initialDate.getMonth() + 1).padStart(2, '0');
      const day = String(initialDate.getDate()).padStart(2, '0');
      form.setValue("date", `${year}-${month}-${day}`);
    }
  }, [initialDate, form]);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories", transactionType],
  });

  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ["/api/wallets"],
  });

  const { currencySymbol, formatCurrency } = useCurrency();

  const { data: settings } = useQuery<any>({
    queryKey: ["/api/settings"],
  });

  // Pre-select priority wallet when settings or wallets load
  useEffect(() => {
    if (settings?.defaultWalletId && wallets.length > 0 && !form.getValues("walletId")) {
      const priorityWallet = wallets.find((w: any) => w.id === settings.defaultWalletId);
      if (priorityWallet) {
        form.setValue("walletId", settings.defaultWalletId);
      }
    }
  }, [settings, wallets, form]);

  // Auto-categorization: when user types a description, suggest a category
  // by matching against the auto-categorization rules table. Only fills if
  // the user hasn't already picked a category manually.
  const description = form.watch("description");
  const txType = form.watch("type");
  useEffect(() => {
    if (!description || description.trim().length < 3) return;
    if (txType === "transfer") return;
    if (form.getValues("categoryId")) return; // user already picked one
    const timer = setTimeout(async () => {
      try {
        const suggested = await invoke<string | null>("suggest_category", {
          description,
        });
        // Re-check at fire time — user may have picked during the debounce.
        if (suggested && !form.getValues("categoryId")) {
          form.setValue("categoryId", suggested);
        }
      } catch {
        // Silent — auto-suggest is best-effort.
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [description, txType, form]);

  const createTransactionMutation = useMutation({
    mutationFn: async (data: FormData) => {
      // Convert comma to dot for decimal amounts (e.g., "90,89" -> "90.89")
      const normalizedAmount = data.amount.replace(',', '.');

      let requestData: any = {
        ...data,
        type: transactionType,
        amount: normalizedAmount,
        date: new Date(data.date).toISOString(),
        repeatType: data.repeatType || "never",
        repeatFrequency: data.repeatFrequency || undefined,
        repeatInterval: data.repeatInterval || undefined,
        repeatDayOfMonth: data.repeatDayOfMonth || undefined,
      };

      if (transactionType === "transfer") {
        // For transfers, use fromWalletId and toWalletId
        requestData.fromWalletId = data.fromWalletId;
        requestData.toWalletId = data.toWalletId;
        // Don't include categoryId, walletId for transfers
        delete requestData.categoryId;
        delete requestData.walletId;
      } else {
        // For income/expense, handle categories and wallets
        let categoryId = data.categoryId;
        let walletId = data.walletId;

        // Default category if not selected
        if (!categoryId) {
          const defaultCategoryName = transactionType === "expense" ? "Miscellaneous" : "Other Income";
          const defaultCategory = categories.find(c => c.name === defaultCategoryName);
          categoryId = defaultCategory?.id;
        }

        // Default wallet if not selected
        if (!walletId) {
          // Use default wallet from settings, or first Bank Account, or first wallet
          const defaultWallet = settings?.defaultWalletId
            ? wallets.find(w => w.id === settings.defaultWalletId)
            : wallets.find(w => w.name === "Bank Account") || wallets[0];
          walletId = defaultWallet?.id;
        }

        // For income/expense transactions, ensure we have valid categoryId and walletId
        if (!categoryId) {
          throw new Error(`Please select a category for this ${transactionType} transaction`);
        }
        if (!walletId) {
          throw new Error(`Please select a wallet for this ${transactionType} transaction`);
        }

        requestData.categoryId = categoryId;
        requestData.walletId = walletId;
        // Don't include fromWalletId, toWalletId for income/expense
        delete requestData.fromWalletId;
        delete requestData.toWalletId;
      }

      const response = await apiRequest("POST", "/api/transactions", requestData);
      return response.json();
    },
    onMutate: async (data: FormData) => {
      // Cancel any outgoing refetches to prevent them from overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: ["/api/wallets"] });
      await queryClient.cancelQueries({ queryKey: ["/api/transactions"], exact: false });

      // Snapshot the previous wallet state
      const previousWallets = queryClient.getQueryData(["/api/wallets"]);

      // Snapshot and optimistically update all transaction query caches
      const transactionQueries = queryClient.getQueriesData<any[]>({ queryKey: ["/api/transactions"] });
      const previousTransactions = transactionQueries.map(([key, data]) => ({ key, data }));

      const normalizedAmount = data.amount.replace(',', '.');
      let categoryId = data.categoryId;
      let walletId = data.walletId;

      if (transactionType !== "transfer") {
        if (!categoryId) {
          const defaultCategoryName = transactionType === "expense" ? "Miscellaneous" : "Other Income";
          const defaultCategory = categories.find((c: any) => c.name === defaultCategoryName);
          categoryId = defaultCategory?.id;
        }
        if (!walletId) {
          const defaultWallet = settings?.defaultWalletId
            ? wallets.find((w: any) => w.id === settings.defaultWalletId)
            : wallets.find((w: any) => w.name === "Bank Account") || wallets[0];
          walletId = defaultWallet?.id;
        }
      }

      const optimisticTransaction = {
        id: `optimistic-${Date.now()}`,
        type: transactionType,
        amount: normalizedAmount,
        description: data.description || "",
        date: new Date(data.date).toISOString(),
        categoryId: categoryId || null,
        walletId: walletId || null,
        fromWalletId: data.fromWalletId || null,
        toWalletId: data.toWalletId || null,
        excludeFromBudget: data.excludeFromBudget || false,
        _optimistic: true,
      };

      // Add to all matching transaction caches
      for (const [key] of transactionQueries) {
        queryClient.setQueryData(key, (old: any[]) => {
          if (!old || !Array.isArray(old)) return old;
          return [optimisticTransaction, ...old];
        });
      }

      // Optimistically update wallet balances in the cache
      const parsedAmount = parseFloat(normalizedAmount);
      queryClient.setQueryData(["/api/wallets"], (old: any) => {
        if (!old) return old;

        return old.map((wallet: any) => {
          if (transactionType === "transfer") {
            // Handle transfers
            if (wallet.id === data.fromWalletId) {
              return {
                ...wallet,
                balance: (parseFloat(wallet.balance) - parsedAmount).toFixed(2)
              };
            }
            if (wallet.id === data.toWalletId) {
              return {
                ...wallet,
                balance: (parseFloat(wallet.balance) + parsedAmount).toFixed(2)
              };
            }
          } else {
            // Handle income/expense
            let targetWalletId = data.walletId;
            if (!targetWalletId) {
              // Use default wallet
              const defaultWallet = settings?.defaultWalletId
                ? wallets.find(w => w.id === settings.defaultWalletId)
                : wallets.find(w => w.name === "Bank Account") || wallets[0];
              targetWalletId = defaultWallet?.id;
            }

            if (wallet.id === targetWalletId) {
              const currentBalance = parseFloat(wallet.balance);
              const newBalance = transactionType === "income"
                ? currentBalance + parsedAmount
                : currentBalance - parsedAmount;

              return {
                ...wallet,
                balance: newBalance.toFixed(2)
              };
            }
          }
          return wallet;
        });
      });

      // Return context with the snapshots for rollback
      return { previousWallets, previousTransactions };
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Transaction added successfully",
      });
      form.reset();
      // Invalidate all transaction-related queries (including date-range queries)
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budget-goals"] });
      // Call the onSuccess callback if provided
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error, variables, context: any) => {
      // Rollback to previous state on error
      if (context?.previousWallets) {
        queryClient.setQueryData(["/api/wallets"], context.previousWallets);
      }
      if (context?.previousTransactions) {
        for (const { key, data } of context.previousTransactions) {
          queryClient.setQueryData(key, data);
        }
      }

      toast({
        title: "Error",
        description: "Failed to add transaction",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    createTransactionMutation.mutate(data);
  };

  const handleTransactionTypeChange = (type: "expense" | "income" | "transfer") => {
    setTransactionType(type);
    form.setValue("type", type);
    form.setValue("categoryId", "");
    form.setValue("fromWalletId", "");
    form.setValue("toWalletId", "");
  };

  return (
    <div className="flex flex-col h-full md:flex md:flex-col md:max-h-[calc(90vh-2rem)] md:h-auto">
      {/* Top Section: Title + Form Fields (scrollable on mobile and desktop) */}
      <div className="flex-1 overflow-y-auto px-6 md:px-0 md:overflow-y-auto">
        {/* Title - Mobile and Desktop */}
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 text-center mb-5 md:mb-6 pt-2">Add Transaction</h2>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 md:space-y-6 md:pb-6" autoComplete="off" id="transaction-form">
          {/* Hidden dummy fields to prevent autofill */}
          <input type="text" style={{ display: 'none' }} autoComplete="off" />
          <input type="password" style={{ display: 'none' }} autoComplete="new-password" />

          {/* Amount Field - Large bold numbers with border */}
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => {
              const [isFocused, setIsFocused] = useState(false);

              // Format display value with thousand separators (dots) and decimal separator (comma)
              const formatDisplayValue = (value: string): string => {
                if (!value) return '';

                // Split by comma to separate integer and decimal parts
                const parts = value.split(',');
                const integerPart = parts[0];
                const decimalPart = parts[1];

                // Add thousand separators (dots) to integer part
                const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

                // Combine with decimal part if exists
                if (decimalPart !== undefined) {
                  return `${formattedInteger},${decimalPart}`;
                }

                return formattedInteger;
              };

              const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                let inputValue = e.target.value;

                // Remove all dots (thousand separators) to get raw value
                inputValue = inputValue.replace(/\./g, '');

                // If user types comma as first character, add "0," automatically
                if (inputValue === ',' || inputValue.startsWith(',')) {
                  inputValue = '0' + inputValue;
                }

                // Only allow numbers and one comma
                if (!/^[\d,]*$/.test(inputValue)) {
                  return;
                }

                // Split by comma
                const parts = inputValue.split(',');

                // Allow only one comma
                if (parts.length > 2) {
                  return;
                }

                // Limit integer part to 10 digits (1 billion max)
                if (parts[0].length > 10) {
                  return;
                }

                // Check if value exceeds 1 billion
                const integerValue = parseInt(parts[0] || '0', 10);
                if (integerValue > 1000000000) {
                  return;
                }

                // Limit decimal part to 2 digits
                if (parts[1] && parts[1].length > 2) {
                  return;
                }

                // Update field value
                field.onChange(inputValue);
              };

              const handleBlur = () => {
                setIsFocused(false);
                // Auto-complete decimal part if needed
                const parts = field.value.split(',');
                if (parts.length === 2 && parts[1].length === 1) {
                  field.onChange(`${parts[0]},${parts[1]}0`);
                }
                field.onBlur();
              };

              const handleFocus = () => {
                setIsFocused(true);
              };

              // Calculate dynamic font size based on display length
              const displayValue = formatDisplayValue(field.value);
              const displayLength = displayValue.length;

              // More granular breakpoints to prevent cropping on all screen sizes
              let fontSizeMobile = '90px';
              let fontSizeDesktop = '90px';
              let paddingClass = 'pl-16 sm:pl-20 pr-16 sm:pr-20';

              if (displayLength > 13) {
                // Very long numbers (e.g., 1.000.000.000 = 14 chars)
                fontSizeMobile = '40px';
                fontSizeDesktop = '46px';
                paddingClass = 'pl-8 sm:pl-10 pr-8 sm:pr-10';
              } else if (displayLength > 11) {
                // Extra long numbers (e.g., 900.000.000 = 11-13 chars)
                fontSizeMobile = '44px';
                fontSizeDesktop = '50px';
                paddingClass = 'pl-10 sm:pl-12 pr-10 sm:pr-12';
              } else if (displayLength > 9) {
                // Long numbers (e.g., 90.000.000 = 10-11 chars)
                fontSizeMobile = '46px';
                fontSizeDesktop = '52px';
                paddingClass = 'pl-10 sm:pl-12 pr-10 sm:pr-12';
              } else if (displayLength > 8) {
                // Medium-long numbers (e.g., 9.000.000 = 9 chars)
                fontSizeMobile = '50px';
                fontSizeDesktop = '58px';
                paddingClass = 'pl-12 sm:pl-14 pr-12 sm:pr-14';
              } else if (displayLength > 7) {
                // Medium numbers (e.g., 900.000 = 8 chars)
                fontSizeMobile = '54px';
                fontSizeDesktop = '62px';
                paddingClass = 'pl-12 sm:pl-16 pr-12 sm:pr-16';
              } else if (displayLength > 6) {
                // Small-medium numbers (e.g., 90.000 = 7 chars)
                fontSizeMobile = '60px';
                fontSizeDesktop = '70px';
                paddingClass = 'pl-14 sm:pl-16 pr-14 sm:pr-16';
              } else {
                // Small numbers (e.g., 1.000 = 5-6 chars)
                fontSizeMobile = '70px';
                fontSizeDesktop = '85px';
                paddingClass = 'pl-16 sm:pl-20 pr-16 sm:pr-20';
              }

              return (
                <FormItem>
                  <FormControl>
                    <div className="relative" style={{ fontSize: `clamp(${fontSizeMobile}, 5vw, ${fontSizeDesktop})` }}>
                      <span className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-[clamp(20px,calc(4px+2vw),35px)] font-normal" style={{ pointerEvents: 'none', zIndex: 1 }}>
                        {currencySymbol}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder={isFocused ? "" : "0"}
                        autoComplete="one-time-code"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck="false"
                        data-form-type="other"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        autoFocus={false}
                        className={`h-[120px] md:h-28 w-full font-bold text-center border-0 bg-gray-50 rounded-2xl focus:bg-gray-50 focus:ring-0 focus:outline-none ${paddingClass} placeholder-gray-300`}
                        style={{
                          caretColor: 'auto',
                          fontSize: 'max(16px, inherit)',
                          lineHeight: '1.2'
                        }}
                        value={displayValue}
                        onChange={handleAmountChange}
                        onBlur={handleBlur}
                        onFocus={handleFocus}
                        name="transaction-amount-field"
                        id="transaction-amount-input"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                          }
                        }}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs text-center mt-2" />
                </FormItem>
              );
            }}
          />

          {/* Expense/Income/Transfer Toggle */}
          <div className="flex justify-center gap-4 sm:gap-8">
            <Button
              type="button"
              variant="ghost"
              className={`text-base font-medium transition-all bg-transparent hover:bg-transparent min-h-[48px] px-4 py-3 ${
                transactionType === "expense"
                  ? "text-rose-600 font-semibold"
                  : "text-gray-400 hover:text-rose-500"
              }`}
              onClick={() => handleTransactionTypeChange("expense")}
              data-testid="button-expense"
            >
              Expense
            </Button>
            <Button
              type="button"
              variant="ghost"
              className={`text-base font-medium transition-all bg-transparent hover:bg-transparent min-h-[48px] px-4 py-3 ${
                transactionType === "income"
                  ? "text-emerald-600 font-semibold"
                  : "text-gray-400 hover:text-emerald-500"
              }`}
              onClick={() => handleTransactionTypeChange("income")}
              data-testid="button-income"
            >
              Income
            </Button>
            <Button
              type="button"
              variant="ghost"
              className={`text-base font-medium transition-all bg-transparent hover:bg-transparent min-h-[48px] px-4 py-3 ${
                transactionType === "transfer"
                  ? "text-blue-600 font-semibold"
                  : "text-gray-400 hover:text-blue-500"
              }`}
              onClick={() => handleTransactionTypeChange("transfer")}
              data-testid="button-transfer"
            >
              Transfer
            </Button>
          </div>

          {/* Category or Transfer Wallets */}
          {transactionType === "transfer" ? (
            <div className="space-y-4 md:space-y-6">
              {/* From Wallet */}
              <FormField
                control={form.control}
                name="fromWalletId"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <WalletSelector
                        wallets={wallets}
                        selectedWalletId={field.value || undefined}
                        onWalletSelect={field.onChange}
                        placeholder="From wallet..."
                      />
                    </FormControl>
                    <FormMessage className="text-xs mt-1" />
                  </FormItem>
                )}
              />
              {/* To Wallet */}
              <FormField
                control={form.control}
                name="toWalletId"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <WalletSelector
                        wallets={wallets}
                        selectedWalletId={field.value || undefined}
                        onWalletSelect={field.onChange}
                        placeholder="To wallet..."
                      />
                    </FormControl>
                    <FormMessage className="text-xs mt-1" />
                  </FormItem>
                )}
              />
            </div>
          ) : (
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="[&>button]:h-14 md:[&>button]:h-12 [&>button]:text-sm [&>button]:border [&>button]:border-gray-200 [&>button]:bg-gray-50 [&>button]:rounded-xl [&>button]:hover:bg-white [&>button]:hover:border-gray-300 [&>button]:focus:bg-white [&>button]:focus:border-gray-900 [&>button]:transition-all">
                      <CategorySelector
                        value={field.value || ""}
                        onValueChange={field.onChange}
                        type={transactionType}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs mt-1" />
                </FormItem>
              )}
            />
          )}

          {/* Wallet (only for non-transfer transactions) */}
          {transactionType !== "transfer" && (
            <FormField
              control={form.control}
              name="walletId"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <WalletSelector
                      wallets={wallets}
                      selectedWalletId={field.value || undefined}
                      onWalletSelect={field.onChange}
                      placeholder="Select wallet..."
                    />
                  </FormControl>
                  <FormMessage className="text-xs mt-1" />
                </FormItem>
              )}
            />
          )}

          {/* Notes */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <div className="flex items-center gap-3 h-14 md:h-12 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all px-3">
                    <FileText className="h-5 w-5 text-gray-700" />
                    <Input
                      placeholder="Add a note..."
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      className="h-14 md:h-12 border-0 bg-transparent focus:bg-transparent focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0 py-0 font-normal text-gray-700 placeholder:text-gray-700 text-base leading-normal"
                      {...field}
                      value={field.value || ""}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                        }
                      }}
                    />
                  </div>
                </FormControl>
                <FormMessage className="text-xs mt-1" />
              </FormItem>
            )}
          />

          {/* Date */}
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => {
              const dateInputRef = useRef<HTMLInputElement>(null);

              const getDateLabel = (dateString: string) => {
                if (!dateString) return "Today";
                const date = new Date(dateString + 'T00:00:00');
                if (isToday(date)) return "Today";
                if (isYesterday(date)) return "Yesterday";
                if (isTomorrow(date)) return "Tomorrow";
                return format(date, "dd.MM.yyyy");
              };

              const handlePrevDay = () => {
                const currentDate = field.value ? new Date(field.value + 'T00:00:00') : new Date();
                const prevDate = subDays(currentDate, 1);
                const year = prevDate.getFullYear();
                const month = String(prevDate.getMonth() + 1).padStart(2, '0');
                const day = String(prevDate.getDate()).padStart(2, '0');
                field.onChange(`${year}-${month}-${day}`);
              };

              const handleNextDay = () => {
                const currentDate = field.value ? new Date(field.value + 'T00:00:00') : new Date();
                const nextDate = addDays(currentDate, 1);
                const year = nextDate.getFullYear();
                const month = String(nextDate.getMonth() + 1).padStart(2, '0');
                const day = String(nextDate.getDate()).padStart(2, '0');
                field.onChange(`${year}-${month}-${day}`);
              };

              const handleDateClick = () => {
                // Trigger the native date picker
                if (dateInputRef.current) {
                  if (dateInputRef.current.showPicker) {
                    dateInputRef.current.showPicker();
                  } else {
                    dateInputRef.current.focus();
                  }
                }
              };

              return (
                <FormItem>
                  <FormControl>
                    <div className="flex items-center gap-2 h-14 md:h-12 bg-gray-50 rounded-xl transition-all">
                      {/* Date display - clickable to open native picker */}
                      <div
                        onClick={handleDateClick}
                        className="flex-1 px-3 cursor-pointer hover:bg-gray-100 active:bg-gray-200 rounded-l-xl h-full flex items-center transition-all"
                      >
                        <span className="text-gray-700 text-base font-normal">
                          {getDateLabel(field.value)}
                        </span>
                      </div>

                      {/* Hidden native date input */}
                      <input
                        ref={dateInputRef}
                        type="date"
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        className="sr-only"
                        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                      />

                      {/* Arrow buttons */}
                      <div className="flex items-center gap-1 pr-2">
                        <button
                          type="button"
                          onClick={handlePrevDay}
                          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-200 transition-all"
                        >
                          <ChevronLeft className="h-4 w-4 text-gray-700" />
                        </button>
                        <button
                          type="button"
                          onClick={handleNextDay}
                          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-200 transition-all"
                        >
                          <ChevronRight className="h-4 w-4 text-gray-700" />
                        </button>
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs mt-1" />
                </FormItem>
              );
            }}
          />

          {/* Repeat Configuration */}
          <div className="space-y-2">
            <RepeatPicker
              repeatConfig={
                form.watch("repeatType") && form.watch("repeatType") !== "never"
                  ? {
                      type: form.watch("repeatType") as RepeatConfig['type'],
                      frequency: form.watch("repeatFrequency") ? parseInt(form.watch("repeatFrequency") || "0") : undefined,
                      interval: form.watch("repeatInterval") as RepeatConfig['interval'],
                      dayOfMonth: form.watch("repeatDayOfMonth") ? parseInt(form.watch("repeatDayOfMonth") || "0") : undefined,
                    }
                  : undefined
              }
              onRepeatChange={(config) => {
                if (config) {
                  form.setValue("repeatType", config.type);
                  form.setValue("repeatFrequency", config.frequency?.toString());
                  form.setValue("repeatInterval", config.interval);
                  form.setValue("repeatDayOfMonth", config.dayOfMonth?.toString());
                } else {
                  form.setValue("repeatType", "never");
                  form.setValue("repeatFrequency", undefined);
                  form.setValue("repeatInterval", undefined);
                  form.setValue("repeatDayOfMonth", undefined);
                }
              }}
            />
          </div>

          {/* Include in Budget Toggle */}
          <FormField
            control={form.control}
            name="excludeFromBudget"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <label
                    htmlFor="includeInBudget"
                    className="text-sm font-medium text-gray-900 cursor-pointer select-none"
                  >
                    Include in budget calculations
                  </label>
                  <button
                    type="button"
                    id="includeInBudget"
                    role="switch"
                    aria-checked={!field.value}
                    onClick={() => field.onChange(!field.value)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 ${
                      !field.value ? 'bg-black' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        !field.value ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </FormItem>
            )}
          />

          {/* Budget Warning */}
          {transactionType === "expense" && form.watch("categoryId") && (
            <div className="py-1">
              <BudgetWarning categoryId={form.watch("categoryId")} className="text-xs" />
            </div>
          )}
        </form>
      </Form>
    </div>

    {/* Bottom Section: Save Button (pinned to bottom on mobile) */}
    <div className="flex-shrink-0 p-6 pt-6 md:pt-0 md:px-0" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
      <Button
        type="submit"
        form="transaction-form"
        disabled={createTransactionMutation.isPending}
        className="w-full h-16 md:h-14 text-base font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        style={{
          backgroundColor: '#000',
          color: '#FFF'
        }}
        data-testid="button-submit"
      >
        {createTransactionMutation.isPending ? "Saving..." : "Save"}
      </Button>
    </div>
  </div>
  );
}
