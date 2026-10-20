// Settings → General: currency, default wallet, app version and updates.

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";
import { apiCall } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { checkForUpdates } from "@/lib/updater";
import { SettingsCard, SettingsRow } from "./settings-ui";

const CURRENCIES = [
  ["EUR", "Euro (EUR)"],
  ["USD", "US Dollar (USD)"],
  ["GBP", "British Pound (GBP)"],
  ["UAH", "Ukrainian Hryvnia (UAH)"],
  ["JPY", "Japanese Yen (JPY)"],
];

export default function GeneralSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: settings = {} } = useQuery<any>({ queryKey: ["/api/settings"] });
  const { data: wallets = [] } = useQuery<any[]>({ queryKey: ["/api/wallets"] });
  const [version, setVersion] = useState("");
  const [updateState, setUpdateState] = useState<"idle" | "checking" | "up-to-date">("idle");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion(""));
  }, []);

  const updateSettings = useMutation({
    mutationFn: (updates: any) => apiCall("PUT", "/api/settings", updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings"] }),
    onError: (error: any) =>
      toast({ title: "Couldn't save setting", description: String(error?.message || error), variant: "destructive" }),
  });

  const handleCheckUpdates = async () => {
    setUpdateState("checking");
    try {
      const result = await checkForUpdates();
      setUpdateState(result === "up-to-date" ? "up-to-date" : "idle");
    } catch (err: any) {
      setUpdateState("idle");
      toast({ title: "Couldn't check for updates", description: "Check your internet connection and try again.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <SettingsCard title="Preferences">
        <SettingsRow label="Currency" hint="Used for all amounts in the app">
          <Select
            value={settings?.currency || "EUR"}
            onValueChange={(value) => updateSettings.mutate({ currency: value })}
          >
            <SelectTrigger style={{ width: 220, height: 38 }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(([code, label]) => (
                <SelectItem key={code} value={code}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow label="Default wallet" hint="Pre-selected when you add a transaction">
          <Select
            value={settings?.defaultWalletId || "none"}
            onValueChange={(value) => updateSettings.mutate({ defaultWalletId: value === "none" ? null : value })}
          >
            <SelectTrigger style={{ width: 220, height: 38 }}>
              <SelectValue placeholder="Select a wallet" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {wallets.map((wallet: any) => (
                <SelectItem key={wallet.id} value={wallet.id}>{wallet.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard title="App">
        <SettingsRow
          label={version ? `Budgettier ${version}` : "Budgettier"}
          hint={
            updateState === "up-to-date"
              ? "You're on the latest version"
              : "Updates are checked automatically when the app starts"
          }
        >
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheckUpdates}
            disabled={updateState === "checking"}
            style={{ borderRadius: 30 }}
          >
            {updateState === "checking" ? "Checking…" : "Check for updates"}
          </Button>
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}
