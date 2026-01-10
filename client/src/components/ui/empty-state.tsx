import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { 
  BarChart3, 
  AlertTriangle, 
  Search, 
  Database,
  Wifi,
  Clock,
  LucideIcon
} from "lucide-react";

type EmptyStateVariant = 
  | 'no-data' 
  | 'no-signals' 
  | 'no-results' 
  | 'error' 
  | 'offline' 
  | 'coming-soon';

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  icon?: LucideIcon;
  title?: string;
  message?: string;
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  }>;
  className?: string;
}

const variantDefaults: Record<EmptyStateVariant, { 
  icon: LucideIcon; 
  title: string; 
  message: string;
  iconColor: string;
}> = {
  'no-data': {
    icon: Database,
    title: 'No Data Available',
    message: 'Data has not been loaded yet. Try refreshing or check back later.',
    iconColor: 'text-slate-600',
  },
  'no-signals': {
    icon: BarChart3,
    title: 'No Signals Found',
    message: 'Market is in ranging regime. Try adjusting scanner settings or wait for volatility.',
    iconColor: 'text-slate-600',
  },
  'no-results': {
    icon: Search,
    title: 'No Results Found',
    message: 'Your search did not match any records. Try adjusting your filters.',
    iconColor: 'text-slate-600',
  },
  'error': {
    icon: AlertTriangle,
    title: 'Something Went Wrong',
    message: 'An error occurred while loading data. Please try again.',
    iconColor: 'text-red-400',
  },
  'offline': {
    icon: Wifi,
    title: 'Connection Lost',
    message: 'Unable to connect to the server. Check your internet connection.',
    iconColor: 'text-amber-400',
  },
  'coming-soon': {
    icon: Clock,
    title: 'Coming Soon',
    message: 'This feature is currently under development. Check back soon!',
    iconColor: 'text-cyan-400',
  },
};

export function EmptyState({
  variant = 'no-data',
  icon,
  title,
  message,
  actions,
  className,
}: EmptyStateProps) {
  const defaults = variantDefaults[variant];
  const Icon = icon || defaults.icon;
  const displayTitle = title || defaults.title;
  const displayMessage = message || defaults.message;

  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-12 px-4 text-center",
      className
    )}>
      <Icon className={cn("h-12 w-12 mb-4", defaults.iconColor)} />
      <h3 className="text-lg font-semibold text-slate-300 mb-2">{displayTitle}</h3>
      <p className="text-sm text-slate-400 max-w-md mb-6">{displayMessage}</p>
      
      {actions && actions.length > 0 && (
        <div className="flex items-center gap-3">
          {actions.map((action, index) => (
            <Button
              key={index}
              variant={action.variant === 'primary' ? 'default' : 'outline'}
              onClick={action.onClick}
              className={action.variant === 'primary' 
                ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950' 
                : ''
              }
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export function InlineEmptyState({
  message = "No data",
  className,
}: { message?: string; className?: string }) {
  return (
    <div className={cn(
      "text-sm text-slate-500 font-mono py-4 text-center",
      className
    )}>
      <span className="text-slate-600 mr-2">{">"}</span>
      {message}
    </div>
  );
}
