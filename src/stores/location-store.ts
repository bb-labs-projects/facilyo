'use client';

import { create } from 'zustand';
import type { Property } from '@/types/database';
import { calculateDistance } from '@/lib/utils';

interface Coordinates {
  lat: number;
  lng: number;
}

interface LocationState {
  coords: Coordinates | null;
  accuracy: number | null;
  error: string | null;
  isWatching: boolean;
  lastUpdated: Date | null;
  nearbyProperties: Property[];
  watchId: number | null;
}

interface LocationActions {
  getCurrentPosition: () => Promise<Coordinates>;
  startWatching: () => void;
  stopWatching: () => void;
  setCoords: (coords: Coordinates, accuracy?: number) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  findNearbyProperties: (properties: Property[], maxDistance?: number) => Property[];
  isWithinProperty: (property: Property) => boolean;
}

type LocationStore = LocationState & LocationActions;

const initialState: LocationState = {
  coords: null,
  accuracy: null,
  error: null,
  isWatching: false,
  lastUpdated: null,
  nearbyProperties: [],
  watchId: null,
};

export const useLocationStore = create<LocationStore>()((set, get) => ({
  ...initialState,

  getCurrentPosition: () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const error = 'Geolocation is not supported';
        set({ error });
        reject(new Error(error));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          set({
            coords,
            accuracy: position.coords.accuracy,
            error: null,
            lastUpdated: new Date(),
          });
          resolve(coords);
        },
        (error) => {
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
          set({ error: message });
          reject(new Error(message));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000,
        }
      );
    });
  },

  startWatching: () => {
    const { isWatching, watchId } = get();

    if (isWatching || watchId !== null) return;

    if (!navigator.geolocation) {
      set({ error: 'Geolocation is not supported' });
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (position) => {
        set({
          coords: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          accuracy: position.coords.accuracy,
          error: null,
          lastUpdated: new Date(),
        });
      },
      (error) => {
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
        set({ error: message });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    );

    set({ isWatching: true, watchId: id });
  },

  stopWatching: () => {
    const { watchId } = get();
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      set({ isWatching: false, watchId: null });
    }
  },

  setCoords: (coords, accuracy) => {
    set({
      coords,
      accuracy: accuracy ?? null,
      lastUpdated: new Date(),
      error: null,
    });
  },

  setError: (error) => {
    set({ error });
  },

  clearError: () => {
    set({ error: null });
  },

  findNearbyProperties: (properties, maxDistance = 500) => {
    const { coords } = get();
    if (!coords) return [];

    const nearby = properties
      .filter((p) => p.latitude !== null && p.longitude !== null)
      .map((property) => ({
        property,
        distance: calculateDistance(
          coords.lat,
          coords.lng,
          property.latitude!,
          property.longitude!
        ),
      }))
      .filter(({ distance }) => distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance)
      .map(({ property }) => property);

    set({ nearbyProperties: nearby });
    return nearby;
  },

  isWithinProperty: (property) => {
    const { coords } = get();
    if (!coords || !property.latitude || !property.longitude) return false;

    const distance = calculateDistance(
      coords.lat,
      coords.lng,
      property.latitude,
      property.longitude
    );

    return distance <= property.geofence_radius;
  },
}));

// Selectors
export const selectCoords = (state: LocationStore) => state.coords;
export const selectHasLocation = (state: LocationStore) => state.coords !== null;
export const selectLocationError = (state: LocationStore) => state.error;
export const selectNearbyProperties = (state: LocationStore) => state.nearbyProperties;
