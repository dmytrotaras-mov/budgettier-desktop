import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Wallet, BarChart3, Settings, User, LogOut, BookOpen, Sparkles, Lightbulb, PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { type User as UserType } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import StartingBalanceDialog from "@/components/wallets/starting-balance-dialog";

const navigation = [
  { name: "Budget", href: "/budget", icon: Wallet },
  { name: "Overview", href: "/overview", icon: BarChart3 },
  { name: "Guides", href: "/guides", icon: BookOpen },
  { name: "Settings", href: "/settings", icon: Settings },
];

function UserProfileSection({ isCollapsed }: { isCollapsed: boolean }) {
  // Phase 2: stripped — no auth/upgrade/logout in the desktop app.
  const { user } = useAuth();
  if (!user) return null;
  const initial = (user.firstName?.[0] || user.email?.[0] || "U").toUpperCase();
  if (isCollapsed) {
    return (
      <div className="px-3 pb-4 flex justify-center">
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-700">
          {initial}
        </div>
      </div>
    );
  }
  return (
    <div className="px-4 pb-4 flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-700">
        {initial}
      </div>
      <div className="text-sm text-gray-700 truncate">{user.firstName || user.email}</div>
    </div>
  );
}

export default function Sidebar() {
  const [location] = useLocation();
  const [isStartingBalanceDialogOpen, setIsStartingBalanceDialogOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === 'true';
  });
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1300);

  // Auto-expand/collapse sidebar at 1300px breakpoint
  useEffect(() => {
    const handleResize = () => {
      const desktop = window.innerWidth >= 1300;
      setIsDesktop(desktop);

      if (desktop) {
        // Auto-expand on desktop
        setIsCollapsed(false);
      } else {
        // Auto-collapse below 1300px
        setIsCollapsed(true);
      }
    };

    // Check on mount
    handleResize();

    // Listen for resize events
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Save collapsed state to localStorage
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(isCollapsed));
  }, [isCollapsed]);

  const { data: wallets = [] } = useQuery<any[]>({ queryKey: ["/api/wallets"] });
  const { data: transactions = [] } = useQuery<any[]>({ queryKey: ["/api/transactions"] });

  // Check if we should show the PRO tip card
  const nonAdjustmentTransactions = transactions.filter(t => t.description !== "Balance adjustment");
  const shouldShowProTip = nonAdjustmentTransactions.length === 0 && wallets.every(w => parseFloat(w.balance || '0') === 0);

  const handleExpandClick = () => {
    if (isCollapsed) {
      setIsCollapsed(false);
    }
  };

  return (
    <TooltipProvider>
      <div
        className="hidden md:flex md:flex-col"
        style={{
          width: isCollapsed ? '70px' : (isDesktop ? '240px' : '170px'),
          transition: 'width 300ms ease-in-out',
          cursor: isCollapsed ? 'ew-resize' : 'default'
        }}
        onClick={handleExpandClick}
      >
        {/* Fixed Header with Logo and Toggle Button */}
        <div
          className="flex-shrink-0 flex items-center gap-3 px-3 py-6"
          style={{
            backgroundColor: '#F3F4F6',
            height: '76px',
            position: 'relative',
            overflow: 'visible'
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }}
            className="group"
            style={{
              width: '44px',
              height: '44px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <PanelLeft size={20} className="opacity-75 group-hover:opacity-100" style={{ color: '#4B5563', transition: 'opacity 0.2s' }} />
          </button>
          <span
            style={{
              fontFamily: 'Inter',
              fontSize: '20px',
              fontWeight: 500,
              color: '#000',
              whiteSpace: 'nowrap',
              position: 'relative',
              zIndex: 1,
              opacity: isCollapsed ? 0 : 1,
              transition: 'opacity 200ms ease-in-out',
              pointerEvents: isCollapsed ? 'none' : 'auto'
            }}
          >
            Budgettier
          </span>
        </div>

        <div
          className="flex flex-col flex-grow"
          style={{
            backgroundColor: '#F3F4F6',
            transition: 'background-color 300ms ease-in-out'
          }}
        >
          {/* Navigation */}
          <nav className="flex-1 px-3 py-6 space-y-2" style={{ backgroundColor: '#F3F4F6' }}>
            {navigation.map((item) => {
              const isActive = location === item.href;
              const Icon = item.icon;

              return (
                <Tooltip key={item.name} delayDuration={0}>
                  <TooltipTrigger asChild disabled={!isCollapsed}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex items-center py-3 px-4 text-sm font-medium rounded-xl transition-all duration-200",
                        isActive
                          ? "bg-white text-gray-900"
                          : "text-gray-600 hover:text-gray-900 hover:bg-white"
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div style={{ width: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon className="w-5 h-5 opacity-75 group-hover:opacity-100" style={{ transition: 'opacity 200ms' }} />
                      </div>
                      <div
                        className="whitespace-nowrap overflow-hidden"
                        style={{
                          opacity: isCollapsed ? 0 : 1,
                          maxWidth: isCollapsed ? '0px' : '200px',
                          marginLeft: isCollapsed ? '0px' : '12px',
                          transition: 'opacity 200ms ease-in-out, max-width 200ms ease-in-out, margin-left 200ms ease-in-out',
                          pointerEvents: isCollapsed ? 'none' : 'auto'
                        }}
                      >
                        <span className="font-medium">{item.name}</span>
                      </div>
                    </Link>
                  </TooltipTrigger>
                  {isCollapsed && (
                    <TooltipContent side="right">
                      <p>{item.name}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </nav>

          {/* PRO Tip Card */}
          {shouldShowProTip && (
            <div className={isCollapsed ? "px-3 pb-4" : "px-4 pb-4"}>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild disabled={!isCollapsed}>
                  <div
                    onClick={() => setIsStartingBalanceDialogOpen(true)}
                    className={`cursor-pointer transition-all duration-200 ${
                      isCollapsed
                        ? "group flex items-center justify-center py-3 px-4 text-sm font-medium rounded-xl text-gray-600 hover:text-gray-900 hover:bg-white w-full"
                        : "bg-white hover:shadow-md transition-shadow"
                    }`}
                    style={isCollapsed ? {} : { borderRadius: '20px', padding: '16px' }}
                  >
                    {isCollapsed ? (
                      <div style={{ width: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Lightbulb className="w-5 h-5 opacity-75 group-hover:opacity-100" style={{ transition: 'opacity 200ms' }} />
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <Lightbulb className="w-5 h-5 text-black flex-shrink-0 mt-0.5" />
                        <div
                          style={{
                            opacity: isCollapsed ? 0 : 1,
                            transition: 'opacity 200ms ease-in-out 200ms',
                            pointerEvents: isCollapsed ? 'none' : 'auto'
                          }}
                        >
                          <h4 style={{ fontFamily: 'Inter', fontSize: '14px', fontWeight: 600, color: '#000', marginBottom: '4px', whiteSpace: 'nowrap' }}>
                            PRO tip
                          </h4>
                          <p style={{ fontFamily: 'Inter', fontSize: '12px', fontWeight: 400, color: '#000', whiteSpace: 'nowrap' }}>
                            Add your starting balance
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                {isCollapsed && (
                  <TooltipContent side="right">
                    <p>PRO tip: Add your starting balance</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </div>
          )}

          {/* User Profile */}
          <UserProfileSection isCollapsed={isCollapsed} />
        </div>

        {/* Starting Balance Dialog */}
        <StartingBalanceDialog
          isOpen={isStartingBalanceDialogOpen}
          onClose={() => setIsStartingBalanceDialogOpen(false)}
        />
      </div>
    </TooltipProvider>
  );
}
