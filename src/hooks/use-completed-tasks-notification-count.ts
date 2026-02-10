import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { usePermissions } from '@/hooks/use-permissions';
import { getClient } from '@/lib/supabase/client';

const LAST_SEEN_KEY_PREFIX = 'completed-tasks-notifications-seen-';

export function useCompletedTasksNotificationCount() {
  const profile = useAuthStore((state) => state.profile);
  const queryClient = useQueryClient();
  const { canAccessAdminPanel } = usePermissions();
  const lastSeenKey = `${LAST_SEEN_KEY_PREFIX}${profile?.id}`;

  const { data: count = 0 } = useQuery({
    queryKey: ['completed-tasks-notification-count', profile?.id, canAccessAdminPanel],
    queryFn: async () => {
      if (!canAccessAdminPanel) return 0;

      const supabase = getClient();

      const lastSeen = typeof window !== 'undefined'
        ? localStorage.getItem(lastSeenKey)
        : null;

      let query = (supabase as any)
        .from('aufgaben')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'resolved')
        .not('completed_at', 'is', null);

      if (lastSeen) {
        query = query.gt('completed_at', lastSeen);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!profile?.id,
    refetchInterval: 60000,
  });

  const markAsSeen = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(lastSeenKey, new Date().toISOString());
    }
    queryClient.invalidateQueries({ queryKey: ['completed-tasks-notification-count'] });
  }, [lastSeenKey, queryClient]);

  return { count, markAsSeen };
}
