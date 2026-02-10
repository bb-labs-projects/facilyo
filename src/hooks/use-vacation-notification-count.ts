import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { usePermissions } from '@/hooks/use-permissions';
import { getClient } from '@/lib/supabase/client';

const LAST_SEEN_KEY_PREFIX = 'vacation-notifications-seen-';

export function useVacationNotificationCount() {
  const profile = useAuthStore((state) => state.profile);
  const queryClient = useQueryClient();
  const { canManageVacations } = usePermissions();
  const lastSeenKey = `${LAST_SEEN_KEY_PREFIX}${profile?.id}`;

  const { data: count = 0 } = useQuery({
    queryKey: ['vacation-notification-count', profile?.id, canManageVacations],
    queryFn: async () => {
      const supabase = getClient();

      if (canManageVacations) {
        // Privileged users: count pending vacation requests
        const { count, error } = await supabase
          .from('vacation_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');

        if (error) throw error;
        return count ?? 0;
      }

      // Regular users: count own requests reviewed since last seen
      const lastSeen = typeof window !== 'undefined'
        ? localStorage.getItem(lastSeenKey)
        : null;

      let query = supabase
        .from('vacation_requests')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile!.id)
        .in('status', ['approved', 'rejected'])
        .not('reviewed_at', 'is', null);

      if (lastSeen) {
        query = query.gt('reviewed_at', lastSeen);
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
    queryClient.invalidateQueries({ queryKey: ['vacation-notification-count'] });
  }, [lastSeenKey, queryClient]);

  return { count, markAsSeen };
}
