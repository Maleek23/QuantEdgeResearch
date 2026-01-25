import { Link, useLocation } from "wouter";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/useAuth";
import { GlobalSearch } from "@/components/global-search";
import {
  LogOut,
  Mail,
  HelpCircle,
  Bell,
  PenSquare,
} from "lucide-react";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";

export function HeaderNav() {
  const { user, logout, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();
  
  const handleLogout = () => {
    logout();
    setLocation("/");
  };
  
  const userData = user as { email?: string; firstName?: string } | null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800/50 bg-slate-950/95 backdrop-blur-xl">
      <div className="flex items-center justify-between h-14 px-4 max-w-[1600px] mx-auto">
        {/* Left: Logo & New Research button */}
        <div className="flex items-center gap-4">
          <Link href="/research">
            <div className="flex items-center gap-2 cursor-pointer" data-testid="nav-logo">
              <img 
                src={quantEdgeLabsLogoUrl} 
                alt="Quant Edge" 
                className="h-7 w-7 object-contain" 
              />
            </div>
          </Link>
          
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-slate-400 hover:text-slate-200 h-8"
            data-testid="button-new-research"
          >
            <PenSquare className="w-4 h-4" />
          </Button>
        </div>
        
        {/* Center: Global Search */}
        <div className="flex-1 max-w-xl mx-auto px-4">
          <GlobalSearch 
            variant="default" 
            placeholder="Search for companies, tickers, or crypto"
          />
        </div>
        
        {/* Right: Actions & User */}
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-slate-400 hover:text-slate-200"
            data-testid="button-messages"
          >
            <Mail className="w-4 h-4" />
          </Button>
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-slate-400 hover:text-slate-200"
            data-testid="button-help"
          >
            <HelpCircle className="w-4 h-4" />
          </Button>
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-slate-400 hover:text-slate-200"
            data-testid="button-notifications"
          >
            <Bell className="w-4 h-4" />
          </Button>
          
          <Link href="/pricing">
            <Button 
              size="sm" 
              className="bg-cyan-500 hover:bg-cyan-600 text-white ml-2"
              data-testid="button-pricing"
            >
              Pricing Plans
            </Button>
          </Link>
          
          {isAuthenticated && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleLogout}
              className="text-slate-400 hover:text-red-400"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
