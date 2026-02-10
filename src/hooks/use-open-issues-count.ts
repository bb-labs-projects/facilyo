import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { usePermissions } from '@/hooks/use-permissions';
import { getClient } from '@/lib/supabase/client';

export function useOpenIssuesCount() {
  const profile = useAuthStore((state) => state.profile);
  const { isPrivileged } = usePermissions();

  const { data: count = 0 } = useQuery({
    queryKey: ['open-issues-count', profile?.id, isPrivileged],
    queryFn: async () => {
      if (!isPrivileged) return 0;

      const supabase = getClient();
      const { count, error } = await supabase
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open')
        .eq('converted_to_task', false);

      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!profile?.id,
    refetchInterval: 60000,
  });

  return count;
}
