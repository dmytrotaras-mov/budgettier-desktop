import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format, isToday, isYesterday, isTomorrow, addDays, subDays } from "date-fns";
import type { Transaction, Category, Wallet } from "@shared/schema";
import CategorySelector from "./category-selector-redesigned";
import { WalletSelector } from "./wallet-selector";
import { useCurrency } from "@/hooks/useCurrency";
import { FileText, ChevronLeft, ChevronRight } from "lucide-react";

const transactionSchema = z.object({
  type: z.enum(["income", "expense"]),
  amount: z.string().min(1, "Amount is required"),
  description: z.string().optional(),
  categoryId: z.string().min(1, "Category is required"),
  walletId: z.string().min(1, "Wallet is required"),
  date: z.string().min(1, "Date is required"),
  excludeFromBudget: z.boolean().optional(),
});

const transferSchema = z.object({
  amount: z.string().min(1, "Amount is required"),
  description: z.string().optional(),
  fromWalletId: z.string().min(1, "From wallet is required"),
  toWalletId: z.string().min(1, "To wallet is required"),
  date: z.string().min(1, "Date is required"),
  excludeFromBudget: z.boolean().optional(),
}).refine((data) => data.fromWalletId !== data.toWalletId, {
  message: "From and To wallets must be different",
  path: ["toWalletId"],
});

interface TransactionEditDialogProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete?: (id: string) => void;
}

export default function TransactionEditDialog({ transaction, isOpen, onClose, onDelete }: TransactionEditDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currencySymbol } = useCurrency();

  // Check if this is a transfer transaction
  const isTransfer = transaction?.type === 'transfer';

  // State to track if we're in edit mode for transfers
  const [isEditingTransfer, setIsEditingTransfer] = useState(false);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ["/api/wallets"],
  });

  const form = useForm<z.infer<typeof transactionSchema>>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: "expense",
      amount: "",
      description: "",
      categoryId: "",
      walletId: "",
      date: format(new Date(), "yyyy-MM-dd"),
      excludeFromBudget: false,
    },
  });

  const transferForm = useForm<z.infer<typeof transferSchema>>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      amount: "",
      description: "",
      fromWalletId: "",
      toWalletId: "",
      date: format(new Date(), "yyyy-MM-dd"),
      excludeFromBudget: false,
    },
  });

  // Update form when transaction changes
  useEffect(() => {
    if (transaction && !isTransfer) {
      form.reset({
        type: transaction.type as "income" | "expense",
        amount: transaction.amount.toString(),
        description: transaction.description || "",
        categoryId: transaction.categoryId || "",
        walletId: transaction.walletId || "",
        date: transaction.date ? format(new Date(transaction.date), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
        excludeFromBudget: transaction.excludeFromBudget || false,
      });
    } else if (transaction && isTransfer) {
      transferForm.reset({
        amount: transaction.amount.toString(),
        description: transaction.description || "",
        fromWalletId: transaction.fromWalletId || "",
        toWalletId: transaction.toWalletId || "",
        date: transaction.date ? format(new Date(transaction.date), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
        excludeFromBudget: transaction.excludeFromBudget || false,
      });
    }
    // Reset edit mode when dialog opens with a new transaction
    setIsEditingTransfer(false);
  }, [transaction, form, transferForm, isTransfer]);

  const updateTransactionMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", `/api/transactions/${transaction?.id}`, data),
    onMutate: async (newData: any) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/wallets"] });

      // Snapshot the previous state
      const previousWallets = queryClient.getQueryData(["/api/wallets"]);

      // Optimistically update wallet balances
      queryClient.setQueryData(["/api/wallets"], (old: any) => {
        if (!old || !transaction) return old;

        const oldAmount = parseFloat(transaction.amount);
        const newAmount = parseFloat(newData.amount.replace(',', '.'));

        return old.map((wallet: any) => {
          let balance = parseFloat(wallet.balance);

          // Reverse the old transaction
          if (transaction.type === "income" && wallet.id === transaction.walletId) {
            balance -= oldAmount;
          } else if (transaction.type === "expense" && wallet.id === transaction.walletId) {
            balance += oldAmount;
          } else if (transaction.type === "transfer") {
            if (wallet.id === transaction.fromWalletId) balance += oldAmount;
            if (wallet.id === transaction.toWalletId) balance -= oldAmount;
          }

          // Apply the new transaction
          const newType = newData.type || transaction.type;
          if (newType === "income" && wallet.id === (newData.walletId || transaction.walletId)) {
            balance += newAmount;
          } else if (newType === "expense" && wallet.id === (newData.walletId || transaction.walletId)) {
            balance -= newAmount;
          } else if (newType === "transfer") {
            if (wallet.id === newData.fromWalletId) balance -= newAmount;
            if (wallet.id === newData.toWalletId) balance += newAmount;
          }

          return {
            ...wallet,
            balance: balance.toFixed(2)
          };
        });
      });

      return { previousWallets };
    },
    onSuccess: () => {
      // Invalidate all transaction-related queries (including date-range queries)
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budget-goals"] });
      toast({
        title: "Success",
        description: "Transaction updated successfully",
      });
      onClose();
    },
    onError: (error, variables, context: any) => {
      // Rollback on error
      if (context?.previousWallets) {
        queryClient.setQueryData(["/api/wallets"], context.previousWallets);
      }

      toast({
        title: "Error",
        description: "Failed to update transaction",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof transactionSchema>) => {
    try {
      // Ensure date is valid before converting
      const dateValue = data.date ? new Date(data.date) : new Date();

      // Convert comma to dot for decimal amounts (e.g., "90,89" -> "90.89")
      const normalizedAmount = data.amount.replace(',', '.');

      updateTransactionMutation.mutate({
        ...data,
        amount: normalizedAmount,
        date: dateValue.toISOString(),
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Invalid date format",
        variant: "destructive",
      });
    }
  };

  const onTransferSubmit = (data: z.infer<typeof transferSchema>) => {
    try {
      // Ensure date is valid before converting
      const dateValue = data.date ? new Date(data.date) : new Date();

      // Convert comma to dot for decimal amounts (e.g., "90,89" -> "90.89")
      const normalizedAmount = data.amount.replace(',', '.');

      updateTransactionMutation.mutate({
        type: "transfer",
        ...data,
        amount: normalizedAmount,
        date: dateValue.toISOString(),
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Invalid date format",
        variant: "destructive",
      });
    }
  };

  const expenseCategories = categories.filter(cat => cat.type === "expense");
  const incomeCategories = categories.filter(cat => cat.type === "income");
  const currentCategories = form.watch("type") === "expense" ? expenseCategories : incomeCategories;

  // Get wallet names for transfer transactions
  const getWalletName = (walletId: string | null) => {
    if (!walletId) return "Unknown";
    const wallet = wallets.find(w => w.id === walletId);
    return wallet?.name || "Unknown";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Transaction</DialogTitle>
          <DialogDescription>
            {isTransfer
              ? (isEditingTransfer ? "Edit transfer transaction details" : "View transfer transaction details")
              : "Edit transaction information including type, amount, category, and other details"
            }
          </DialogDescription>
        </DialogHeader>

        {isTransfer ? (
          isEditingTransfer ? (
            <Form {...transferForm}>
              <form onSubmit={transferForm.handleSubmit(onTransferSubmit)} className="space-y-5 md:space-y-6">
                {/* Amount Field - styled to match add transaction */}
                <FormField
                  control={transferForm.control}
                  name="amount"
                  render={({ field }) => {
                    const [isFocused, setIsFocused] = useState(false);

                    const formatDisplayValue = (value: string): string => {
                      if (!value) return '';
                      const parts = value.split(',');
                      const integerPart = parts[0];
                      const decimalPart = parts[1];
                      const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                      if (decimalPart !== undefined) {
                        return `${formattedInteger},${decimalPart}`;
                      }
                      return formattedInteger;
                    };

                    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                      let inputValue = e.target.value;
                      inputValue = inputValue.replace(/\./g, '');
                      if (inputValue === ',' || inputValue.startsWith(',')) {
                        inputValue = '0' + inputValue;
                      }
                      if (!/^[\d,]*$/.test(inputValue)) return;
                      const parts = inputValue.split(',');
                      if (parts.length > 2) return;
                      if (parts[0].length > 10) return;
                      const integerValue = parseInt(parts[0] || '0', 10);
                      if (integerValue > 1000000000) return;
                      if (parts[1] && parts[1].length > 2) return;
                      field.onChange(inputValue);
                    };

                    const displayValue = formatDisplayValue(field.value);
                    const displayLength = displayValue.length;

                    // More granular breakpoints to prevent cropping on all screen sizes
                    let fontSizeMobile = '90px';
                    let fontSizeDesktop = '90px';
                    let paddingClass = 'pl-16 sm:pl-20 pr-16 sm:pr-20';

                    if (displayLength > 13) {
                      fontSizeMobile = '40px';
                      fontSizeDesktop = '46px';
                      paddingClass = 'pl-8 sm:pl-10 pr-8 sm:pr-10';
                    } else if (displayLength > 11) {
                      fontSizeMobile = '44px';
                      fontSizeDesktop = '50px';
                      paddingClass = 'pl-10 sm:pl-12 pr-10 sm:pr-12';
                    } else if (displayLength > 9) {
                      fontSizeMobile = '46px';
                      fontSizeDesktop = '52px';
                      paddingClass = 'pl-10 sm:pl-12 pr-10 sm:pr-12';
                    } else if (displayLength > 8) {
                      fontSizeMobile = '50px';
                      fontSizeDesktop = '58px';
                      paddingClass = 'pl-12 sm:pl-14 pr-12 sm:pr-14';
                    } else if (displayLength > 7) {
                      fontSizeMobile = '54px';
                      fontSizeDesktop = '62px';
                      paddingClass = 'pl-12 sm:pl-16 pr-12 sm:pr-16';
                    } else if (displayLength > 6) {
                      fontSizeMobile = '60px';
                      fontSizeDesktop = '70px';
                      paddingClass = 'pl-14 sm:pl-16 pr-14 sm:pr-16';
                    } else {
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
                              className={`h-[120px] md:h-28 w-full font-bold text-center border-0 bg-gray-50 rounded-2xl focus:bg-gray-50 focus:ring-0 focus:outline-none ${paddingClass} placeholder-gray-300`}
                              style={{
                                caretColor: 'auto',
                                fontSize: 'max(16px, inherit)',
                                lineHeight: '1.2'
                              }}
                              value={displayValue}
                              onChange={handleAmountChange}
                              onBlur={() => {
                                setIsFocused(false);
                                const parts = field.value.split(',');
                                if (parts.length === 2 && parts[1].length === 1) {
                                  field.onChange(`${parts[0]},${parts[1]}0`);
                                }
                                field.onBlur();
                              }}
                              onFocus={() => setIsFocused(true)}
                            />
                          </div>
                        </FormControl>
                        <FormMessage className="text-xs text-center mt-2" />
                      </FormItem>
                    );
                  }}
                />

                {/* From Wallet */}
                <FormField
                  control={transferForm.control}
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
                  control={transferForm.control}
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

                {/* Notes */}
                <FormField
                  control={transferForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <div className="flex items-center gap-3 h-14 md:h-12 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all px-3">
                          <FileText className="h-5 w-5 text-gray-700" />
                          <Input
                            placeholder="Add a note..."
                            autoComplete="off"
                            className="h-14 md:h-12 border-0 bg-transparent focus:bg-transparent focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0 py-0 font-normal text-gray-700 placeholder:text-gray-700 text-base leading-normal"
                            {...field}
                            value={field.value || ""}
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs mt-1" />
                    </FormItem>
                  )}
                />

                {/* Date */}
                <FormField
                  control={transferForm.control}
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
                        dateInputRef.current.showPicker?.() || dateInputRef.current.focus();
                      }
                    };

                    return (
                      <FormItem>
                        <FormControl>
                          <div className="flex items-center gap-2 h-14 md:h-12 bg-gray-50 rounded-xl transition-all">
                            <div
                              onClick={handleDateClick}
                              className="flex-1 px-3 cursor-pointer hover:bg-gray-100 active:bg-gray-200 rounded-l-xl h-full flex items-center transition-all"
                            >
                              <span className="text-gray-700 text-base font-normal">
                                {getDateLabel(field.value)}
                              </span>
                            </div>
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

                {/* Include in Budget Toggle */}
                <FormField
                  control={transferForm.control}
                  name="excludeFromBudget"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                        <label
                          htmlFor="includeInBudgetTransfer"
                          className="text-sm font-medium text-gray-900 cursor-pointer select-none"
                        >
                          Include in budget calculations
                        </label>
                        <button
                          type="button"
                          id="includeInBudgetTransfer"
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

                <div className="flex flex-col gap-3 pt-4">
                  <Button
                    type="submit"
                    disabled={updateTransactionMutation.isPending}
                    className="w-full h-16 md:h-14 text-base font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    style={{
                      backgroundColor: '#000',
                      color: '#FFF'
                    }}
                  >
                    {updateTransactionMutation.isPending ? "Updating..." : "Update Transfer"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-16 md:h-14 text-base font-semibold rounded-xl"
                    onClick={() => setIsEditingTransfer(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-16 md:h-14 text-base font-semibold rounded-xl text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    onClick={() => {
                      if (transaction?.id && onDelete) {
                        onDelete(transaction.id);
                      }
                    }}
                  >
                    Delete Transaction
                  </Button>
                </div>
              </form>
            </Form>
          ) : (
            <div className="space-y-4 text-center py-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🔄</span>
              </div>
              <h3 className="text-lg font-medium text-mono-black mb-2">Transfer Transaction</h3>
              <div className="bg-mono-gray-50 p-4 rounded-lg text-left">
                <p className="text-sm text-mono-gray-700 mb-2">
                  <strong>From Wallet:</strong> {getWalletName(transaction?.fromWalletId || null)}
                </p>
                <p className="text-sm text-mono-gray-700 mb-2">
                  <strong>To Wallet:</strong> {getWalletName(transaction?.toWalletId || null)}
                </p>
                <p className="text-sm text-mono-gray-700 mb-2">
                  <strong>Amount:</strong> {transaction?.amount}
                </p>
                <p className="text-sm text-mono-gray-700 mb-2">
                  <strong>Description:</strong> {transaction?.description || "No description"}
                </p>
                <p className="text-sm text-mono-gray-700">
                  <strong>Date:</strong> {transaction?.date ? format(new Date(transaction.date), "MMM d, yyyy") : "Unknown"}
                </p>
              </div>
              <div className="flex justify-between pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                  onClick={() => {
                    if (transaction?.id && onDelete) {
                      onDelete(transaction.id);
                    }
                  }}
                >
                  Delete Transaction
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditingTransfer(true)}
                    className="bg-mono-black hover:bg-mono-gray-800 text-mono-white"
                  >
                    Edit Transfer
                  </Button>
                  <Button type="button" variant="outline" onClick={onClose}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          )
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 md:space-y-6">
            {/* Amount Field - styled to match add transaction */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => {
                const [isFocused, setIsFocused] = useState(false);

                const formatDisplayValue = (value: string): string => {
                  if (!value) return '';
                  const parts = value.split(',');
                  const integerPart = parts[0];
                  const decimalPart = parts[1];
                  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                  if (decimalPart !== undefined) {
                    return `${formattedInteger},${decimalPart}`;
                  }
                  return formattedInteger;
                };

                const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                  let inputValue = e.target.value;
                  inputValue = inputValue.replace(/\./g, '');
                  if (inputValue === ',' || inputValue.startsWith(',')) {
                    inputValue = '0' + inputValue;
                  }
                  if (!/^[\d,]*$/.test(inputValue)) return;
                  const parts = inputValue.split(',');
                  if (parts.length > 2) return;
                  if (parts[0].length > 10) return;
                  const integerValue = parseInt(parts[0] || '0', 10);
                  if (integerValue > 1000000000) return;
                  if (parts[1] && parts[1].length > 2) return;
                  field.onChange(inputValue);
                };

                const displayValue = formatDisplayValue(field.value);
                const displayLength = displayValue.length;

                // More granular breakpoints to prevent cropping on all screen sizes
                let fontSizeMobile = '90px';
                let fontSizeDesktop = '90px';
                let paddingClass = 'pl-16 sm:pl-20 pr-16 sm:pr-20';

                if (displayLength > 13) {
                  fontSizeMobile = '40px';
                  fontSizeDesktop = '46px';
                  paddingClass = 'pl-8 sm:pl-10 pr-8 sm:pr-10';
                } else if (displayLength > 11) {
                  fontSizeMobile = '44px';
                  fontSizeDesktop = '50px';
                  paddingClass = 'pl-10 sm:pl-12 pr-10 sm:pr-12';
                } else if (displayLength > 9) {
                  fontSizeMobile = '46px';
                  fontSizeDesktop = '52px';
                  paddingClass = 'pl-10 sm:pl-12 pr-10 sm:pr-12';
                } else if (displayLength > 8) {
                  fontSizeMobile = '50px';
                  fontSizeDesktop = '58px';
                  paddingClass = 'pl-12 sm:pl-14 pr-12 sm:pr-14';
                } else if (displayLength > 7) {
                  fontSizeMobile = '54px';
                  fontSizeDesktop = '62px';
                  paddingClass = 'pl-12 sm:pl-16 pr-12 sm:pr-16';
                } else if (displayLength > 6) {
                  fontSizeMobile = '60px';
                  fontSizeDesktop = '70px';
                  paddingClass = 'pl-14 sm:pl-16 pr-14 sm:pr-16';
                } else {
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
                          className={`h-[120px] md:h-28 w-full font-bold text-center border-0 bg-gray-50 rounded-2xl focus:bg-gray-50 focus:ring-0 focus:outline-none ${paddingClass} placeholder-gray-300`}
                          style={{
                            caretColor: 'auto',
                            fontSize: 'max(16px, inherit)',
                            lineHeight: '1.2'
                          }}
                          value={displayValue}
                          onChange={handleAmountChange}
                          onBlur={() => {
                            setIsFocused(false);
                            const parts = field.value.split(',');
                            if (parts.length === 2 && parts[1].length === 1) {
                              field.onChange(`${parts[0]},${parts[1]}0`);
                            }
                            field.onBlur();
                          }}
                          onFocus={() => setIsFocused(true)}
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-xs text-center mt-2" />
                  </FormItem>
                );
              }}
            />

            {/* Expense/Income Toggle */}
            <div className="flex justify-center gap-4 sm:gap-8">
              <Button
                type="button"
                variant="ghost"
                className={`text-base font-medium transition-all bg-transparent hover:bg-transparent min-h-[48px] px-4 py-3 ${
                  form.watch("type") === "expense"
                    ? "text-rose-600 font-semibold"
                    : "text-gray-400 hover:text-rose-500"
                }`}
                onClick={() => {
                  form.setValue("type", "expense");
                  form.setValue("categoryId", "");
                }}
              >
                Expense
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={`text-base font-medium transition-all bg-transparent hover:bg-transparent min-h-[48px] px-4 py-3 ${
                  form.watch("type") === "income"
                    ? "text-emerald-600 font-semibold"
                    : "text-gray-400 hover:text-emerald-500"
                }`}
                onClick={() => {
                  form.setValue("type", "income");
                  form.setValue("categoryId", "");
                }}
              >
                Income
              </Button>
            </div>

            {/* Category */}
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
                        type={form.watch("type")}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs mt-1" />
                </FormItem>
              )}
            />

            {/* Wallet */}
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
                        className="h-14 md:h-12 border-0 bg-transparent focus:bg-transparent focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0 py-0 font-normal text-gray-700 placeholder:text-gray-700 text-base leading-normal"
                        {...field}
                        value={field.value || ""}
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
                    dateInputRef.current.showPicker?.() || dateInputRef.current.focus();
                  }
                };

                return (
                  <FormItem>
                    <FormControl>
                      <div className="flex items-center gap-2 h-14 md:h-12 bg-gray-50 rounded-xl transition-all">
                        <div
                          onClick={handleDateClick}
                          className="flex-1 px-3 cursor-pointer hover:bg-gray-100 active:bg-gray-200 rounded-l-xl h-full flex items-center transition-all"
                        >
                          <span className="text-gray-700 text-base font-normal">
                            {getDateLabel(field.value)}
                          </span>
                        </div>
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

            <div className="flex flex-col gap-3 pt-4">
              <Button
                type="submit"
                disabled={updateTransactionMutation.isPending}
                className="w-full h-16 md:h-14 text-base font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                style={{
                  backgroundColor: '#000',
                  color: '#FFF'
                }}
              >
                {updateTransactionMutation.isPending ? "Updating..." : "Update Transaction"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full h-16 md:h-14 text-base font-semibold rounded-xl text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                onClick={() => {
                  if (transaction?.id && onDelete) {
                    onDelete(transaction.id);
                  }
                }}
              >
                Delete Transaction
              </Button>
            </div>
          </form>
        </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}