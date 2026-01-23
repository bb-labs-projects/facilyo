'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '@/types/database';
import { getClient } from '@/lib/supabase/client';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  clearError: () => void;
  initialize: () => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // State
      user: null,
      profile: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      // Actions
      login: async (email: string, password: string) => {
        const supabase = getClient();
        set({ isLoading: true, error: null });

        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            set({ error: error.message, isLoading: false });
            throw error;
          }

          set({
            user: data.user,
            isAuthenticated: true,
            isLoading: false,
          });

          // Fetch profile after login
          await get().refreshProfile();
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        const supabase = getClient();
        set({ isLoading: true });

        try {
          await supabase.auth.signOut();
          set({
            user: null,
            profile: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      refreshProfile: async () => {
        const supabase = getClient();
        const { user } = get();

        if (!user) return;

        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

          if (error) throw error;

          set({ profile: data });
        } catch (error) {
          console.error('Failed to fetch profile:', error);
        }
      },

      setUser: (user) => {
        set({
          user,
          isAuthenticated: !!user,
        });
      },

      setProfile: (profile) => {
        set({ profile });
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      clearError: () => {
        set({ error: null });
      },

      initialize: async () => {
        const supabase = getClient();
        set({ isLoading: true });

        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (session?.user) {
            set({
              user: session.user,
              isAuthenticated: true,
            });
            await get().refreshProfile();
          }

          // Listen for auth changes
          supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
              set({
                user: session.user,
                isAuthenticated: true,
              });
              await get().refreshProfile();
            } else if (event === 'SIGNED_OUT') {
              set({
                user: null,
                profile: null,
                isAuthenticated: false,
              });
            }
          });
        } catch (error) {
          console.error('Failed to initialize auth:', error);
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'facility-track-auth',
      partialize: (state) => ({
        // Only persist minimal data
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Selectors
export const selectUser = (state: AuthStore) => state.user;
export const selectProfile = (state: AuthStore) => state.profile;
export const selectIsAuthenticated = (state: AuthStore) => state.isAuthenticated;
export const selectIsLoading = (state: AuthStore) => state.isLoading;
export const selectFullName = (state: AuthStore) => {
  const { profile } = state;
  if (!profile) return '';
  return [profile.first_name, profile.last_name].filter(Boolean).join(' ');
};
