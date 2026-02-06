'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TimeEntry, WorkDay, Property, TimeEntryType, ActivityType } from '@/types/database';
import { getClient } from '@/lib/supabase/client';

interface TimerState {
  // Active work day
  workDay: WorkDay | null;
  // Current tracking mode
  currentEntryType: TimeEntryType | null;
  // Current activity type (for property work)
  currentActivityType: ActivityType | null;
  // Previous entry type (for resuming after break)
  previousEntryType: TimeEntryType | null;
  // Previous activity type (for resuming after break)
  previousActivityType: ActivityType | null;
  // Previous property (for resuming property work after break)
  previousPropertyId: string | null;
  // Active time entry (travel, property, or break)
  activeEntry: TimeEntry | null;
  activeProperty: Property | null;
  // Calculated values (not persisted)
  elapsedSeconds: number;
}

interface TimerActions {
  // Work day actions
  startWorkDay: () => Promise<WorkDay>;
  endWorkDay: (overrideEndTime?: string) => Promise<void>;
  setWorkDay: (workDay: WorkDay | null) => void;
  // Entry type actions
  startTravelTime: () => Promise<TimeEntry>;
  startPropertyWork: (propertyId: string, activityType: ActivityType, coords?: { lat: number; lng: number }) => Promise<TimeEntry>;
  stopPropertyWork: (coords?: { lat: number; lng: number }) => Promise<void>;
  updateActivityType: (activityType: ActivityType) => Promise<void>;
  startBreak: () => Promise<TimeEntry>;
  endBreak: () => Promise<void>;
  // Internal helpers
  stopCurrentEntry: (coords?: { lat: number; lng: number }, overrideEndTime?: string) => Promise<TimeEntry | null>;
  // State management
  setActiveEntry: (entry: TimeEntry | null) => void;
  setActiveProperty: (property: Property | null) => void;
  setElapsedSeconds: (seconds: number) => void;
  setCurrentEntryType: (type: TimeEntryType | null) => void;
  setCurrentActivityType: (type: ActivityType | null) => void;
  // Initialization
  initializeFromServer: () => Promise<{ autoClosedDates: string[] }>;
  reset: () => void;
}

type TimerStore = TimerState & TimerActions;

const initialState: TimerState = {
  workDay: null,
  currentEntryType: null,
  currentActivityType: null,
  previousEntryType: null,
  previousActivityType: null,
  previousPropertyId: null,
  activeEntry: null,
  activeProperty: null,
  elapsedSeconds: 0,
};

export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Start work day - automatically starts travel time
      startWorkDay: async () => {
        const supabase = getClient();

        // Refresh session first
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          throw new Error('Sitzung abgelaufen - bitte Seite neu laden');
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) throw new Error('Nicht authentifiziert - bitte Seite neu laden');

        const today = new Date().toISOString().split('T')[0];
        const now = new Date().toISOString();

        // Check if there's already a work day for today
        const { data: existingWorkDay } = await (supabase
          .from('work_days') as any)
          .select()
          .eq('user_id', user.id)
          .eq('date', today)
          .maybeSingle();

        if (existingWorkDay) {
          // Re-open existing work day
          const { data, error } = await (supabase
            .from('work_days') as any)
            .update({ end_time: null })
            .eq('id', existingWorkDay.id)
            .select()
            .single();

          if (error) throw error;
          set({ workDay: data });

          // Start travel time automatically
          await get().startTravelTime();
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

        set({ workDay: data });

        // Automatically start travel time when work day begins
        await get().startTravelTime();

        return data;
      },

      // End work day - finalized and cannot be restarted
      endWorkDay: async (overrideEndTime?) => {
        const supabase = getClient();
        const { workDay, activeEntry } = get();

        // Refresh session first
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          throw new Error('Sitzung abgelaufen - bitte Seite neu laden');
        }

        if (!workDay) throw new Error('Kein aktiver Arbeitstag');

        // Stop any active entry first
        if (activeEntry) {
          await get().stopCurrentEntry(undefined, overrideEndTime);
        }

        // Mark work day as ended (not finalized for testing)
        const { error } = await (supabase
          .from('work_days') as any)
          .update({
            end_time: overrideEndTime || new Date().toISOString()
          })
          .eq('id', workDay.id);

        if (error) throw error;

        set({
          workDay: null,
          currentEntryType: null,
          previousEntryType: null,
          previousPropertyId: null,
          activeEntry: null,
          activeProperty: null,
          elapsedSeconds: 0,
        });
      },

      setWorkDay: (workDay) => {
        set({ workDay });
      },

      // Start travel time entry (stops any current entry first)
      startTravelTime: async () => {
        const supabase = getClient();
        const { workDay, activeEntry } = get();

        // Refresh session first
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          throw new Error('Sitzung abgelaufen - bitte Seite neu laden');
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) throw new Error('Nicht authentifiziert - bitte Seite neu laden');
        if (!workDay) throw new Error('Kein aktiver Arbeitstag');

        // Stop any current entry first
        if (activeEntry) {
          await get().stopCurrentEntry();
        }

        const now = new Date().toISOString();

        const { data: entry, error } = await (supabase
          .from('time_entries') as any)
          .insert({
            work_day_id: workDay.id,
            user_id: user.id,
            property_id: null,
            entry_type: 'travel',
            start_time: now,
            status: 'active',
            pause_duration: 0,
          })
          .select()
          .single();

        if (error) throw error;

        set({
          activeEntry: entry,
          activeProperty: null,
          currentEntryType: 'travel',
          elapsedSeconds: 0,
        });

        return entry;
      },

      // Start working on a property (stops any current entry first)
      startPropertyWork: async (propertyId, activityType, coords) => {
        const supabase = getClient();
        const { workDay, activeEntry } = get();

        // Refresh session first
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          throw new Error('Sitzung abgelaufen - bitte Seite neu laden');
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) throw new Error('Nicht authentifiziert - bitte Seite neu laden');
        if (!workDay) throw new Error('Kein aktiver Arbeitstag');

        // Stop any current entry (travel, break, or another property)
        if (activeEntry) {
          await get().stopCurrentEntry(coords);
        }

        const now = new Date().toISOString();

        const { data: entry, error } = await (supabase
          .from('time_entries') as any)
          .insert({
            work_day_id: workDay.id,
            user_id: user.id,
            property_id: propertyId,
            entry_type: 'property',
            activity_type: activityType,
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
          currentEntryType: 'property',
          currentActivityType: activityType,
          elapsedSeconds: 0,
        });

        return entry;
      },

      // Stop property work (automatically starts travel time)
      stopPropertyWork: async (coords) => {
        const { activeEntry, currentEntryType } = get();

        if (!activeEntry || currentEntryType !== 'property') {
          throw new Error('No active property work');
        }

        // Stop the property entry
        await get().stopCurrentEntry(coords);

        // Clear activity type
        set({ currentActivityType: null });

        // Automatically start travel time
        await get().startTravelTime();
      },

      // Update activity type for current property work - creates a new entry to track time per activity
      updateActivityType: async (activityType) => {
        const supabase = getClient();
        const { workDay, activeEntry, currentEntryType, activeProperty } = get();

        if (!activeEntry || currentEntryType !== 'property' || !activeProperty) {
          throw new Error('Keine aktive Liegenschaftsarbeit');
        }

        // Refresh session first
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          throw new Error('Sitzung abgelaufen - bitte Seite neu laden');
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) throw new Error('Nicht authentifiziert - bitte Seite neu laden');
        if (!workDay) throw new Error('Kein aktiver Arbeitstag');

        const now = new Date().toISOString();

        // Stop current entry
        await (supabase
          .from('time_entries') as any)
          .update({
            end_time: now,
            status: 'completed',
          })
          .eq('id', activeEntry.id);

        // Create new entry with new activity type on same property
        const { data: newEntry, error } = await (supabase
          .from('time_entries') as any)
          .insert({
            work_day_id: workDay.id,
            user_id: user.id,
            property_id: activeProperty.id,
            entry_type: 'property',
            activity_type: activityType,
            start_time: now,
            status: 'active',
            pause_duration: 0,
          })
          .select()
          .single();

        if (error) throw error;

        set({
          activeEntry: newEntry,
          currentActivityType: activityType,
        });
      },

      // Start break (remembers previous state)
      startBreak: async () => {
        const supabase = getClient();
        const { workDay, activeEntry, currentEntryType, currentActivityType, activeProperty } = get();

        // Refresh session first
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          throw new Error('Sitzung abgelaufen - bitte Seite neu laden');
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) throw new Error('Nicht authentifiziert - bitte Seite neu laden');
        if (!workDay) throw new Error('Kein aktiver Arbeitstag');

        // Remember previous state for resuming after break
        const prevType = currentEntryType;
        const prevActivityType = currentActivityType;
        const prevPropertyId = activeProperty?.id || null;

        // Stop current entry if any
        if (activeEntry) {
          await get().stopCurrentEntry();
        }

        const now = new Date().toISOString();

        const { data: entry, error } = await (supabase
          .from('time_entries') as any)
          .insert({
            work_day_id: workDay.id,
            user_id: user.id,
            property_id: null,
            entry_type: 'break',
            start_time: now,
            status: 'active',
            pause_duration: 0,
          })
          .select()
          .single();

        if (error) throw error;

        set({
          activeEntry: entry,
          activeProperty: null,
          currentEntryType: 'break',
          currentActivityType: null,
          previousEntryType: prevType,
          previousActivityType: prevActivityType,
          previousPropertyId: prevPropertyId,
          elapsedSeconds: 0,
        });

        return entry;
      },

      // End break (resumes previous state)
      endBreak: async () => {
        const supabase = getClient();
        const { activeEntry, currentEntryType, previousEntryType, previousActivityType, previousPropertyId } = get();

        // Refresh session first
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          throw new Error('Sitzung abgelaufen - bitte Seite neu laden');
        }

        if (!activeEntry || currentEntryType !== 'break') {
          throw new Error('Keine aktive Pause');
        }

        // Stop the break entry
        await get().stopCurrentEntry();

        // Resume previous state
        if (previousEntryType === 'property' && previousPropertyId && previousActivityType) {
          // Resume property work on the same property with same activity
          await get().startPropertyWork(previousPropertyId, previousActivityType);
        } else {
          // Default to travel time
          await get().startTravelTime();
        }

        // Clear previous state
        set({
          previousEntryType: null,
          previousActivityType: null,
          previousPropertyId: null,
        });
      },

      // Internal: stop current entry
      stopCurrentEntry: async (coords, overrideEndTime) => {
        const supabase = getClient();
        const { activeEntry } = get();

        if (!activeEntry) return null;

        const now = overrideEndTime || new Date().toISOString();

        const { data, error } = await (supabase
          .from('time_entries') as any)
          .update({
            end_time: now,
            status: 'completed',
            end_latitude: coords?.lat ?? null,
            end_longitude: coords?.lng ?? null,
          })
          .eq('id', activeEntry.id)
          .select()
          .single();

        if (error) throw error;

        set({
          activeEntry: null,
          activeProperty: null,
          currentEntryType: null,
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

      setCurrentEntryType: (type) => {
        set({ currentEntryType: type });
      },

      setCurrentActivityType: (type) => {
        set({ currentActivityType: type });
      },

      initializeFromServer: async () => {
        const supabase = getClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const autoClosedDates: string[] = [];

        if (!user) return { autoClosedDates };

        // Check if persisted state belongs to a different user and reset if so
        const { workDay: persistedWorkDay } = get();
        if (persistedWorkDay && persistedWorkDay.user_id !== user.id) {
          // Reset store - persisted state is from a different user
          set(initialState);
        }

        const today = new Date().toISOString().split('T')[0];
        const now = new Date();

        // Auto-stop configuration: 23:00
        const AUTO_STOP_HOUR = 23;
        const AUTO_STOP_MINUTE = 0;

        // First, check for any open work days (including past days)
        const { data: openWorkDays } = await (supabase
          .from('work_days') as any)
          .select()
          .eq('user_id', user.id)
          .is('end_time', null)
          .order('date', { ascending: false });

        if (openWorkDays && openWorkDays.length > 0) {
          for (const openWorkDay of openWorkDays) {
            const workDayDate = openWorkDay.date;
            const isFromPastDay = workDayDate < today;

            // Check if it's today but past 23:00
            const isTodayPastAutoStop = workDayDate === today &&
              (now.getHours() > AUTO_STOP_HOUR ||
               (now.getHours() === AUTO_STOP_HOUR && now.getMinutes() >= AUTO_STOP_MINUTE));

            if (isFromPastDay || isTodayPastAutoStop) {
              // Calculate the auto-stop time (23:00 of the work day's date)
              const autoStopTime = new Date(`${workDayDate}T${String(AUTO_STOP_HOUR).padStart(2, '0')}:${String(AUTO_STOP_MINUTE).padStart(2, '0')}:00`);
              const autoStopTimeISO = autoStopTime.toISOString();

              // Close any active time entries for this work day
              await (supabase
                .from('time_entries') as any)
                .update({
                  end_time: autoStopTimeISO,
                  status: 'completed',
                })
                .eq('work_day_id', openWorkDay.id)
                .eq('status', 'active');

              // Close the work day
              await (supabase
                .from('work_days') as any)
                .update({
                  end_time: autoStopTimeISO,
                })
                .eq('id', openWorkDay.id);

              // Track auto-closed dates for notification
              autoClosedDates.push(workDayDate);
            }
          }
        }

        // Now check for today's active work day (may have been auto-closed above)
        const { data: workDay } = await (supabase
          .from('work_days') as any)
          .select()
          .eq('user_id', user.id)
          .eq('date', today)
          .is('end_time', null)
          .maybeSingle();

        if (workDay) {
          set({ workDay });

          // Check for active time entry
          const { data: entry } = await (supabase
            .from('time_entries') as any)
            .select()
            .eq('work_day_id', workDay.id)
            .eq('status', 'active')
            .maybeSingle();

          if (entry) {
            let property = null;
            if (entry.property_id) {
              const { data: prop } = await (supabase
                .from('properties') as any)
                .select()
                .eq('id', entry.property_id)
                .maybeSingle();
              property = prop;
            }

            set({
              activeEntry: entry,
              activeProperty: property,
              currentEntryType: entry.entry_type,
              currentActivityType: entry.activity_type || null,
            });
          }
        } else {
          // No active work day for this user - ensure state is clean
          set(initialState);
        }

        return { autoClosedDates };
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
        currentEntryType: state.currentEntryType,
        currentActivityType: state.currentActivityType,
        previousEntryType: state.previousEntryType,
        previousActivityType: state.previousActivityType,
        previousPropertyId: state.previousPropertyId,
      }),
    }
  )
);

// Selectors
export const selectIsWorkDayActive = (state: TimerStore) => !!state.workDay;
export const selectIsTimerActive = (state: TimerStore) => !!state.activeEntry;
export const selectCurrentEntryType = (state: TimerStore) => state.currentEntryType;
export const selectIsOnBreak = (state: TimerStore) => state.currentEntryType === 'break';
export const selectIsTraveling = (state: TimerStore) => state.currentEntryType === 'travel';
export const selectIsWorkingOnProperty = (state: TimerStore) => state.currentEntryType === 'property';
export const selectTimerStatus = (state: TimerStore): 'active' | 'paused' | 'inactive' => {
  if (!state.activeEntry) return 'inactive';
  return 'active';
};
