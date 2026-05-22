import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import type { Settings, Wallet } from "@shared/schema";

export default function GeneralSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ["/api/wallets"],
  });

  const [currency, setCurrency] = useState("USD");
  const [budgetPeriod, setBudgetPeriod] = useState("monthly");
  const [dateFormat, setDateFormat] = useState("MM/DD/YYYY");
  const [defaultWalletId, setDefaultWalletId] = useState<string>("");
  const [monthlyReports, setMonthlyReports] = useState(false);
  const [weeklySummaries, setWeeklySummaries] = useState(false);

  // Update local state when settings data loads
  React.useEffect(() => {
    if (settings && !isLoading) {
      setCurrency(settings.currency || "USD");
      setBudgetPeriod(settings.budgetPeriod || "monthly");
      setDateFormat(settings.dateFormat || "MM/DD/YYYY");
      setDefaultWalletId(settings.defaultWalletId || "");
      setMonthlyReports(settings.monthlyReports || false);
      setWeeklySummaries(settings.weeklySummaries || false);
    }
  }, [settings, isLoading]);

  const updateSettingsMutation = useMutation({
    mutationFn: (data: Partial<Settings>) => apiRequest("PATCH", "/api/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Success",
        description: "Settings updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update settings",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateSettingsMutation.mutate({
      currency,
      budgetPeriod,
      dateFormat,
      defaultWalletId: defaultWalletId || null,
      monthlyReports,
      weeklySummaries,
    });
  };

  if (isLoading) {
    return (
      <Card className="bg-mono-white border border-mono-gray-100 shadow-sm">
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-mono-white border border-mono-gray-100 shadow-sm">
      <CardHeader>
        <CardTitle>General Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Currency */}
          <div className="space-y-2">
            <Label htmlFor="currency" className="text-sm font-medium">Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD ($)</SelectItem>
              <SelectItem value="EUR">EUR (€)</SelectItem>
              <SelectItem value="GBP">GBP (£)</SelectItem>
              <SelectItem value="JPY">JPY (¥)</SelectItem>
            </SelectContent>
          </Select>
          </div>

          {/* Budget Period */}
          <div className="space-y-2">
            <Label htmlFor="budgetPeriod" className="text-sm font-medium">Budget Period</Label>
          <Select value={budgetPeriod} onValueChange={setBudgetPeriod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
          </div>
        </div>

        {/* Date Format */}
        <div className="space-y-2">
          <Label htmlFor="dateFormat" className="text-sm font-medium">Date Format</Label>
          <Select value={dateFormat} onValueChange={setDateFormat}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
              <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
              <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Default Wallet */}
        <div className="space-y-2">
          <Label htmlFor="defaultWallet" className="text-sm font-medium">Default Wallet</Label>
          <Select value={defaultWalletId} onValueChange={setDefaultWalletId}>
            <SelectTrigger>
              <SelectValue placeholder="Select default wallet" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No default (manual selection)</SelectItem>
              {wallets.map((wallet) => (
                <SelectItem key={wallet.id} value={wallet.id}>
                  {wallet.name} ({wallet.type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-mono-gray-500">
            This wallet will be automatically selected when adding new transactions.
          </p>
        </div>

        {/* Notifications */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Notifications</Label>
          
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="monthlyReports"
                checked={monthlyReports}
                onCheckedChange={(checked) => setMonthlyReports(checked === true)}
              />
              <Label htmlFor="monthlyReports" className="text-sm font-normal">
                Monthly budget reports
              </Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="weeklySummaries"
                checked={weeklySummaries}
                onCheckedChange={(checked) => setWeeklySummaries(checked === true)}
              />
              <Label htmlFor="weeklySummaries" className="text-sm font-normal">
                Weekly spending summaries
              </Label>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={updateSettingsMutation.isPending}
          size="sm"
          className="w-full bg-mono-black text-mono-white hover:bg-mono-gray-900"
        >
          {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}