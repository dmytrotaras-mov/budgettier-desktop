import { Link, useLocation } from "wouter";
import { Wallet, BarChart3, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { type User as UserType } from "@shared/schema";

const navigation = [
  { name: "Budget", href: "/budget", icon: Wallet },
  { name: "Overview", href: "/overview", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

function MobileUserButton() {
  const { user } = useAuth() as { user: UserType | undefined };

  if (!user) {
    return (
      <div className="w-6 h-6 bg-mono-gray-700 rounded-full flex items-center justify-center">
        <User className="w-3 h-3 text-mono-white" />
      </div>
    );
  }

  // Get user initials
  const getInitials = (user: UserType) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`;
    }
    if (user.firstName) {
      return user.firstName[0];
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    return 'U';
  };

  return (
    <Link href="/settings" className="block">
      {user.profileImageUrl ? (
        <img 
          src={user.profileImageUrl} 
          alt="Profile" 
          className="w-6 h-6 rounded-full object-cover"
        />
      ) : (
        <div className="w-6 h-6 bg-mono-gray-700 rounded-full flex items-center justify-center">
          <span className="text-mono-white font-medium text-xs">
            {getInitials(user)}
          </span>
        </div>
      )}
    </Link>
  );
}

export function MobileBottomNavigation() {
  const [location] = useLocation();

  return (
    <div
      className="mobile-bottom-nav md:hidden bg-white border-t border-gray-100 shadow-lg fixed bottom-0 left-0 right-0 z-50"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        position: 'fixed',
        bottom: 0,
        width: '100%',
      }}
    >
      <div className="grid grid-cols-4 h-16 px-2">
        {navigation.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;

          return (
            <Link key={item.name} href={item.href} className={cn(
              "flex flex-col items-center justify-center space-y-1 transition-all duration-200 rounded-xl mx-1 my-2",
              isActive
                ? "text-gray-900 bg-gray-100"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            )}>
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function MobileNavigation() {
  const [location] = useLocation();

  return null;
}
