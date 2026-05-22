import * as React from "react";
import { useState } from "react";
import { Search, WalletIcon, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Wallet } from "@shared/schema";

interface WalletSelectorProps {
  wallets: Wallet[];
  selectedWalletId?: string;
  onWalletSelect: (walletId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function WalletSelector({
  wallets,
  selectedWalletId,
  onWalletSelect,
  placeholder = "Select wallet...",
  disabled,
  className,
}: WalletSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isClosing, setIsClosing] = useState(false);

  const selectedWallet = wallets.find((w) => w.id === selectedWalletId);

  const filteredWallets = wallets.filter((wallet) =>
    wallet.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleWalletSelect = (walletId: string) => {
    onWalletSelect(walletId);
    handleClose();
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      setSearchQuery("");
    }, 300);
  };

  const formatBalance = (balance: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(balance);
  };

  return (
    <div className={cn("relative", className)}>
      {/* Trigger Button */}
      <Button
        type="button"
        variant="ghost"
        onClick={() => !disabled && setIsOpen(true)}
        disabled={disabled}
        className="w-full h-14 md:h-12 text-base font-normal border-0 bg-gray-50 hover:bg-gray-100 text-gray-700 flex items-center px-3 rounded-xl transition-all justify-start gap-3"
      >
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <WalletIcon className="h-5 w-5 text-gray-700" />
            <span className="text-base font-normal text-gray-700">
              {selectedWallet ? selectedWallet.name : placeholder}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </div>
      </Button>

      {/* Mobile & Tablet: Bottom Sheet */}
      {isOpen && (
        <div
          className="lg:hidden fixed z-[100] bg-transparent"
          style={{
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            marginTop: "calc(-1 * env(safe-area-inset-top))",
            paddingTop: "env(safe-area-inset-top)",
            width: "100vw",
            height: "100vh",
            backgroundColor: "transparent",
          }}
          data-prevent-dialog-swipe
        >
          {/* Backdrop */}
          <div
            className="absolute bg-black/20 backdrop-blur-[2px]"
            style={{
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              marginTop: "calc(-1 * env(safe-area-inset-top))",
              paddingTop: "env(safe-area-inset-top)",
              width: "100vw",
              height: "100vh",
            }}
            onClick={handleClose}
          />

          {/* Bottom Sheet */}
          <div
            className={cn(
              "fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden",
              isClosing ? "animate-slide-down" : "animate-slide-up"
            )}
            style={{ height: "70%" }}
          >
            {/* Draggable Top Zone: Handle bar + Search */}
            <div
              className="flex-shrink-0 bg-white rounded-t-3xl"
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
            >
              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
              </div>

              {/* Search */}
              <div className="px-4 pb-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search wallets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-12 text-base bg-gray-50 border-0 rounded-xl focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none placeholder:text-gray-700 text-gray-700"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2"
                    >
                      <X className="h-5 w-5 text-gray-400" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Scrollable Zone: Wallet List */}
            <div
              className="p-4 overflow-y-auto flex-1 bg-white"
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
            >
              {filteredWallets.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No wallets found
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredWallets.map((wallet) => (
                    <button
                      type="button"
                      key={wallet.id}
                      onClick={() => handleWalletSelect(wallet.id)}
                      className={cn(
                        "w-full p-4 rounded-xl bg-gray-50 text-left transition-all flex items-center justify-between",
                        selectedWalletId === wallet.id
                          ? "ring-2 ring-gray-900"
                          : "hover:bg-gray-100"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <WalletIcon className="h-5 w-5 text-gray-600" />
                        <span className="text-base font-medium text-gray-900">
                          {wallet.name}
                        </span>
                      </div>
                      <span className="text-base text-gray-600">
                        {formatBalance(wallet.balance)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Desktop: Enhanced Dropdown */}
      {isOpen && (
        <>
          <div className="hidden lg:block absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-200 z-50 max-h-[400px] overflow-hidden">
            {/* Search */}
            <div className="p-3 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search wallets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-9 text-sm bg-gray-50 border-0 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2"
                  >
                    <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                  </button>
                )}
              </div>
            </div>

            {/* Wallet List */}
            <div className="overflow-y-auto max-h-[340px] p-3">
              {filteredWallets.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-500">
                  No wallets found
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredWallets.map((wallet) => (
                    <button
                      type="button"
                      key={wallet.id}
                      onClick={() => handleWalletSelect(wallet.id)}
                      className={cn(
                        "w-full px-3 py-2 rounded-lg bg-gray-50 text-left transition-all flex items-center justify-between",
                        selectedWalletId === wallet.id
                          ? "ring-2 ring-gray-900"
                          : "hover:bg-gray-100"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <WalletIcon className="h-4 w-4 text-gray-600" />
                        <span className="text-sm font-medium text-gray-900">
                          {wallet.name}
                        </span>
                      </div>
                      <span className="text-sm text-gray-600">
                        {formatBalance(wallet.balance)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Backdrop for desktop dropdown */}
          <div
            className="hidden lg:block fixed inset-0 z-40"
            onClick={handleClose}
          />
        </>
      )}
    </div>
  );
}
