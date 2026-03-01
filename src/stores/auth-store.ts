'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '@/types/database';
import { getClient } from '@/lib/supabase/client';

// Debounce helper for refreshProfile
let isRefreshingProfile = false;
let lastProfileRefresh = 0;

interface AuthState {
  user: User | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  mustChangePassword: boolean;
  username: string | null;
  organizationId: string | null;
  isSuperAdmin: boolean;
}

interface LoginResponse {
  success: boolean;
  user: {
    id: string;
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    role: string;
  };
  organizationId: string;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
  sessionToken?: string;
  error?: string;
  locked?: boolean;
  minutesRemaining?: number;
  attemptsRemaining?: number;
}

interface AuthActions {
  login: (username: string, password: string) => Promise<{ mustChangePassword: boolean }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  clearError: () => void;
  clearMustChangePassword: () => void;
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
      mustChangePassword: false,
      username: null,
      organizationId: null,
      isSuperAdmin: false,

      // Actions
      login: async (username: string, password: string) => {
        const supabase = getClient();
        set({ isLoading: true, error: null });

        try {
          // Step 1: Call our custom login API to verify credentials
          // This checks username/password against auth_credentials, handles lockout, etc.
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
          });

          let data: LoginResponse;
          try {
            data = await response.json();
          } catch {
            const errorMessage = 'Server-Fehler: Ungültige Antwort';
            set({ error: errorMessage, isLoading: false });
            throw new Error(errorMessage);
          }

          if (!response.ok) {
            const errorMessage = data.error || 'Anmeldung fehlgeschlagen';
            set({ error: errorMessage, isLoading: false });
            throw new Error(errorMessage);
          }

          // Step 2: Sign in to Supabase using the user's email and password
          // The password is synced between our auth_credentials and Supabase auth
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: data.user.email,
            password: password,
          });

          if (authError) {
            console.error('Supabase sign-in error:', authError);
            // Our API already verified the password, so this shouldn't happen
            // but if it does, still allow the user to proceed
          }

          set({
            user: authData?.user || null,
            isAuthenticated: true,
            isLoading: false,
            mustChangePassword: data.mustChangePassword,
            username: data.user.username,
            organizationId: data.organizationId,
            isSuperAdmin: data.isSuperAdmin,
          });

          // Fetch profile after login
          await get().refreshProfile();

          return { mustChangePassword: data.mustChangePassword };
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
            mustChangePassword: false,
            username: null,
            organizationId: null,
            isSuperAdmin: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      refreshProfile: async () => {
        // Debounce: prevent duplicate calls within 2 seconds
        const now = Date.now();
        if (isRefreshingProfile || now - lastProfileRefresh < 2000) {
          return;
        }

        isRefreshingProfile = true;
        lastProfileRefresh = now;

        try {
          const supabase = getClient();
          let { user } = get();

          if (!user) {
            // Try to get user from session
            const { data: { user: sessionUser } } = await supabase.auth.getUser();
            if (sessionUser) {
              set({ user: sessionUser, isAuthenticated: true });
              user = sessionUser;
            } else {
              return;
            }
          }

          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

          if (error) throw error;
          const profileData = data as Profile;
          set({
            profile: profileData,
            organizationId: profileData.organization_id,
            isSuperAdmin: profileData.is_super_admin,
          });
        } catch (error: unknown) {
          // Ignore AbortError - happens when switching tabs quickly or rapid actions
          const errorMessage = error instanceof Error
            ? error.message
            : (error as { message?: string })?.message || '';
          if (errorMessage.includes('AbortError') || errorMessage.includes('aborted')) {
            return;
          }
          // Only log non-abort errors
          console.error('Failed to fetch profile:', error);
        } finally {
          isRefreshingProfile = false;
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

      clearMustChangePassword: () => {
        set({ mustChangePassword: false });
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
        mustChangePassword: state.mustChangePassword,
        username: state.username,
        organizationId: state.organizationId,
        isSuperAdmin: state.isSuperAdmin,
      }),
    }
  )
);

// Selectors
export const selectUser = (state: AuthStore) => state.user;
export const selectProfile = (state: AuthStore) => state.profile;
export const selectIsAuthenticated = (state: AuthStore) => state.isAuthenticated;
export const selectIsLoading = (state: AuthStore) => state.isLoading;
export const selectMustChangePassword = (state: AuthStore) => state.mustChangePassword;
export const selectUsername = (state: AuthStore) => state.username;
export const selectOrganizationId = (state: AuthStore) => state.organizationId;
export const selectIsSuperAdmin = (state: AuthStore) => state.isSuperAdmin;
export const selectFullName = (state: AuthStore) => {
  const { profile } = state;
  if (!profile) return '';
  return [profile.first_name, profile.last_name].filter(Boolean).join(' ');
};
