'use client';

import { useState } from 'react';
import { Play, Square, Coffee, LogOut, Car, Building2, StopCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn, hapticFeedback } from '@/lib/utils';
import type { TimeEntryType } from '@/types/database';

// Status badge for current tracking mode
interface StatusBadgeProps {
  entryType: TimeEntryType | null;
  propertyName?: string;
  className?: string;
}

export function StatusBadge({ entryType, propertyName, className }: StatusBadgeProps) {
  if (!entryType) return null;

  const config = {
    travel: {
      label: 'Fahrzeit',
      icon: Car,
      bgColor: 'bg-amber-100',
      textColor: 'text-amber-800',
      borderColor: 'border-amber-300',
    },
    property: {
      label: propertyName || 'Liegenschaft',
      icon: Building2,
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-800',
      borderColor: 'border-blue-300',
    },
    break: {
      label: 'Pause',
      icon: Coffee,
      bgColor: 'bg-orange-100',
      textColor: 'text-orange-800',
      borderColor: 'border-orange-300',
    },
  };

  const { label, icon: Icon, bgColor, textColor, borderColor } = config[entryType];

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-4 py-2 rounded-full border',
        bgColor,
        textColor,
        borderColor,
        className
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="font-medium">{label}</span>
    </div>
  );
}

// Timer display with status (simplified for new workflow)
interface TimerControlsProps {
  status: 'inactive' | 'active' | 'paused';
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
}

export function TimerControls({
  status,
  onStart,
  onPause,
  onResume,
  onStop,
  isLoading = false,
  disabled = false,
  className,
}: TimerControlsProps) {
  const handleAction = (action: () => void, feedbackType: 'light' | 'medium' | 'heavy' = 'medium') => {
    hapticFeedback(feedbackType);
    action();
  };

  if (status === 'inactive') {
    return (
      <div className={cn('flex justify-center', className)}>
        <Button
          size="touch"
          onClick={() => handleAction(onStart, 'heavy')}
          isLoading={isLoading}
          disabled={disabled}
          className="w-full max-w-xs"
          leftIcon={<Play className="h-6 w-6" />}
        >
          Starten
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center justify-center gap-4', className)}>
      {/* Stop button */}
      <Button
        size="touch"
        variant="destructive"
        onClick={() => handleAction(onStop, 'heavy')}
        isLoading={isLoading}
        disabled={disabled}
        className="flex-1"
        leftIcon={<Square className="h-6 w-6" />}
      >
        Beenden
      </Button>
    </div>
  );
}

// Travel mode controls
interface TravelControlsProps {
  onStartProperty: () => void;
  onStartBreak: () => void;
  onEndWorkDay: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  showPropertyButton?: boolean;
  className?: string;
}

export function TravelControls({
  onStartProperty,
  onStartBreak,
  onEndWorkDay,
  isLoading = false,
  disabled = false,
  showPropertyButton = true,
  className,
}: TravelControlsProps) {
  const handleAction = (action: () => void) => {
    hapticFeedback('medium');
    action();
  };

  return (
    <div className={cn('space-y-3', className)}>
      {showPropertyButton && (
        <Button
          size="touch"
          onClick={() => handleAction(onStartProperty)}
          isLoading={isLoading}
          disabled={disabled}
          className="w-full"
          leftIcon={<Building2 className="h-5 w-5" />}
        >
          Liegenschaft starten
        </Button>
      )}
      <Button
        size="touch"
        variant="secondary"
        onClick={() => handleAction(onStartBreak)}
        isLoading={isLoading}
        disabled={disabled}
        className="w-full"
        leftIcon={<Coffee className="h-5 w-5" />}
      >
        Pause
      </Button>
    </div>
  );
}

// Property work mode controls
interface PropertyControlsProps {
  onStopProperty: () => void;
  onStartBreak: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
}

export function PropertyControls({
  onStopProperty,
  onStartBreak,
  isLoading = false,
  disabled = false,
  className,
}: PropertyControlsProps) {
  const handleAction = (action: () => void) => {
    hapticFeedback('medium');
    action();
  };

  return (
    <div className={cn('space-y-3', className)}>
      <Button
        size="touch"
        variant="secondary"
        onClick={() => handleAction(onStopProperty)}
        isLoading={isLoading}
        disabled={disabled}
        className="w-full"
        leftIcon={<StopCircle className="h-5 w-5" />}
      >
        Arbeit beenden
      </Button>
      <Button
        size="touch"
        variant="outline"
        onClick={() => handleAction(onStartBreak)}
        isLoading={isLoading}
        disabled={disabled}
        className="w-full"
        leftIcon={<Coffee className="h-5 w-5" />}
      >
        Pause
      </Button>
    </div>
  );
}

// Break mode controls
interface BreakControlsProps {
  onEndBreak: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
}

export function BreakControls({
  onEndBreak,
  isLoading = false,
  disabled = false,
  className,
}: BreakControlsProps) {
  const handleAction = (action: () => void) => {
    hapticFeedback('heavy');
    action();
  };

  return (
    <div className={cn('flex justify-center', className)}>
      <Button
        size="touch"
        onClick={() => handleAction(onEndBreak)}
        isLoading={isLoading}
        disabled={disabled}
        className="w-full"
        leftIcon={<Play className="h-5 w-5" />}
      >
        Pause beenden
      </Button>
    </div>
  );
}

// Large circular control buttons (alternative design)
interface CircularControlProps {
  status: 'inactive' | 'active' | 'paused';
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
}

export function CircularControls({
  status,
  onStart,
  onPause,
  onResume,
  onStop,
  isLoading = false,
  disabled = false,
  className,
}: CircularControlProps) {
  const handleAction = (action: () => void) => {
    hapticFeedback('medium');
    action();
  };

  const buttonClass = cn(
    'rounded-full w-20 h-20 flex items-center justify-center',
    'transition-all duration-200 active:scale-95',
    'focus:outline-none focus:ring-2 focus:ring-offset-2',
    disabled && 'opacity-50 pointer-events-none'
  );

  if (status === 'inactive') {
    return (
      <div className={cn('flex justify-center', className)}>
        <button
          onClick={() => handleAction(onStart)}
          disabled={disabled || isLoading}
          className={cn(
            buttonClass,
            'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500'
          )}
          aria-label="Timer starten"
        >
          <Play className="h-10 w-10 ml-1" />
        </button>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center justify-center gap-6', className)}>
      {/* Stop */}
      <button
        onClick={() => handleAction(onStop)}
        disabled={disabled || isLoading}
        className={cn(
          buttonClass,
          'bg-error-600 text-white hover:bg-error-700 focus:ring-error-500'
        )}
        aria-label="Timer beenden"
      >
        <Square className="h-8 w-8" />
      </button>
    </div>
  );
}

// Work day control buttons
interface WorkDayControlsProps {
  isActive: boolean;
  isOnBreak?: boolean;
  onStart: () => void;
  onEnd: () => void;
  onBreak?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
}

export function WorkDayControls({
  isActive,
  isOnBreak = false,
  onStart,
  onEnd,
  onBreak,
  isLoading = false,
  disabled = false,
  className,
}: WorkDayControlsProps) {
  const [showEndConfirmation, setShowEndConfirmation] = useState(false);

  const handleAction = (action: () => void) => {
    hapticFeedback('heavy');
    action();
  };

  const handleEndWorkDay = () => {
    setShowEndConfirmation(false);
    onEnd();
  };

  return (
    <>
      <div className={cn('flex justify-center', className)}>
        {isActive ? (
          <div className="w-full space-y-3">
            {/* End work day button */}
            <Button
              size="touch"
              variant="outline"
              onClick={() => {
                hapticFeedback('heavy');
                setShowEndConfirmation(true);
              }}
              isLoading={isLoading}
              disabled={disabled}
              className="w-full border-error-300 text-error-600 hover:bg-error-50"
              leftIcon={<LogOut className="h-5 w-5" />}
            >
              Arbeitstag beenden
            </Button>
          </div>
        ) : (
          <Button
            size="touch"
            onClick={() => handleAction(onStart)}
            isLoading={isLoading}
            disabled={disabled}
            className="w-full"
            leftIcon={<Play className="h-5 w-5" />}
          >
            Arbeitstag starten
          </Button>
        )}
      </div>

      {/* End work day confirmation dialog - UPDATED TEXT */}
      <Dialog open={showEndConfirmation} onOpenChange={setShowEndConfirmation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arbeitstag beenden?</DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block font-semibold text-error-600">
                Der Arbeitstag wird endgültig beendet und kann NICHT mehr fortgesetzt werden.
              </span>
              <span className="block">
                Alle aktiven Zeiten werden gespeichert.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEndConfirmation(false)}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleEndWorkDay}
            >
              Endgültig beenden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
