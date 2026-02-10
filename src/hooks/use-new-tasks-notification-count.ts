import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { usePermissions } from '@/hooks/use-permissions';
import { getClient } from '@/lib/supabase/client';

const LAST_SEEN_KEY_PREFIX = 'tasks-notifications-seen-';

export function useNewTasksNotificationCount() {
  const profile = useAuthStore((state) => state.profile);
  const queryClient = useQueryClient();
  const { isPrivileged } = usePermissions();
  const lastSeenKey = `${LAST_SEEN_KEY_PREFIX}${profile?.id}`;

  const { data: count = 0 } = useQuery({
    queryKey: ['new-tasks-notification-count', profile?.id, isPrivileged],
    queryFn: async () => {
      const supabase = getClient();

      const lastSeen = typeof window !== 'undefined'
        ? localStorage.getItem(lastSeenKey)
        : null;

      if (isPrivileged) {
        // Privileged users: count all converted tasks since last seen
        let query = supabase
          .from('aufgaben')
          .select('*', { count: 'exact', head: true })
          .not('source_meldung_id', 'is', null)
          .in('status', ['open', 'in_progress']);

        if (lastSeen) {
          query = query.gt('created_at', lastSeen);
        }

        const { count, error } = await query;
        if (error) throw error;
        return count ?? 0;
      }

      // Regular users: count converted tasks for their assigned properties
      const { data: assignments } = await (supabase as any)
        .from('property_assignments')
        .select('property_id')
        .eq('user_id', profile!.id);

      if (!assignments || assignments.length === 0) return 0;

      const propertyIds = (assignments as { property_id: string }[]).map((a) => a.property_id);

      let query = supabase
        .from('aufgaben')
        .select('*', { count: 'exact', head: true })
        .not('source_meldung_id', 'is', null)
        .in('property_id', propertyIds)
        .in('status', ['open', 'in_progress']);

      if (lastSeen) {
        query = query.gt('created_at', lastSeen);
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
    queryClient.invalidateQueries({ queryKey: ['new-tasks-notification-count'] });
  }, [lastSeenKey, queryClient]);

  return { count, markAsSeen };
}
