'use client';

import { Wrench, Trees, Scissors, ClipboardList, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, hapticFeedback } from '@/lib/utils';
import type { ActivityType, PropertyType } from '@/types/database';

interface ActivityTypeSelectorProps {
  selectedActivity: ActivityType | null;
  onSelect: (activity: ActivityType) => void;
  disabled?: boolean;
  className?: string;
  propertyType?: PropertyType;
}

const ACTIVITY_TYPES: { value: ActivityType; label: string; icon: typeof Wrench }[] = [
  { value: 'hauswartung', label: 'Hauswartung', icon: Wrench },
  { value: 'rasen_maehen', label: 'Rasen mähen', icon: Trees },
  { value: 'hecken_schneiden', label: 'Hecken schneiden', icon: Scissors },
  { value: 'regie', label: 'Regie', icon: ClipboardList },
  { value: 'reinigung', label: 'Reinigung', icon: Sparkles },
];

// Property types that only allow "Reinigung" activity
const CLEANING_ONLY_PROPERTY_TYPES: PropertyType[] = ['office', 'private_maintenance'];

// Get available activities based on property type
function getAvailableActivities(propertyType?: PropertyType) {
  if (propertyType && CLEANING_ONLY_PROPERTY_TYPES.includes(propertyType)) {
    // Office and private_maintenance only get "Reinigung"
    return ACTIVITY_TYPES.filter(a => a.value === 'reinigung');
  }
  // Other property types get all activities except "Reinigung"
  return ACTIVITY_TYPES.filter(a => a.value !== 'reinigung');
}

export function ActivityTypeSelector({
  selectedActivity,
  onSelect,
  disabled = false,
  className,
  propertyType,
}: ActivityTypeSelectorProps) {
  const handleSelect = (activity: ActivityType) => {
    hapticFeedback('light');
    onSelect(activity);
  };

  const availableActivities = getAvailableActivities(propertyType);

  return (
    <div className={cn('space-y-2', className)}>
      <label className="text-sm font-medium text-muted-foreground">
        Tätigkeit wählen
      </label>
      <div className="grid grid-cols-2 gap-2">
        {availableActivities.map(({ value, label, icon: Icon }) => (
          <Button
            key={value}
            type="button"
            variant={selectedActivity === value ? 'primary' : 'outline'}
            size="sm"
            disabled={disabled}
            onClick={() => handleSelect(value)}
            className={cn(
              'h-auto py-3 flex flex-col items-center gap-1',
              selectedActivity === value && 'ring-2 ring-primary ring-offset-2'
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="text-xs">{label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

// Compact version for displaying current activity with change option
interface ActivityTypeBadgeProps {
  activity: ActivityType;
  onChangeClick?: () => void;
  className?: string;
}

export function ActivityTypeBadge({
  activity,
  onChangeClick,
  className,
}: ActivityTypeBadgeProps) {
  const activityConfig = ACTIVITY_TYPES.find((a) => a.value === activity);
  if (!activityConfig) return null;

  const Icon = activityConfig.icon;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full',
        'bg-primary-50 text-primary-700 border border-primary-200',
        className
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="text-sm font-medium">{activityConfig.label}</span>
      {onChangeClick && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            hapticFeedback('light');
            onChangeClick();
          }}
          className="ml-1 text-xs underline hover:no-underline"
        >
          ändern
        </button>
      )}
    </div>
  );
}

// Helper to get activity label
export function getActivityLabel(activity: ActivityType): string {
  const config = ACTIVITY_TYPES.find((a) => a.value === activity);
  return config?.label || activity;
}

export { ACTIVITY_TYPES };
