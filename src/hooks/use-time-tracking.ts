'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useTimerStore, selectIsTimerActive, selectTimerStatus, selectIsOnBreak } from '@/stores/timer-store';
import { swissFormat } from '@/lib/i18n';

export function useTimeTracking() {
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const {
    workDay,
    activeEntry,
    activeProperty,
    isPaused,
    pauseStart,
    totalPauseDuration,
    elapsedSeconds,
    startWorkDay,
    endWorkDay,
    takeBreak,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
    setElapsedSeconds,
    initializeFromServer,
  } = useTimerStore();

  const isTimerActive = useTimerStore(selectIsTimerActive);
  const timerStatus = useTimerStore(selectTimerStatus);
  const isOnBreak = useTimerStore(selectIsOnBreak);

  // Calculate elapsed seconds
  const calculateElapsed = useCallback(() => {
    if (!activeEntry) return 0;

    const startTime = new Date(activeEntry.start_time).getTime();
    const now = new Date().getTime();
    let elapsed = Math.floor((now - startTime) / 1000);

    // Subtract total pause duration
    elapsed -= totalPauseDuration;

    // Subtract current pause if paused
    if (isPaused && pauseStart) {
      const currentPause = Math.floor(
        (now - new Date(pauseStart).getTime()) / 1000
      );
      elapsed -= currentPause;
    }

    return Math.max(0, elapsed);
  }, [activeEntry, totalPauseDuration, isPaused, pauseStart]);

  // Update elapsed time every second when timer is active
  useEffect(() => {
    if (isTimerActive && !isPaused) {
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
  }, [isTimerActive, isPaused, calculateElapsed, setElapsedSeconds]);

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

  return {
    // State
    workDay,
    activeEntry,
    activeProperty,
    isPaused,
    elapsedSeconds,
    isTimerActive,
    timerStatus,
    isWorkDayActive: !!workDay,
    isOnBreak,

    // Formatted values
    formattedTime,
    humanReadableTime,
    formattedWorkDayDuration,

    // Actions
    startWorkDay,
    endWorkDay,
    takeBreak,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,

    // Utilities
    calculateElapsed,
    workDayDuration,
  };
}
