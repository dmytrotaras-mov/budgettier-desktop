import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Wallet, CreditCard, DollarSign, Plus, Trash2, AlertTriangle, User, Bell, Settings2, Crown, Download, Loader2, HelpCircle, MessageCircle, ChevronRight, Tags, LogOut, RefreshCw, Instagram } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import ProfileSettings from "@/components/settings/profile-settings";
import CategoryGroups from "@/components/settings/category-groups";
import StartingBalanceDialog from "@/components/wallets/starting-balance-dialog";
import OpeningBalanceDialog from "@/components/wallets/opening-balance-dialog";
import ResponsiveContainer from "@/components/layout/responsive-container";
import DatabaseSection from "@/components/settings/database-section";
import AutoCategorizationSection from "@/components/settings/auto-categorization";
import { Database, Sparkles } from "lucide-react";

// Form schemas
const walletFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["cash", "bank", "credit"]),
  balance: z.string(),
});


export default function SettingsRedesignedPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();

  // Initialize activeTab from localStorage, default to "general"
  const [activeTab, setActiveTabState] = useState(() => {
    const savedTab = localStorage.getItem("settingsActiveTab");
    return savedTab || "general";
  });

  // Wrapper function to save tab to localStorage when it changes
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    localStorage.setItem("settingsActiveTab", tab);
  };

  const [selectedWallet, setSelectedWallet] = useState<any>(null);
  const [isWalletDialogOpen, setIsWalletDialogOpen] = useState(false);
  const [openingWallet, setOpeningWallet] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [walletToDelete, setWalletToDelete] = useState<any>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [categoryType, setCategoryType] = useState<"income" | "expense">("expense");
  const [isStartingBalanceDialogOpen, setIsStartingBalanceDialogOpen] = useState(false);
  const [isDeleteAccountDialogOpen, setIsDeleteAccountDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isCleanDataDialogOpen, setIsCleanDataDialogOpen] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);

  // Queries
  const { data: wallets = [] } = useQuery<any[]>({ queryKey: ["/api/wallets"] });
  const { data: categories = [] } = useQuery<any[]>({ queryKey: ["/api/categories"] });
  const { data: settings = {} } = useQuery<any>({ queryKey: ["/api/settings"] });
  const { data: transactions = [] } = useQuery<any[]>({ queryKey: ["/api/transactions"] });

  // Mutations for settings
  const updateSettingsMutation = useMutation({
    mutationFn: (updates: any) => apiRequest("PUT", "/api/settings", updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings updated successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error updating settings", 
        description: error?.message || "Failed to update settings",
        variant: "destructive" 
      });
    },
  });

  // Wallet form
  const walletForm = useForm<z.infer<typeof walletFormSchema>>({
    resolver: zodResolver(walletFormSchema),
    defaultValues: {
      name: "",
      type: "cash",
      balance: "0",
    },
  });


  // Wallet mutations
  const createWalletMutation = useMutation({
    mutationFn: (wallet: any) => apiRequest("POST", "/api/wallets", wallet),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      setIsWalletDialogOpen(false);
      walletForm.reset();
      toast({ title: "Wallet created successfully" });
    },
  });

  const updateWalletMutation = useMutation({
    mutationFn: ({ id, ...wallet }: any) => apiRequest("PUT", `/api/wallets/${id}`, wallet),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      setIsWalletDialogOpen(false);
      setSelectedWallet(null);
      walletForm.reset();
      toast({ title: "Wallet updated successfully" });
    },
  });

  const deleteWalletMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/wallets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      setIsDeleteDialogOpen(false);
      setWalletToDelete(null);
      toast({ title: "Wallet deleted successfully" });
    },
  });

  const adjustBalanceMutation = useMutation({
    mutationFn: ({ id, newBalance }: { id: string; newBalance: string }) =>
      apiRequest("POST", `/api/wallets/${id}/adjust-balance`, { newBalance, createTransaction: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({ title: "Balance adjusted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error adjusting balance",
        description: error?.message || "Failed to adjust balance",
        variant: "destructive"
      });
    },
  });

  const onWalletSubmit = (data: z.infer<typeof walletFormSchema>) => {
    if (selectedWallet) {
      // Check if balance has changed
      const balanceChanged = data.balance !== selectedWallet.balance;

      // Update wallet name and type
      updateWalletMutation.mutate(
        {
          name: data.name,
          type: data.type,
          id: selectedWallet.id
        },
        {
          onSuccess: () => {
            // If balance changed, adjust it
            if (balanceChanged) {
              adjustBalanceMutation.mutate({
                id: selectedWallet.id,
                newBalance: data.balance
              });
            }
            setIsWalletDialogOpen(false);
            setSelectedWallet(null);
            walletForm.reset();
          }
        }
      );
    } else {
      createWalletMutation.mutate(data);
    }
  };

  const handleDeleteWallet = () => {
    if (walletToDelete) {
      deleteWalletMutation.mutate(walletToDelete.id);
    }
  };

  const handleLogout = () => {
    // First logout from API, then redirect to landing page
    fetch('/api/logout', { method: 'POST' })
      .then(() => {
        window.location.href = '/';
      })
      .catch(() => {
        window.location.href = '/';
      });
  };

  const handleExportData = async () => {
    try {
      setIsExporting(true);

      // Track export in Umami
      if (window.umami) {
        window.umami.track('data_exported');
      }

      const response = await fetch('/api/export', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Create a blob from the response
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `budgettier-data-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Data exported successfully",
        description: "Your data has been downloaded as a CSV file",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export your data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== "DELETE") {
      toast({
        title: "Please type DELETE to confirm",
        variant: "destructive",
      });
      return;
    }

    try {
      // Track account deletion in Umami
      if (window.umami) {
        window.umami.track('account_deleted');
      }

      const response = await fetch('/api/account', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirmationText: deleteConfirmation }),
      });

      if (!response.ok) {
        throw new Error('Delete failed');
      }

      toast({
        title: "Account deleted",
        description: "Your account and all data have been permanently deleted",
      });

      // Redirect to landing page after 2 seconds
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (error) {
      toast({
        title: "Deletion failed",
        description: "Failed to delete your account. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCleanData = async () => {
    try {
      setIsCleaning(true);

      // Track clean data in Umami
      if (window.umami) {
        window.umami.track('data_cleaned');
      }

      const response = await fetch('/api/account/clean', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Clean failed');
      }

      // Invalidate all queries to refresh the data
      queryClient.invalidateQueries();

      toast({
        title: "Data cleaned successfully",
        description: "Your account has been reset to default state",
      });

      setIsCleanDataDialogOpen(false);

      // Reload the page after 1 second to show clean state
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      toast({
        title: "Clean failed",
        description: "Failed to clean your data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCleaning(false);
    }
  };


  const tabs = [
    { id: "general", label: "General", icon: User },
    { id: "wallets", label: "Wallets", icon: Wallet },
    { id: "categories", label: "Categories", icon: Tags },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "database", label: "Database", icon: Database },
    { id: "rules", label: "Auto-categorize", icon: Sparkles },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case "general":
        return (
          <div className="space-y-4">
            {/* Account Management Panel */}
            <div
              className="bg-white"
              style={{
                width: '100%',
                borderRadius: '20px',
              }}
            >
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #F3F4F6' }} className="sm:p-[15px_20px]">
                <h2 style={{ fontFamily: 'Inter', fontSize: '20px', fontWeight: 500, color: '#000' }} className="sm:text-2xl">
                  Account Management
                </h2>
              </div>
              <div style={{ padding: '12px 16px' }} className="sm:p-[15px_20px]">
                <ProfileSettings />

                {/* Account Actions */}
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                  {/* Export Data Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    style={{
                      height: '35px',
                      padding: '0 16px',
                      borderRadius: '30px',
                      fontSize: '12px',
                      fontWeight: 500,
                      width: '100%',
                    }}
                    className="hover:bg-gray-50 sm:w-auto"
                    onClick={handleExportData}
                    disabled={isExporting}
                    data-testid="button-export-data"
                  >
                    <Download className="h-3.5 w-3.5 mr-2" />
                    {isExporting ? "Exporting..." : "Export Data"}
                  </Button>

                  {/* Clean Data Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    style={{
                      height: '35px',
                      padding: '0 16px',
                      borderRadius: '30px',
                      fontSize: '12px',
                      fontWeight: 500,
                      width: '100%',
                    }}
                    className="hover:bg-gray-50 sm:w-auto"
                    onClick={() => setIsCleanDataDialogOpen(true)}
                    data-testid="button-clean-data"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-2" />
                    Clean Data
                  </Button>

                  {/* Delete Account Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    style={{
                      height: '35px',
                      padding: '0 16px',
                      borderRadius: '30px',
                      fontSize: '12px',
                      fontWeight: 500,
                      width: '100%',
                      borderColor: '#EF4444',
                      color: '#EF4444'
                    }}
                    className="hover:bg-red-50 sm:w-auto"
                    onClick={() => setIsDeleteAccountDialogOpen(true)}
                    data-testid="button-delete-account"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Delete Account
                  </Button>

                  {/* Logout Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    style={{
                      height: '35px',
                      padding: '0 16px',
                      borderRadius: '30px',
                      fontSize: '12px',
                      fontWeight: 500,
                      width: '100%',
                    }}
                    className="hover:bg-gray-50 sm:w-auto"
                    onClick={handleLogout}
                    data-testid="button-logout"
                  >
                    <LogOut className="h-3.5 w-3.5 mr-2" />
                    Log Out
                  </Button>
                </div>
              </div>
            </div>

            {/* Support & Community Panel */}
            <div
              className="bg-white sm:p-[15px_20px] sm:rounded-[20px]"
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '16px',
              }}
            >
              <p style={{ fontFamily: 'Inter', fontSize: '14px', fontWeight: 400, color: '#6B7280', marginBottom: '10px' }} className="sm:text-[15px] sm:mb-3">
                Support & Community
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  style={{
                    height: '30px',
                    padding: '0 10px',
                    borderRadius: '30px',
                    fontSize: '11px',
                    fontWeight: 500
                  }}
                  className="sm:h-8 sm:px-3 sm:text-xs"
                  onClick={() => window.open('https://chat.whatsapp.com/FtYrWNPOsRi8XWIgQSVdsp', '_blank')}
                  data-testid="button-whatsapp-community"
                >
                  <MessageCircle className="h-3 w-3 mr-1 sm:h-3.5 sm:w-3.5 sm:mr-1.5" />
                  WhatsApp Community
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  style={{
                    height: '30px',
                    padding: '0 10px',
                    borderRadius: '30px',
                    fontSize: '11px',
                    fontWeight: 500
                  }}
                  className="sm:h-8 sm:px-3 sm:text-xs"
                  onClick={() => window.open('https://www.instagram.com/budgettier?igsh=MTRtdm9hN3N1bXdvMA%3D%3D&utm_source=qr', '_blank')}
                  data-testid="button-instagram"
                >
                  <Instagram className="h-3 w-3 mr-1 sm:h-3.5 sm:w-3.5 sm:mr-1.5" />
                  Instagram
                </Button>
              </div>
            </div>
          </div>
        );

      case "wallets":
        return (
          <div className="space-y-4">
            {/* Currency Settings Panel */}
            <div
              className="bg-white"
              style={{
                width: '100%',
                borderRadius: '20px',
              }}
            >
              <div style={{ padding: '15px 20px', borderBottom: '1px solid #F3F4F6' }}>
                <h2 style={{ fontFamily: 'Inter', fontSize: '24px', fontWeight: 500, color: '#000' }}>
                  Currency Settings
                </h2>
              </div>
              <div style={{ padding: '15px 20px' }}>
                <Label htmlFor="currency" style={{ fontFamily: 'Inter', fontSize: '14px', fontWeight: 500, color: '#000' }}>Default Currency</Label>
                <Select
                  value={settings?.currency || "USD"}
                  onValueChange={(value) => updateSettingsMutation.mutate({ currency: value })}
                >
                  <SelectTrigger className="mt-2" style={{ height: '40px' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">US Dollar (USD)</SelectItem>
                    <SelectItem value="EUR">Euro (EUR)</SelectItem>
                    <SelectItem value="GBP">British Pound (GBP)</SelectItem>
                    <SelectItem value="JPY">Japanese Yen (JPY)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Priority Wallet Panel */}
            <div
              className="bg-white"
              style={{
                width: '100%',
                borderRadius: '20px',
              }}
            >
              <div style={{ padding: '15px 20px', borderBottom: '1px solid #F3F4F6' }}>
                <h2 style={{ fontFamily: 'Inter', fontSize: '24px', fontWeight: 500, color: '#000' }}>
                  Priority Wallet
                </h2>
              </div>
              <div style={{ padding: '15px 20px' }}>
                <Label htmlFor="priorityWallet" style={{ fontFamily: 'Inter', fontSize: '14px', fontWeight: 500, color: '#000' }}>
                  Default Wallet for Transactions
                </Label>
                <p style={{ fontFamily: 'Inter', fontSize: '12px', fontWeight: 400, color: '#6B7280', marginTop: '4px', marginBottom: '8px' }}>
                  This wallet will be pre-selected when creating new transactions
                </p>
                <Select
                  value={settings?.defaultWalletId || "none"}
                  onValueChange={(value) => updateSettingsMutation.mutate({ defaultWalletId: value === "none" ? null : value })}
                >
                  <SelectTrigger className="mt-2" style={{ height: '40px' }}>
                    <SelectValue placeholder="Select a wallet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Priority Wallet</SelectItem>
                    {wallets.map((wallet: any) => (
                      <SelectItem key={wallet.id} value={wallet.id}>
                        {wallet.name} ({wallet.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Wallet Management Panel */}
            <div
              className="bg-white"
              style={{
                width: '100%',
                borderRadius: '20px',
              }}
            >
              <div style={{ padding: '15px 20px', borderBottom: '1px solid #F3F4F6' }}>
                <div className="flex items-center justify-between">
                  <h2 style={{ fontFamily: 'Inter', fontSize: '24px', fontWeight: 500, color: '#000' }}>
                    Wallets
                  </h2>
                  <Dialog open={isWalletDialogOpen} onOpenChange={setIsWalletDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        style={{
                          height: '35px',
                          padding: '0 16px',
                          borderRadius: '30px',
                          backgroundColor: '#000',
                          color: '#fff',
                          fontFamily: 'Inter',
                          fontSize: '12px',
                          fontWeight: 500
                        }}
                        className="hover:bg-gray-800"
                        onClick={() => {
                          setSelectedWallet(null);
                          walletForm.reset();
                        }}
                        data-testid="button-add-wallet"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Wallet
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{selectedWallet ? "Edit" : "Add"} Wallet</DialogTitle>
                      </DialogHeader>
                      <Form {...walletForm}>
                        <form onSubmit={walletForm.handleSubmit(onWalletSubmit)} className="space-y-4">
                          <FormField
                            control={walletForm.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Name</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="e.g., Main Account" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={walletForm.control}
                            name="type"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Type</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="cash">Cash</SelectItem>
                                    <SelectItem value="bank">Bank Account</SelectItem>
                                    <SelectItem value="credit">Credit Card</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={walletForm.control}
                            name="balance"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  {selectedWallet ? "Current Balance" : "Initial Balance"}
                                </FormLabel>
                                <FormControl>
                                  <Input {...field} type="number" step="0.01" placeholder="0.00" />
                                </FormControl>
                                {selectedWallet && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    Adjust the balance to match your actual account. A transaction will be created for the difference.
                                  </p>
                                )}
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          {selectedWallet ? (
                            <div className="flex gap-3">
                              <Button type="submit" className="flex-1">
                                Update Wallet
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  setIsWalletDialogOpen(false);
                                  setWalletToDelete(selectedWallet);
                                  setIsDeleteDialogOpen(true);
                                }}
                                className="px-4 hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                                title="Delete wallet"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button type="submit" className="w-full">
                              Create Wallet
                            </Button>
                          )}
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              <div style={{ padding: '15px 20px' }}>
                <div className="space-y-2">
                  {wallets.map((wallet: any) => (
                    <div
                      key={wallet.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
                      onClick={() => {
                        setSelectedWallet(wallet);
                        walletForm.reset({
                          name: wallet.name,
                          type: wallet.type,
                          balance: wallet.balance
                        });
                        setIsWalletDialogOpen(true);
                      }}
                      data-testid={`edit-wallet-${wallet.id}`}
                    >
                      <div className="flex items-center gap-3">
                        {wallet.type === "cash" && <DollarSign className="h-5 w-5 text-green-600" />}
                        {wallet.type === "bank" && <Wallet className="h-5 w-5 text-blue-600" />}
                        {wallet.type === "credit" && <CreditCard className="h-5 w-5 text-purple-600" />}
                        <div>
                          <div style={{ fontFamily: 'Inter', fontSize: '14px', fontWeight: 500, color: '#000' }}>{wallet.name}</div>
                          <div style={{ fontFamily: 'Inter', fontSize: '12px', fontWeight: 400, color: '#6B7280', textTransform: 'capitalize' }}>{wallet.type}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpeningWallet(wallet);
                          }}
                          style={{
                            fontFamily: 'Inter',
                            fontSize: '11px',
                            fontWeight: 500,
                            color: '#6B7280',
                            padding: '4px 10px',
                            border: '1px solid #E5E7EB',
                            borderRadius: '20px',
                            backgroundColor: '#fff',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                          className="hover:bg-gray-100"
                        >
                          Opening balance
                        </button>
                        <span style={{ fontFamily: 'Inter', fontSize: '14px', fontWeight: 600, color: '#000' }}>{formatCurrency(parseFloat(wallet.balance))}</span>
                      </div>
                    </div>
                  ))}

                  {/* Start Sum Card - Show when no transactions and all wallets have zero balance */}
                  {transactions.filter(t => t.description !== "Balance adjustment").length === 0 &&
                   wallets.every(w => parseFloat(w.balance || '0') === 0) && (
                    <div
                      className="p-4 bg-gradient-to-br from-purple-50 to-violet-50 border-2 border-purple-200 rounded-xl hover:shadow-md transition-all cursor-pointer"
                      onClick={() => setIsStartingBalanceDialogOpen(true)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                            <DollarSign className="h-5 w-5 text-purple-600" />
                          </div>
                          <div>
                            <h4 style={{ fontFamily: 'Inter', fontSize: '14px', fontWeight: 600, color: '#000' }}>Start Sum</h4>
                            <p style={{ fontFamily: 'Inter', fontSize: '12px', fontWeight: 400, color: '#6B7280' }}>Set up your starting balance</p>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-purple-600" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      case "categories":
        return (
          <div className="space-y-4">
            {/* Categories Management Panel */}
            <div
              className="bg-white"
              style={{
                width: '100%',
                borderRadius: '20px',
              }}
            >
              <div style={{ padding: '15px 20px', borderBottom: '1px solid #F3F4F6' }}>
                <div className="flex items-center justify-between mb-3">
                  <h2 style={{ fontFamily: 'Inter', fontSize: '24px', fontWeight: 500, color: '#000' }}>
                    Categories
                  </h2>
                </div>

                {/* Category Type Toggle */}
                <div className="flex">
                  <button
                    onClick={() => setCategoryType("expense")}
                    style={{
                      width: '100px',
                      height: '35px',
                      backgroundColor: categoryType === "expense" ? '#F3F4F6' : '#fff',
                      border: '1px solid #F3F4F6',
                      borderRadius: '30px 0 0 30px',
                      fontFamily: 'Inter',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#000',
                      cursor: 'pointer'
                    }}
                    className="hover:bg-gray-50"
                    data-testid="tab-expense-categories"
                  >
                    Expense
                  </button>
                  <button
                    onClick={() => setCategoryType("income")}
                    style={{
                      width: '100px',
                      height: '35px',
                      backgroundColor: categoryType === "income" ? '#F3F4F6' : '#fff',
                      border: '1px solid #F3F4F6',
                      borderRadius: '0 30px 30px 0',
                      fontFamily: 'Inter',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#000',
                      cursor: 'pointer'
                    }}
                    className="hover:bg-gray-50"
                    data-testid="tab-income-categories"
                  >
                    Income
                  </button>
                </div>
              </div>
              <div style={{ padding: '15px 20px' }}>
                <CategoryGroups type={categoryType} />
              </div>
            </div>
          </div>
        );

      case "notifications":
        return (
          <div className="space-y-4">
            {/* Email Notifications Panel */}
            <div
              className="bg-white"
              style={{
                width: '100%',
                borderRadius: '20px',
              }}
            >
              <div style={{ padding: '15px 20px', borderBottom: '1px solid #F3F4F6' }}>
                <h2 style={{ fontFamily: 'Inter', fontSize: '24px', fontWeight: 500, color: '#000' }}>
                  Email Notifications
                </h2>
              </div>
              <div style={{ padding: '15px 20px' }}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <Label htmlFor="monthlyReports" className="text-sm sm:text-base font-medium">Monthly Reports</Label>
                      <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">Receive monthly spending summaries</p>
                    </div>
                    <Switch
                      id="monthlyReports"
                      checked={settings?.monthlyReports || false}
                      onCheckedChange={(checked) => updateSettingsMutation.mutate({ monthlyReports: checked })}
                      data-testid="switch-monthly-reports"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <Label htmlFor="weeklySummaries" className="text-sm sm:text-base font-medium">Weekly Summaries</Label>
                      <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">Get weekly spending updates</p>
                    </div>
                    <Switch
                      id="weeklySummaries"
                      checked={settings?.weeklySummaries || false}
                      onCheckedChange={(checked) => updateSettingsMutation.mutate({ weeklySummaries: checked })}
                      data-testid="switch-weekly-summaries"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Spending Warnings Panel */}
            <div
              className="bg-white"
              style={{
                width: '100%',
                borderRadius: '20px',
              }}
            >
              <div style={{ padding: '15px 20px', borderBottom: '1px solid #F3F4F6' }}>
                <h2 style={{ fontFamily: 'Inter', fontSize: '24px', fontWeight: 500, color: '#000' }}>
                  Spending Warnings
                </h2>
              </div>
              <div style={{ padding: '15px 20px' }}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <Label htmlFor="budgetAlerts" className="text-sm sm:text-base font-medium">Budget Alerts</Label>
                      <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">Get notified when approaching budget limits</p>
                    </div>
                    <Switch
                      id="budgetAlerts"
                      checked={settings?.budgetAlerts || false}
                      onCheckedChange={(checked) => updateSettingsMutation.mutate({ budgetAlerts: checked })}
                      data-testid="switch-budget-alerts"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <Label htmlFor="spendingAlerts" className="text-sm sm:text-base font-medium">Large Expense Alerts</Label>
                      <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">Get notified for large expenses</p>
                    </div>
                    <Switch
                      id="spendingAlerts"
                      checked={settings?.spendingAlerts || false}
                      onCheckedChange={(checked) => updateSettingsMutation.mutate({ spendingAlerts: checked })}
                      data-testid="switch-spending-alerts"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case "database":
        return (
          <div className="space-y-4">
            <DatabaseSection />
          </div>
        );

      case "rules":
        return (
          <div className="space-y-4">
            <AutoCategorizationSection />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex-1 pb-20 md:pb-0" style={{ backgroundColor: '#F3F4F6' }}>
      <ResponsiveContainer className="py-10">

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <style>{`
            .scrollbar-hide::-webkit-scrollbar {
              display: none;
            }
          `}</style>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  minHeight: '48px',
                  padding: '0 16px',
                  backgroundColor: activeTab === tab.id ? '#000' : 'transparent',
                  color: activeTab === tab.id ? '#fff' : '#000',
                  border: 'none',
                  borderRadius: '30px',
                  fontFamily: 'Inter',
                  fontSize: '14px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
                className={activeTab === tab.id ? '' : 'hover:bg-gray-100'}
                data-testid={`button-tab-${tab.id}`}
              >
                <Icon className="h-5 w-5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div style={{ marginTop: '14px' }}>{renderTabContent()}</div>
      </ResponsiveContainer>


      {/* Delete Wallet Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Delete Wallet
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5" />
                <div className="text-sm text-red-800">
                  <p className="font-medium mb-1">This action cannot be undone.</p>
                  <p>You are about to permanently delete the wallet "{walletToDelete?.name}" with a balance of ${walletToDelete?.balance}. This action is permanent and cannot be undone.</p>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3">
              <Button 
                variant="outline" 
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  setWalletToDelete(null);
                }}
                disabled={deleteWalletMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={handleDeleteWallet}
                disabled={deleteWalletMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
                data-testid="button-confirm-delete-wallet"
              >
                {deleteWalletMutation.isPending ? "Deleting..." : "Delete Wallet"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clean Data Confirmation Dialog */}
      <Dialog open={isCleanDataDialogOpen} onOpenChange={setIsCleanDataDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Clean Account Data
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium mb-2">This will reset your account to default state</p>
                  <p className="mb-2">Cleaning your data will remove:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>All your transactions</li>
                    <li>All your wallets (replaced with defaults)</li>
                    <li>All custom categories (replaced with defaults)</li>
                    <li>All your budgets and budget plans</li>
                    <li>Your account settings</li>
                  </ul>
                  <p className="mt-2 font-medium">Your account will remain active with default wallets and categories.</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => setIsCleanDataDialogOpen(false)}
                disabled={isCleaning}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCleanData}
                disabled={isCleaning}
                className="bg-mono-black hover:bg-mono-gray-900"
                data-testid="button-confirm-clean-data"
              >
                {isCleaning ? "Cleaning..." : "Clean Data"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={isDeleteAccountDialogOpen} onOpenChange={setIsDeleteAccountDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Delete Account Permanently
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5" />
                <div className="text-sm text-red-800">
                  <p className="font-medium mb-2">Warning: This action cannot be undone!</p>
                  <p className="mb-2">Deleting your account will permanently remove:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>All your transactions</li>
                    <li>All your wallets</li>
                    <li>All your categories and budgets</li>
                    <li>Your account settings</li>
                    <li>All other personal data</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="delete-confirmation" className="text-sm font-medium">
                Type <span className="font-mono font-bold">DELETE</span> to confirm
              </Label>
              <Input
                id="delete-confirmation"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder="Type DELETE"
                className="font-mono"
              />
            </div>

            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => {
                  setIsDeleteAccountDialogOpen(false);
                  setDeleteConfirmation("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmation !== "DELETE"}
                className="bg-red-600 hover:bg-red-700"
                data-testid="button-confirm-delete-account"
              >
                Delete Account Permanently
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Starting Balance Dialog */}
      <StartingBalanceDialog
        isOpen={isStartingBalanceDialogOpen}
        onClose={() => setIsStartingBalanceDialogOpen(false)}
      />

      {/* Opening Balance Dialog */}
      {openingWallet && (
        <OpeningBalanceDialog
          open={!!openingWallet}
          onClose={() => setOpeningWallet(null)}
          walletId={openingWallet.id}
          walletName={openingWallet.name}
        />
      )}
    </div>
  );
}