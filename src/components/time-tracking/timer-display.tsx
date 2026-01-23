'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TimerDisplayProps {
  time: string; // Format: "HH:MM:SS"
  status: 'inactive' | 'active' | 'paused';
  propertyName?: string;
  className?: string;
}

export function TimerDisplay({
  time,
  status,
  propertyName,
  className,
}: TimerDisplayProps) {
  const statusColors = {
    inactive: 'text-muted-foreground',
    active: 'text-primary-600',
    paused: 'text-warning-600',
  };

  const statusLabels = {
    inactive: 'Inaktiv',
    active: 'Aktiv',
    paused: 'Pausiert',
  };

  const pulseAnimation = status === 'active' ? {
    scale: [1, 1.02, 1],
    transition: { repeat: Infinity, duration: 2 },
  } : {};

  return (
    <div className={cn('flex flex-col items-center', className)}>
      {/* Status indicator */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className={cn(
            'inline-block h-2 w-2 rounded-full',
            status === 'active' && 'bg-success-500 animate-pulse',
            status === 'paused' && 'bg-warning-500',
            status === 'inactive' && 'bg-muted'
          )}
        />
        <span
          className={cn(
            'text-sm font-medium',
            statusColors[status]
          )}
        >
          {statusLabels[status]}
        </span>
      </div>

      {/* Timer display */}
      <motion.div
        className={cn(
          'timer-display',
          statusColors[status]
        )}
        animate={pulseAnimation}
      >
        {time}
      </motion.div>

      {/* Property name */}
      {propertyName && (
        <p className="mt-2 text-sm text-muted-foreground text-center">
          {propertyName}
        </p>
      )}
    </div>
  );
}

// Compact version for list items
interface TimerDisplayCompactProps {
  time: string;
  status: 'active' | 'paused' | 'completed';
  className?: string;
}

export function TimerDisplayCompact({
  time,
  status,
  className,
}: TimerDisplayCompactProps) {
  const statusBadge = {
    active: 'badge-success',
    paused: 'badge-warning',
    completed: 'badge-info',
  };

  const statusLabels = {
    active: 'Aktiv',
    paused: 'Pausiert',
    completed: 'Beendet',
  };

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="font-mono text-lg font-semibold tabular-nums">
        {time}
      </span>
      <span className={cn('badge', statusBadge[status])}>
        {statusLabels[status]}
      </span>
    </div>
  );
}

// Circular progress timer
interface CircularTimerProps {
  time: string;
  progress: number; // 0-100
  status: 'inactive' | 'active' | 'paused';
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function CircularTimer({
  time,
  progress,
  status,
  size = 200,
  strokeWidth = 8,
  className,
}: CircularTimerProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  const statusColors = {
    inactive: 'stroke-muted',
    active: 'stroke-primary-500',
    paused: 'stroke-warning-500',
  };

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      {/* Background circle */}
      <svg className="absolute" width={size} height={size}>
        <circle
          className="stroke-muted"
          fill="none"
          strokeWidth={strokeWidth}
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>

      {/* Progress circle */}
      <svg
        className="absolute -rotate-90"
        width={size}
        height={size}
      >
        <circle
          className={cn(
            'transition-all duration-300',
            statusColors[status]
          )}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>

      {/* Time display */}
      <div className="z-10 text-center">
        <span className="font-mono text-3xl font-bold tabular-nums">
          {time}
        </span>
      </div>
    </div>
  );
}
