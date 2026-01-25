/**
 * Quick Action Cards
 *
 * Fast navigation cards for key platform features
 * Displayed prominently on the homepage below search
 */

import { useLocation } from 'wouter';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  Search,
  Lightbulb,
  TrendingUp,
  Star,
  Zap,
  Activity,
  Brain,
} from 'lucide-react';
import { motion } from 'framer-motion';

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  url: string;
  color: string;
  gradient: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Market overview & live data',
    icon: <Activity className="h-6 w-6" />,
    url: '/home',
    color: 'text-cyan-500',
    gradient: 'from-cyan-500/10 to-cyan-500/5',
  },
  {
    id: 'screen',
    label: 'Screen Stocks',
    description: 'Find opportunities',
    icon: <Search className="h-6 w-6" />,
    url: '/discover',
    color: 'text-purple-500',
    gradient: 'from-purple-500/10 to-purple-500/5',
  },
  {
    id: 'ai-ideas',
    label: 'AI Ideas',
    description: '6 bot trading engines',
    icon: <Brain className="h-6 w-6" />,
    url: '/trade-desk',
    color: 'text-emerald-500',
    gradient: 'from-emerald-500/10 to-emerald-500/5',
  },
  {
    id: 'chart',
    label: 'Chart',
    description: 'Technical analysis',
    icon: <BarChart3 className="h-6 w-6" />,
    url: '/chart',
    color: 'text-blue-500',
    gradient: 'from-blue-500/10 to-blue-500/5',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const cardVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 100,
      damping: 12,
    },
  },
};

export function QuickActionCards({ className }: { className?: string }) {
  const [, setLocation] = useLocation();

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4', className)}
    >
      {QUICK_ACTIONS.map(action => (
        <motion.div key={action.id} variants={cardVariants}>
          <Card
            onClick={() => setLocation(action.url)}
            className={cn(
              'relative overflow-hidden cursor-pointer transition-all duration-300',
              'hover:scale-105 hover:shadow-xl hover:shadow-primary/10',
              'group border-2 hover:border-primary/50'
            )}
          >
            {/* Gradient Background */}
            <div
              className={cn(
                'absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity',
                action.gradient
              )}
            />

            {/* Content */}
            <div className="relative p-6 space-y-3">
              {/* Icon */}
              <div
                className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center',
                  'bg-gradient-to-br transition-all duration-300',
                  action.gradient,
                  'group-hover:scale-110 group-hover:rotate-3'
                )}
              >
                <div className={action.color}>{action.icon}</div>
              </div>

              {/* Text */}
              <div>
                <h3 className="font-semibold text-lg mb-1">{action.label}</h3>
                <p className="text-sm text-muted-foreground">{action.description}</p>
              </div>

              {/* Arrow indicator */}
              <div
                className={cn(
                  'absolute bottom-4 right-4 opacity-0 group-hover:opacity-100',
                  'transition-all duration-300 group-hover:translate-x-1',
                  action.color
                )}
              >
                <Zap className="h-4 w-4" />
              </div>
            </div>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}

/**
 * Compact version for smaller spaces
 */
export function QuickActionCardsCompact({ className }: { className?: string }) {
  const [, setLocation] = useLocation();

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {QUICK_ACTIONS.map(action => (
        <button
          key={action.id}
          onClick={() => setLocation(action.url)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg',
            'bg-accent/50 hover:bg-accent transition-all',
            'border border-transparent hover:border-primary/50',
            'group'
          )}
        >
          <div className={action.color}>{action.icon}</div>
          <span className="font-medium text-sm">{action.label}</span>
        </button>
      ))}
    </div>
  );
}
