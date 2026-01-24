'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TimeEntry, WorkDay, Property } from '@/types/database';
import { getClient } from '@/lib/supabase/client';

interface TimerState {
  // Active work day
  workDay: WorkDay | null;
  // Active time entry
  activeEntry: TimeEntry | null;
  activeProperty: Property | null;
  // Timer state
  isPaused: boolean;
  pauseStart: Date | null;
  totalPauseDuration: number; // in seconds
  // Break state (work day paused for lunch, etc.)
  isOnBreak: boolean;
  // Calculated values (not persisted)
  elapsedSeconds: number;
}

interface TimerActions {
  // Work day actions
  startWorkDay: () => Promise<WorkDay>;
  endWorkDay: () => Promise<void>;
  takeBreak: () => Promise<void>;
  setWorkDay: (workDay: WorkDay | null) => void;
  // Time entry actions
  startTimer: (propertyId: string, coords?: { lat: number; lng: number }) => Promise<TimeEntry>;
  pauseTimer: () => void;
  resumeTimer: () => void;
  stopTimer: (coords?: { lat: number; lng: number }, notes?: string) => Promise<TimeEntry>;
  // State management
  setActiveEntry: (entry: TimeEntry | null) => void;
  setActiveProperty: (property: Property | null) => void;
  setElapsedSeconds: (seconds: number) => void;
  setIsOnBreak: (isOnBreak: boolean) => void;
  // Initialization
  initializeFromServer: () => Promise<void>;
  reset: () => void;
}

type TimerStore = TimerState & TimerActions;

const initialState: TimerState = {
  workDay: null,
  activeEntry: null,
  activeProperty: null,
  isPaused: false,
  pauseStart: null,
  totalPauseDuration: 0,
  isOnBreak: false,
  elapsedSeconds: 0,
};

export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Work day actions
      startWorkDay: async () => {
        const supabase = getClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) throw new Error('Not authenticated');

        const today = new Date().toISOString().split('T')[0];
        const now = new Date().toISOString();

        // Check if there's already a work day for today (active or ended)
        const { data: existingWorkDay } = await (supabase
          .from('work_days') as any)
          .select()
          .eq('user_id', user.id)
          .eq('date', today)
          .single();

        if (existingWorkDay) {
          // Re-open the existing work day (e.g., after lunch break)
          const { data, error } = await (supabase
            .from('work_days') as any)
            .update({ end_time: null })
            .eq('id', existingWorkDay.id)
            .select()
            .single();

          if (error) throw error;

          set({ workDay: data });
          return data;
        }

        // Create new work day
        const { data, error } = await (supabase
          .from('work_days') as any)
          .insert({
            user_id: user.id,
            date: today,
            start_time: now,
          })
          .select()
          .single();

        if (error) throw error;

        set({ workDay: data, isOnBreak: false });
        return data;
      },

      endWorkDay: async () => {
        const supabase = getClient();
        const { workDay, activeEntry } = get();

        if (!workDay) throw new Error('No active work day');

        // Stop any active timer first
        if (activeEntry) {
          await get().stopTimer();
        }

        const { error } = await (supabase
          .from('work_days') as any)
          .update({ end_time: new Date().toISOString() })
          .eq('id', workDay.id);

        if (error) throw error;

        set({
          workDay: null,
          activeEntry: null,
          activeProperty: null,
          isPaused: false,
          pauseStart: null,
          totalPauseDuration: 0,
          isOnBreak: false,
          elapsedSeconds: 0,
        });
      },

      takeBreak: async () => {
        const supabase = getClient();
        const { workDay, activeEntry } = get();

        if (!workDay) throw new Error('No active work day');

        // Stop any active timer first
        if (activeEntry) {
          await get().stopTimer();
        }

        const { error } = await (supabase
          .from('work_days') as any)
          .update({ end_time: new Date().toISOString() })
          .eq('id', workDay.id);

        if (error) throw error;

        set({
          workDay: null,
          activeEntry: null,
          activeProperty: null,
          isPaused: false,
          pauseStart: null,
          totalPauseDuration: 0,
          isOnBreak: true,
          elapsedSeconds: 0,
        });
      },

      setWorkDay: (workDay) => {
        set({ workDay });
      },

      setIsOnBreak: (isOnBreak) => {
        set({ isOnBreak });
      },

      // Time entry actions
      startTimer: async (propertyId, coords) => {
        const supabase = getClient();
        const { workDay } = get();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) throw new Error('Not authenticated');
        if (!workDay) throw new Error('No active work day');

        const now = new Date().toISOString();

        const { data: entry, error } = await (supabase
          .from('time_entries') as any)
          .insert({
            work_day_id: workDay.id,
            user_id: user.id,
            property_id: propertyId,
            start_time: now,
            status: 'active',
            start_latitude: coords?.lat ?? null,
            start_longitude: coords?.lng ?? null,
            pause_duration: 0,
          })
          .select()
          .single();

        if (error) throw error;

        // Fetch property details
        const { data: property } = await supabase
          .from('properties')
          .select()
          .eq('id', propertyId)
          .single();

        set({
          activeEntry: entry,
          activeProperty: property,
          isPaused: false,
          pauseStart: null,
          totalPauseDuration: 0,
          elapsedSeconds: 0,
        });

        return entry;
      },

      pauseTimer: () => {
        const { activeEntry, isPaused } = get();
        if (!activeEntry || isPaused) return;

        set({
          isPaused: true,
          pauseStart: new Date(),
        });
      },

      resumeTimer: () => {
        const { activeEntry, isPaused, pauseStart, totalPauseDuration } = get();
        if (!activeEntry || !isPaused || !pauseStart) return;

        const pausedSeconds = Math.floor(
          (new Date().getTime() - new Date(pauseStart).getTime()) / 1000
        );

        set({
          isPaused: false,
          pauseStart: null,
          totalPauseDuration: totalPauseDuration + pausedSeconds,
        });
      },

      stopTimer: async (coords, notes) => {
        const supabase = getClient();
        const { activeEntry, isPaused, pauseStart, totalPauseDuration } = get();

        if (!activeEntry) throw new Error('No active timer');

        // Calculate final pause duration
        let finalPauseDuration = totalPauseDuration;
        if (isPaused && pauseStart) {
          const pausedSeconds = Math.floor(
            (new Date().getTime() - new Date(pauseStart).getTime()) / 1000
          );
          finalPauseDuration += pausedSeconds;
        }

        const now = new Date().toISOString();

        const { data, error } = await (supabase
          .from('time_entries') as any)
          .update({
            end_time: now,
            status: 'completed',
            pause_duration: finalPauseDuration,
            end_latitude: coords?.lat ?? null,
            end_longitude: coords?.lng ?? null,
            notes: notes ?? activeEntry.notes,
          })
          .eq('id', activeEntry.id)
          .select()
          .single();

        if (error) throw error;

        set({
          activeEntry: null,
          activeProperty: null,
          isPaused: false,
          pauseStart: null,
          totalPauseDuration: 0,
          elapsedSeconds: 0,
        });

        return data;
      },

      setActiveEntry: (entry) => {
        set({ activeEntry: entry });
      },

      setActiveProperty: (property) => {
        set({ activeProperty: property });
      },

      setElapsedSeconds: (seconds) => {
        set({ elapsedSeconds: seconds });
      },

      initializeFromServer: async () => {
        const supabase = getClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const today = new Date().toISOString().split('T')[0];

        // Check for active work day
        const { data: workDay } = await (supabase
          .from('work_days') as any)
          .select()
          .eq('user_id', user.id)
          .eq('date', today)
          .is('end_time', null)
          .single();

        if (workDay) {
          set({ workDay });

          // Check for active time entry
          const { data: entry } = await (supabase
            .from('time_entries') as any)
            .select()
            .eq('work_day_id', workDay.id)
            .eq('status', 'active')
            .single();

          if (entry) {
            // Fetch property
            const { data: property } = await (supabase
              .from('properties') as any)
              .select()
              .eq('id', entry.property_id)
              .single();

            set({
              activeEntry: entry,
              activeProperty: property,
              isPaused: false,
              totalPauseDuration: entry.pause_duration || 0,
            });
          }
        }
      },

      reset: () => {
        set(initialState);
      },
    }),
    {
      name: 'facility-track-timer',
      partialize: (state) => ({
        workDay: state.workDay,
        activeEntry: state.activeEntry,
        activeProperty: state.activeProperty,
        isPaused: state.isPaused,
        pauseStart: state.pauseStart,
        totalPauseDuration: state.totalPauseDuration,
        isOnBreak: state.isOnBreak,
      }),
    }
  )
);

// Selectors
export const selectIsWorkDayActive = (state: TimerStore) => !!state.workDay;
export const selectIsTimerActive = (state: TimerStore) => !!state.activeEntry;
export const selectIsOnBreak = (state: TimerStore) => state.isOnBreak;
export const selectTimerStatus = (state: TimerStore): 'active' | 'paused' | 'inactive' => {
  if (!state.activeEntry) return 'inactive';
  if (state.isPaused) return 'paused';
  return 'active';
};
