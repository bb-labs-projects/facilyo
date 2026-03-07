'use client';

import { useTranslations } from 'next-intl';
import { ChecklistItem } from './checklist-item';
import { cn } from '@/lib/utils';
import type { ChecklistItem as ChecklistItemType } from '@/types/database';

interface ChecklistListProps {
  items: ChecklistItemType[];
  values: Record<string, unknown>;
  onChange: (itemId: string, value: unknown) => void;
  className?: string;
}

export function ChecklistList({
  items,
  values,
  onChange,
  className,
}: ChecklistListProps) {
  const t = useTranslations('checklist');
  // Sort items by order
  const sortedItems = [...items].sort((a, b) => a.order - b.order);

  // Calculate progress
  const completedCount = sortedItems.filter((item) => {
    const value = values[item.id];
    switch (item.type) {
      case 'checkbox':
        return value === true;
      case 'text':
        return typeof value === 'string' && value.trim().length > 0;
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'photo':
        return typeof value === 'string' && value.length > 0;
      default:
        return false;
    }
  }).length;

  const requiredCount = sortedItems.filter((item) => item.required).length;
  const completedRequiredCount = sortedItems.filter((item) => {
    if (!item.required) return false;
    const value = values[item.id];
    switch (item.type) {
      case 'checkbox':
        return value === true;
      case 'text':
        return typeof value === 'string' && value.trim().length > 0;
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'photo':
        return typeof value === 'string' && value.length > 0;
      default:
        return false;
    }
  }).length;

  const progress = sortedItems.length > 0
    ? Math.round((completedCount / sortedItems.length) * 100)
    : 0;

  const allRequiredComplete = completedRequiredCount === requiredCount;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Progress header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {t('completedOf', { completed: completedCount, total: sortedItems.length })}
          </span>
          <span className="font-medium">{progress}%</span>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-300 rounded-full',
              progress === 100 ? 'bg-success-500' : 'bg-primary-500'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Required items indicator */}
        {requiredCount > 0 && (
          <p
            className={cn(
              'text-xs',
              allRequiredComplete ? 'text-success-600' : 'text-muted-foreground'
            )}
          >
            {allRequiredComplete
              ? t('allRequiredComplete')
              : t('requiredProgress', { completed: completedRequiredCount, total: requiredCount })}
          </p>
        )}
      </div>

      {/* Items list */}
      <div className="space-y-2">
        {sortedItems.map((item) => (
          <ChecklistItem
            key={item.id}
            item={item}
            value={values[item.id]}
            onChange={(value) => onChange(item.id, value)}
          />
        ))}
      </div>

      {/* Empty state */}
      {sortedItems.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          {t('noChecklistItems')}
        </div>
      )}
    </div>
  );
}

// Compact progress indicator
interface ChecklistProgressProps {
  completed: number;
  total: number;
  className?: string;
}

export function ChecklistProgress({
  completed,
  total,
  className,
}: ChecklistProgressProps) {
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full transition-all duration-300 rounded-full',
            progress === 100 ? 'bg-success-500' : 'bg-primary-500'
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {completed}/{total}
      </span>
    </div>
  );
}
