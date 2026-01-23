'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Header, PageContainer } from '@/components/layout/header';
import { AufgabeForm } from '@/components/aufgaben/aufgabe-form';
import { useAuthStore } from '@/stores/auth-store';
import { usePermissions } from '@/hooks/use-permissions';
import { getClient } from '@/lib/supabase/client';
import type { AufgabeInsert } from '@/types/database';

export default function NewAufgabePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useAuthStore((state) => state.profile);
  const permissions = usePermissions();

  const createMutation = useMutation({
    mutationFn: async (data: AufgabeInsert) => {
      const supabase = getClient();
      const { data: result, error } = await supabase
        .from('aufgaben')
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: (data) => {
      toast.success('Aufgabe wurde erstellt');
      queryClient.invalidateQueries({ queryKey: ['aufgaben'] });
      router.push(`/tasks/${data.id}`);
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  // Redirect if user doesn't have permission
  if (!permissions.canManageAufgaben) {
    router.push('/tasks');
    return null;
  }

  return (
    <PageContainer
      header={<Header title="Neue Aufgabe" showBack />}
    >
      <AufgabeForm
        mode="create"
        onSubmit={(data) => createMutation.mutate(data as AufgabeInsert)}
        onCancel={() => router.back()}
        isLoading={createMutation.isPending}
      />
    </PageContainer>
  );
}
