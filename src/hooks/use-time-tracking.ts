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

export function useTimeTracking() {
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Update elapsed time every second when any entry is active
  useEffect(() => {
    if (isTimerActive) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(calculateElapsed());
      }, 1000);

      // Initial calculation
      setElapsedSeconds(calculateElapsed());
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
  }, [isTimerActive, calculateElapsed, setElapsedSeconds]);

  // Initialize from server on mount
  useEffect(() => {
    initializeFromServer();
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
