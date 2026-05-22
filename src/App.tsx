import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { listen } from "@tauri-apps/api/event";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Sidebar from "@/components/layout/sidebar";

const BudgetPage = lazy(() => import("@/pages/budget"));
const OverviewPage = lazy(() => import("@/pages/overview-redesigned"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const NotFound = lazy(() => import("@/pages/not-found"));

const PageLoader = () => (
  <div className="flex h-screen items-center justify-center bg-white">
    <div className="text-mono-black">Loading...</div>
  </div>
);

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/budget" component={BudgetPage} />
        <Route path="/overview" component={OverviewPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/">
          <Redirect to="/budget" />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function MenuEventBridge() {
  const [, navigate] = useLocation();
  useEffect(() => {
    // ⌘, in the menu emits "menu:preferences" — open Settings.
    const unlistenPromise = listen("menu:preferences", () => {
      navigate("/settings");
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
    };
  }, [navigate]);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MenuEventBridge />
        <div className="flex h-screen bg-gray-50">
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <div
              className="flex-1 overflow-y-auto bg-[#f3f4f6]"
              style={{ scrollbarGutter: "stable" }}
            >
              <Router />
            </div>
          </div>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
