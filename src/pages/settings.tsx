import { useState } from "react";
import { Database, Settings2, Sparkles, Tags, Wallet } from "lucide-react";
import ResponsiveContainer from "@/components/layout/responsive-container";
import GeneralSection from "@/components/settings/general-section";
import WalletsSection from "@/components/settings/wallets-section";
import CategoryGroups from "@/components/settings/category-groups";
import AutoCategorizationSection from "@/components/settings/auto-categorization";
import DataSection from "@/components/settings/data-section";
import { SettingsCard } from "@/components/settings/settings-ui";

const TABS = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "wallets", label: "Wallets", icon: Wallet },
  { id: "categories", label: "Categories", icon: Tags },
  { id: "rules", label: "Rules", icon: Sparkles },
  { id: "data", label: "Data", icon: Database },
] as const;
type TabId = (typeof TABS)[number]["id"];

// Tabs from earlier versions that were renamed or folded into another tab.
const LEGACY_TABS: Record<string, TabId> = { database: "data", notifications: "general" };

function initialTab(): TabId {
  try {
    const saved = localStorage.getItem("settingsActiveTab") ?? "";
    const tab = LEGACY_TABS[saved] ?? saved;
    return TABS.some((t) => t.id === tab) ? (tab as TabId) : "general";
  } catch {
    return "general";
  }
}

export default function SettingsPage() {
  const [activeTab, setActiveTabState] = useState<TabId>(initialTab);
  const [categoryType, setCategoryType] = useState<"income" | "expense">("expense");

  const setActiveTab = (tab: TabId) => {
    setActiveTabState(tab);
    try {
      localStorage.setItem("settingsActiveTab", tab);
    } catch {
      // Remembering the tab is a convenience; ignore storage errors.
    }
  };

  return (
    <div className="flex-1 pb-20 md:pb-0" style={{ backgroundColor: "#F3F4F6" }}>
      <ResponsiveContainer className="py-10">
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                minHeight: 48,
                padding: "0 16px",
                backgroundColor: activeTab === id ? "#000" : "transparent",
                color: activeTab === id ? "#fff" : "#000",
                border: "none",
                borderRadius: 30,
                fontFamily: "Inter",
                fontSize: 14,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                transition: "all 0.2s",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
              className={activeTab === id ? "" : "hover:bg-gray-100"}
              data-testid={`button-tab-${id}`}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          {activeTab === "general" && <GeneralSection />}
          {activeTab === "wallets" && <WalletsSection />}
          {activeTab === "categories" && (
            <SettingsCard
              title="Categories"
              action={
                <div className="flex">
                  {(["expense", "income"] as const).map((type, i) => (
                    <button
                      key={type}
                      onClick={() => setCategoryType(type)}
                      style={{
                        width: 100,
                        height: 35,
                        backgroundColor: categoryType === type ? "#F3F4F6" : "#fff",
                        border: "1px solid #F3F4F6",
                        borderLeft: i === 1 ? "none" : undefined,
                        borderRadius: i === 0 ? "30px 0 0 30px" : "0 30px 30px 0",
                        fontFamily: "Inter",
                        fontSize: 12,
                        fontWeight: 500,
                        color: "#000",
                        cursor: "pointer",
                      }}
                      className="hover:bg-gray-50"
                    >
                      {type === "expense" ? "Expense" : "Income"}
                    </button>
                  ))}
                </div>
              }
            >
              <div style={{ padding: "11px 0" }}>
                <CategoryGroups type={categoryType} />
              </div>
            </SettingsCard>
          )}
          {activeTab === "rules" && <AutoCategorizationSection />}
          {activeTab === "data" && <DataSection />}
        </div>
      </ResponsiveContainer>
    </div>
  );
}
