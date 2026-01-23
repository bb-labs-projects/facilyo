'use client';

import { useState, useCallback, useRef } from 'react';
import { useSwipeable, type SwipeEventData } from 'react-swipeable';
import { hapticFeedback } from '@/lib/utils';

interface SwipeActionConfig {
  // Threshold in pixels before action is triggered
  threshold?: number;
  // Max swipe distance in pixels
  maxSwipe?: number;
  // Enable left swipe
  enableLeft?: boolean;
  // Enable right swipe
  enableRight?: boolean;
  // Callback when left swipe threshold is reached
  onSwipeLeft?: () => void;
  // Callback when right swipe threshold is reached
  onSwipeRight?: () => void;
  // Enable haptic feedback
  haptic?: boolean;
}

interface SwipeActionReturn {
  // Handlers to spread on the swipeable element
  handlers: ReturnType<typeof useSwipeable>;
  // Current swipe offset in pixels
  offset: number;
  // Whether currently swiping
  isSwiping: boolean;
  // Direction of current swipe
  direction: 'left' | 'right' | null;
  // Whether threshold has been reached
  thresholdReached: boolean;
  // Reset swipe state
  reset: () => void;
}

const defaultConfig: SwipeActionConfig = {
  threshold: 100,
  maxSwipe: 150,
  enableLeft: true,
  enableRight: true,
  haptic: true,
};

export function useSwipeAction(config: SwipeActionConfig = {}): SwipeActionReturn {
  const opts = { ...defaultConfig, ...config };

  const [offset, setOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [direction, setDirection] = useState<'left' | 'right' | null>(null);
  const [thresholdReached, setThresholdReached] = useState(false);

  const hasTriggeredHaptic = useRef(false);

  const reset = useCallback(() => {
    setOffset(0);
    setIsSwiping(false);
    setDirection(null);
    setThresholdReached(false);
    hasTriggeredHaptic.current = false;
  }, []);

  const handlers = useSwipeable({
    onSwiping: (eventData: SwipeEventData) => {
      const { deltaX, dir } = eventData;

      // Determine direction
      if (dir === 'Left' && !opts.enableLeft) return;
      if (dir === 'Right' && !opts.enableRight) return;

      setIsSwiping(true);

      // Calculate bounded offset
      let newOffset = deltaX;
      if (Math.abs(newOffset) > opts.maxSwipe!) {
        newOffset = newOffset > 0 ? opts.maxSwipe! : -opts.maxSwipe!;
      }

      setOffset(newOffset);
      setDirection(newOffset > 0 ? 'right' : 'left');

      // Check threshold
      const reached = Math.abs(newOffset) >= opts.threshold!;
      if (reached && !thresholdReached) {
        setThresholdReached(true);
        if (opts.haptic && !hasTriggeredHaptic.current) {
          hapticFeedback('medium');
          hasTriggeredHaptic.current = true;
        }
      } else if (!reached && thresholdReached) {
        setThresholdReached(false);
        hasTriggeredHaptic.current = false;
      }
    },

    onSwipedLeft: (eventData: SwipeEventData) => {
      if (!opts.enableLeft) return;

      if (Math.abs(eventData.deltaX) >= opts.threshold!) {
        opts.onSwipeLeft?.();
      }
      reset();
    },

    onSwipedRight: (eventData: SwipeEventData) => {
      if (!opts.enableRight) return;

      if (Math.abs(eventData.deltaX) >= opts.threshold!) {
        opts.onSwipeRight?.();
      }
      reset();
    },

    onSwiped: () => {
      // Reset if swipe didn't reach threshold
      if (!thresholdReached) {
        reset();
      }
    },

    trackMouse: false,
    trackTouch: true,
    delta: 10,
    preventScrollOnSwipe: true,
    rotationAngle: 0,
  });

  return {
    handlers,
    offset,
    isSwiping,
    direction,
    thresholdReached,
    reset,
  };
}

// Hook for pull-to-refresh
interface PullToRefreshConfig {
  // Threshold in pixels before refresh is triggered
  threshold?: number;
  // Max pull distance
  maxPull?: number;
  // Callback when threshold is reached and released
  onRefresh: () => Promise<void>;
  // Whether refresh is currently happening
  isRefreshing?: boolean;
}

interface PullToRefreshReturn {
  handlers: ReturnType<typeof useSwipeable>;
  pullDistance: number;
  isPulling: boolean;
  thresholdReached: boolean;
}

export function usePullToRefresh(config: PullToRefreshConfig): PullToRefreshReturn {
  const { threshold = 80, maxPull = 120, onRefresh, isRefreshing = false } = config;

  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [thresholdReached, setThresholdReached] = useState(false);

  const hasTriggeredHaptic = useRef(false);

  const handlers = useSwipeable({
    onSwiping: (eventData: SwipeEventData) => {
      if (isRefreshing) return;

      const { deltaY, dir } = eventData;

      // Only handle downward swipes at top of page
      if (dir !== 'Down') return;
      if (window.scrollY > 0) return;

      setIsPulling(true);

      // Calculate bounded pull distance with resistance
      const resistance = 0.5;
      let newPull = deltaY * resistance;
      if (newPull > maxPull) {
        newPull = maxPull;
      }

      setPullDistance(Math.max(0, newPull));

      // Check threshold
      const reached = newPull >= threshold;
      if (reached && !thresholdReached) {
        setThresholdReached(true);
        if (!hasTriggeredHaptic.current) {
          hapticFeedback('medium');
          hasTriggeredHaptic.current = true;
        }
      } else if (!reached && thresholdReached) {
        setThresholdReached(false);
        hasTriggeredHaptic.current = false;
      }
    },

    onSwipedDown: async () => {
      if (isRefreshing) return;

      if (thresholdReached) {
        await onRefresh();
      }

      setPullDistance(0);
      setIsPulling(false);
      setThresholdReached(false);
      hasTriggeredHaptic.current = false;
    },

    onSwiped: () => {
      if (!thresholdReached) {
        setPullDistance(0);
        setIsPulling(false);
      }
    },

    trackMouse: false,
    trackTouch: true,
    delta: 10,
  });

  return {
    handlers,
    pullDistance,
    isPulling,
    thresholdReached,
  };
}
