'use client';

import { useState, useCallback } from 'react';
import { Loader2, ArrowDown } from 'lucide-react';
import { usePullToRefresh } from '@/hooks/use-swipe-action';
import { cn } from '@/lib/utils';

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;
  className?: string;
}

export function PullToRefresh({
  children,
  onRefresh,
  className,
}: PullToRefreshProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh]);

  const { handlers, pullDistance, isPulling, thresholdReached } = usePullToRefresh({
    onRefresh: handleRefresh,
    isRefreshing,
    threshold: 80,
    maxPull: 120,
  });

  return (
    <div {...handlers} className={cn('relative', className)}>
      {/* Pull indicator */}
      <div
        className={cn(
          'absolute left-0 right-0 top-0 flex items-center justify-center overflow-hidden transition-all',
          'pointer-events-none'
        )}
        style={{
          height: isPulling || isRefreshing ? Math.max(pullDistance, isRefreshing ? 60 : 0) : 0,
        }}
      >
        <div
          className={cn(
            'flex items-center justify-center rounded-full p-2 transition-all',
            thresholdReached || isRefreshing
              ? 'bg-primary-100 text-primary-600'
              : 'bg-muted text-muted-foreground'
          )}
          style={{
            opacity: Math.min(pullDistance / 60, 1),
            transform: `rotate(${isRefreshing ? 0 : (pullDistance / 80) * 180}deg)`,
          }}
        >
          {isRefreshing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ArrowDown
              className={cn(
                'h-5 w-5 transition-transform',
                thresholdReached && 'rotate-180'
              )}
            />
          )}
        </div>
      </div>

      {/* Content with transform */}
      <div
        style={{
          transform: isPulling || isRefreshing
            ? `translateY(${Math.max(pullDistance, isRefreshing ? 60 : 0)}px)`
            : 'translateY(0)',
          transition: isPulling ? 'none' : 'transform 0.3s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Simple refresh button as alternative
interface RefreshButtonProps {
  onRefresh: () => Promise<void>;
  className?: string;
}

export function RefreshButton({ onRefresh, className }: RefreshButtonProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <button
      onClick={handleRefresh}
      disabled={isRefreshing}
      className={cn(
        'flex items-center justify-center p-2 rounded-full',
        'hover:bg-muted transition-colors',
        'disabled:opacity-50 disabled:pointer-events-none',
        className
      )}
      aria-label="Refresh"
    >
      <Loader2
        className={cn(
          'h-5 w-5 text-muted-foreground',
          isRefreshing && 'animate-spin'
        )}
      />
    </button>
  );
}
