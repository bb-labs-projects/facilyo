'use client';

import { useState } from 'react';
import { Play, Pause, Square, Coffee, LogOut } from 'lucide-react';
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
      {/* Pause/Resume button */}
      {status === 'active' ? (
        <Button
          size="touch"
          variant="secondary"
          onClick={() => handleAction(onPause)}
          isLoading={isLoading}
          disabled={disabled}
          className="flex-1"
          leftIcon={<Pause className="h-6 w-6" />}
        >
          Pause
        </Button>
      ) : (
        <Button
          size="touch"
          variant="secondary"
          onClick={() => handleAction(onResume)}
          isLoading={isLoading}
          disabled={disabled}
          className="flex-1"
          leftIcon={<Play className="h-6 w-6" />}
        >
          Fortsetzen
        </Button>
      )}

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
      {/* Pause/Resume */}
      <button
        onClick={() => handleAction(status === 'active' ? onPause : onResume)}
        disabled={disabled || isLoading}
        className={cn(
          buttonClass,
          'bg-secondary text-secondary-foreground hover:bg-secondary/80'
        )}
        aria-label={status === 'active' ? 'Pausieren' : 'Fortsetzen'}
      >
        {status === 'active' ? (
          <Pause className="h-8 w-8" />
        ) : (
          <Play className="h-8 w-8 ml-1" />
        )}
      </button>

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
            {/* Break button */}
            {onBreak && (
              <Button
                size="touch"
                variant="outline"
                onClick={() => handleAction(onBreak)}
                isLoading={isLoading}
                disabled={disabled}
                className="w-full"
                leftIcon={<Coffee className="h-5 w-5" />}
              >
                Pause machen
              </Button>
            )}
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
            {isOnBreak ? 'Pause beenden' : 'Arbeitstag starten'}
          </Button>
        )}
      </div>

      {/* End work day confirmation dialog */}
      <Dialog open={showEndConfirmation} onOpenChange={setShowEndConfirmation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arbeitstag beenden?</DialogTitle>
            <DialogDescription>
              Möchten Sie Ihren Arbeitstag wirklich beenden? Sie können ihn später wieder starten, falls Sie eine Pause machen möchten.
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
              Beenden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
