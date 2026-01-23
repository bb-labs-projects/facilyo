'use client';

import { useCallback, useEffect, useState } from 'react';

interface Coordinates {
  lat: number;
  lng: number;
}

interface GeolocationState {
  coords: Coordinates | null;
  accuracy: number | null;
  error: string | null;
  isWatching: boolean;
  isLoading: boolean;
  timestamp: number | null;
}

interface UseGeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
  watchOnMount?: boolean;
}

interface UseGeolocationReturn extends GeolocationState {
  startWatching: () => void;
  stopWatching: () => void;
  getCurrentPosition: () => Promise<Coordinates>;
  clearError: () => void;
}

const defaultOptions: UseGeolocationOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 30000,
  watchOnMount: false,
};

export function useGeolocation(
  options: UseGeolocationOptions = {}
): UseGeolocationReturn {
  const opts = { ...defaultOptions, ...options };

  const [state, setState] = useState<GeolocationState>({
    coords: null,
    accuracy: null,
    error: null,
    isWatching: false,
    isLoading: false,
    timestamp: null,
  });

  const [watchId, setWatchId] = useState<number | null>(null);

  const handleSuccess = useCallback((position: GeolocationPosition) => {
    setState((prev) => ({
      ...prev,
      coords: {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      },
      accuracy: position.coords.accuracy,
      error: null,
      isLoading: false,
      timestamp: position.timestamp,
    }));
  }, []);

  const handleError = useCallback((error: GeolocationPositionError) => {
    let message = 'Standort konnte nicht ermittelt werden';
    switch (error.code) {
      case error.PERMISSION_DENIED:
        message = 'Standortzugriff verweigert';
        break;
      case error.POSITION_UNAVAILABLE:
        message = 'Standort nicht verfügbar';
        break;
      case error.TIMEOUT:
        message = 'Standortabfrage Zeitüberschreitung';
        break;
    }
    setState((prev) => ({
      ...prev,
      error: message,
      isLoading: false,
    }));
  }, []);

  const getCurrentPosition = useCallback((): Promise<Coordinates> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const error = 'Geolocation wird nicht unterstützt';
        setState((prev) => ({ ...prev, error }));
        reject(new Error(error));
        return;
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          handleSuccess(position);
          resolve(coords);
        },
        (error) => {
          handleError(error);
          reject(error);
        },
        {
          enableHighAccuracy: opts.enableHighAccuracy,
          timeout: opts.timeout,
          maximumAge: opts.maximumAge,
        }
      );
    });
  }, [opts.enableHighAccuracy, opts.timeout, opts.maximumAge, handleSuccess, handleError]);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        error: 'Geolocation wird nicht unterstützt',
      }));
      return;
    }

    if (watchId !== null) return;

    const id = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      {
        enableHighAccuracy: opts.enableHighAccuracy,
        timeout: opts.timeout,
        maximumAge: opts.maximumAge,
      }
    );

    setWatchId(id);
    setState((prev) => ({ ...prev, isWatching: true }));
  }, [watchId, opts.enableHighAccuracy, opts.timeout, opts.maximumAge, handleSuccess, handleError]);

  const stopWatching = useCallback(() => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
      setState((prev) => ({ ...prev, isWatching: false }));
    }
  }, [watchId]);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  // Start watching on mount if option is set
  useEffect(() => {
    if (opts.watchOnMount) {
      startWatching();
    }

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [opts.watchOnMount, startWatching, watchId]);

  return {
    ...state,
    startWatching,
    stopWatching,
    getCurrentPosition,
    clearError,
  };
}
