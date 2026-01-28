'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  useTimerStore,
  selectIsTimerActive,
  selectTimerStatus,
  selectIsOnBreak,
  selectIsTraveling,
  selectIsWorkingOnProperty,
  selectCurrentEntryType,
} from '@/stores/timer-store';
import { swissFormat } from '@/lib/i18n';
import { toast } from 'sonner';

// Auto-stop time: 20:00 (8 PM)
const AUTO_STOP_HOUR = 20;
const AUTO_STOP_MINUTE = 0;

export function useTimeTracking() {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoStopRef = useRef<boolean>(false);

  const {
    workDay,
    activeEntry,
    activeProperty,
    currentEntryType,
    elapsedSeconds,
    startWorkDay,
    endWorkDay,
    startTravelTime,
    startPropertyWork,
    stopPropertyWork,
    startBreak,
    endBreak,
    setElapsedSeconds,
    initializeFromServer,
  } = useTimerStore();

  const isTimerActive = useTimerStore(selectIsTimerActive);
  const timerStatus = useTimerStore(selectTimerStatus);
  const isOnBreak = useTimerStore(selectIsOnBreak);
  const isTraveling = useTimerStore(selectIsTraveling);
  const isWorkingOnProperty = useTimerStore(selectIsWorkingOnProperty);
  const entryType = useTimerStore(selectCurrentEntryType);

  // Calculate elapsed seconds
  const calculateElapsed = useCallback(() => {
    if (!activeEntry) return 0;

    const startTime = new Date(activeEntry.start_time).getTime();
    const now = new Date().getTime();
    const elapsed = Math.floor((now - startTime) / 1000);

    return Math.max(0, elapsed);
  }, [activeEntry]);

  // Check if current time is past the auto-stop time (20:00)
  const checkAutoStop = useCallback(async () => {
    if (!workDay || autoStopRef.current) return;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Check if it's 20:00 or later
    if (currentHour > AUTO_STOP_HOUR ||
        (currentHour === AUTO_STOP_HOUR && currentMinute >= AUTO_STOP_MINUTE)) {
      // Prevent multiple auto-stops
      autoStopRef.current = true;

      try {
        await endWorkDay();
        toast.info('Arbeitstag automatisch beendet', {
          description: 'Die Zeiterfassung wurde um 20:00 Uhr automatisch gestoppt.',
        });
      } catch (error) {
        console.error('Auto-stop failed:', error);
        autoStopRef.current = false;
      }
    }
  }, [workDay, endWorkDay]);

  // Reset auto-stop flag when work day changes (new day or manual restart)
  useEffect(() => {
    if (!workDay) {
      autoStopRef.current = false;
    }
  }, [workDay]);

  // Update elapsed time every second when any entry is active
  useEffect(() => {
    if (isTimerActive) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(calculateElapsed());
        // Check for auto-stop on each tick
        checkAutoStop();
      }, 1000);

      // Initial calculation
      setElapsedSeconds(calculateElapsed());
      // Initial auto-stop check
      checkAutoStop();
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isTimerActive, calculateElapsed, setElapsedSeconds, checkAutoStop]);

  // Initialize from server on mount and handle auto-closed work days
  useEffect(() => {
    const initialize = async () => {
      const result = await initializeFromServer();
      if (result?.autoClosedDates && result.autoClosedDates.length > 0) {
        // Format dates for display (DD.MM.YYYY)
        const formattedDates = result.autoClosedDates.map(date => {
          const [year, month, day] = date.split('-');
          return `${day}.${month}.${year}`;
        });

        if (formattedDates.length === 1) {
          toast.info('Arbeitstag automatisch beendet', {
            description: `Der Arbeitstag vom ${formattedDates[0]} wurde automatisch um 20:00 Uhr beendet.`,
          });
        } else {
          toast.info('Arbeitstage automatisch beendet', {
            description: `Die Arbeitstage vom ${formattedDates.join(', ')} wurden automatisch um 20:00 Uhr beendet.`,
          });
        }
      }
    };
    initialize();
  }, [initializeFromServer]);

  // Format elapsed time as HH:MM:SS
  const formattedTime = swissFormat.duration(elapsedSeconds);

  // Format elapsed time as human readable
  const humanReadableTime = swissFormat.durationHuman(elapsedSeconds);

  // Calculate work day duration
  const workDayDuration = useCallback(() => {
    if (!workDay) return 0;
    const startTime = new Date(workDay.start_time).getTime();
    const now = new Date().getTime();
    return Math.floor((now - startTime) / 1000);
  }, [workDay]);

  const formattedWorkDayDuration = swissFormat.duration(workDayDuration());

  // Get status label in German
  const getStatusLabel = useCallback(() => {
    if (!currentEntryType) return null;
    switch (currentEntryType) {
      case 'travel':
        return 'Fahrzeit';
      case 'property':
        return activeProperty?.name || 'Liegenschaft';
      case 'break':
        return 'Pause';
      default:
        return null;
    }
  }, [currentEntryType, activeProperty]);

  return {
    // State
    workDay,
    activeEntry,
    activeProperty,
    elapsedSeconds,
    isTimerActive,
    timerStatus,
    isWorkDayActive: !!workDay,
    // Entry type states
    currentEntryType,
    isOnBreak,
    isTraveling,
    isWorkingOnProperty,

    // Formatted values
    formattedTime,
    humanReadableTime,
    formattedWorkDayDuration,
    statusLabel: getStatusLabel(),

    // Actions
    startWorkDay,
    endWorkDay,
    startTravelTime,
    startPropertyWork,
    stopPropertyWork,
    startBreak,
    endBreak,

    // Utilities
    calculateElapsed,
    workDayDuration,
  };
}
