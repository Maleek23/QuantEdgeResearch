import { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, Eye, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { useBotNotifications, BotNotification, BotEventType } from '@/hooks/use-bot-notifications';
import { cn } from '@/lib/utils';

interface NotificationCardProps {
  notification: BotNotification;
  onDismiss: (id: string) => void;
}

function NotificationCard({ notification, onDismiss }: NotificationCardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => setIsVisible(true), 50);
    
    const autoHideTimer = setTimeout(() => {
      setIsLeaving(true);
      setTimeout(() => {
        if (notification.id) onDismiss(notification.id);
      }, 300);
    }, notification.eventType === 'looking' ? 8000 : 15000);
    
    return () => {
      clearTimeout(showTimer);
      clearTimeout(autoHideTimer);
    };
  }, [notification.id, notification.eventType, onDismiss]);

  const getEventConfig = (eventType: BotEventType) => {
    switch (eventType) {
      case 'looking':
        return {
          icon: Eye,
          title: 'BOT SCANNING',
          bgClass: 'bg-amber-500/20 border-amber-500/50',
          iconClass: 'text-amber-400',
          titleClass: 'text-amber-400',
        };
      case 'entry':
        return {
          icon: TrendingUp,
          title: 'TRADE ENTERED',
          bgClass: 'bg-green-500/20 border-green-500/50',
          iconClass: 'text-green-400',
          titleClass: 'text-green-400',
        };
      case 'exit':
        const isProfit = (notification.pnl || 0) >= 0;
        return {
          icon: isProfit ? TrendingUp : TrendingDown,
          title: isProfit ? 'TRADE CLOSED +' : 'TRADE CLOSED -',
          bgClass: isProfit ? 'bg-green-500/20 border-green-500/50' : 'bg-red-500/20 border-red-500/50',
          iconClass: isProfit ? 'text-green-400' : 'text-red-400',
          titleClass: isProfit ? 'text-green-400' : 'text-red-400',
        };
      case 'skip':
        return {
          icon: AlertTriangle,
          title: 'SKIPPED',
          bgClass: 'bg-slate-500/20 border-slate-500/50',
          iconClass: 'text-slate-400',
          titleClass: 'text-slate-400',
        };
      case 'error':
        return {
          icon: AlertTriangle,
          title: 'ERROR',
          bgClass: 'bg-red-500/20 border-red-500/50',
          iconClass: 'text-red-400',
          titleClass: 'text-red-400',
        };
      default:
        return {
          icon: Eye,
          title: 'BOT ACTIVITY',
          bgClass: 'bg-cyan-500/20 border-cyan-500/50',
          iconClass: 'text-cyan-400',
          titleClass: 'text-cyan-400',
        };
    }
  };

  const config = getEventConfig(notification.eventType);
  const Icon = config.icon;

  const handleDismiss = () => {
    setIsLeaving(true);
    setTimeout(() => {
      if (notification.id) onDismiss(notification.id);
    }, 300);
  };

  const formatOptionDetails = () => {
    const parts = [];
    if (notification.optionType) parts.push(notification.optionType.toUpperCase());
    if (notification.strike) parts.push(`$${notification.strike}`);
    if (notification.price) parts.push(`@ $${notification.price.toFixed(2)}`);
    if (notification.quantity) parts.push(`x${notification.quantity}`);
    return parts.join(' ');
  };

  return (
    <div
      className={cn(
        'relative flex items-start gap-3 p-4 rounded-lg border backdrop-blur-sm shadow-lg',
        'transition-all duration-300 ease-out',
        config.bgClass,
        isVisible && !isLeaving ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      )}
    >
      <div className={cn('flex-shrink-0 p-2 rounded-full bg-black/30', config.iconClass)}>
        <Icon className="h-5 w-5" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn('text-xs font-bold tracking-wider', config.titleClass)}>
            {config.title}
          </span>
          {notification.portfolio === 'small_account' && (
            <span 
              className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-300 font-medium"
              data-testid="badge-small-account"
            >
              SMALL ACCT
            </span>
          )}
          {notification.confidence && notification.confidence >= 90 && (
            <span 
              className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/30 text-cyan-300 font-medium"
              data-testid="badge-a-plus"
            >
              A+
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-white">{notification.symbol}</span>
          <span className="text-sm text-slate-300">{formatOptionDetails()}</span>
        </div>
        
        {notification.confidence && (
          <div className="text-xs text-slate-400 mt-1">
            Confidence: {notification.confidence.toFixed(0)}%
          </div>
        )}
        
        {notification.pnl !== undefined && notification.eventType === 'exit' && (
          <div className={cn(
            'text-sm font-bold mt-1',
            notification.pnl >= 0 ? 'text-green-400' : 'text-red-400'
          )}>
            P&L: {notification.pnl >= 0 ? '+' : ''}${notification.pnl.toFixed(2)}
          </div>
        )}
        
        {notification.reason && (
          <div className="text-xs text-slate-400 mt-1 line-clamp-2">
            {notification.reason}
          </div>
        )}
      </div>
      
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
        data-testid="button-dismiss-notification"
      >
        <X className="h-4 w-4 text-slate-400" />
      </button>
    </div>
  );
}

export function BotNotificationPopup() {
  const { notifications, isConnected, dismissNotification } = useBotNotifications({
    maxNotifications: 5,
    autoConnect: true
  });

  const visibleNotifications = notifications.filter(
    n => n.eventType !== 'connected'
  );

  return (
    <div className="fixed top-14 right-4 z-40 flex flex-col gap-3 w-96 max-w-[calc(100vw-2rem)]">
      <div className="flex items-center justify-end gap-2 text-xs">
        {isConnected ? (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/10 border border-green-500/20 text-green-400">
            <Wifi className="h-3 w-3" />
            <span>Bot Connected</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-500/10 border border-slate-500/20 text-slate-400">
            <WifiOff className="h-3 w-3" />
            <span>Reconnecting...</span>
          </div>
        )}
      </div>
      
      {visibleNotifications.map((notification) => (
        <NotificationCard
          key={notification.id}
          notification={notification}
          onDismiss={dismissNotification}
        />
      ))}
    </div>
  );
}
