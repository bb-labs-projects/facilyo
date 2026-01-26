'use client';

import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Header, PageContainer } from '@/components/layout/header';
import { IssueForm } from '@/components/issues/issue-form';
import { useAuthStore } from '@/stores/auth-store';
import { useGeolocation } from '@/hooks/use-geolocation';
import { getClient } from '@/lib/supabase/client';
import type { Property } from '@/types/database';
import type { IssueFormData } from '@/lib/validations';

export default function NewIssuePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useAuthStore((state) => state.profile);
  const { coords } = useGeolocation();

  // Fetch assigned properties
  const { data: properties = [] } = useQuery({
    queryKey: ['properties', profile?.id],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('property_assignments')
        .select('property:properties(*)')
        .eq('user_id', profile!.id);

      if (error) throw error;
      return (data as { property: Property }[]).map((d) => d.property);
    },
    enabled: !!profile?.id,
  });

  // Create issue mutation
  const { mutate: createIssue, isPending } = useMutation({
    mutationFn: async (data: IssueFormData) => {
      const supabase = getClient();

      const { data: issue, error } = await (supabase
        .from('issues') as any)
        .insert({
          property_id: data.propertyId,
          reported_by: profile!.id,
          category: data.category,
          priority: data.priority,
          title: data.title,
          description: data.description || null,
          photo_urls: data.photoUrls || [],
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return issue;
    },
    onSuccess: () => {
      toast.success('Problem wurde gemeldet');
      // Invalidate all meldungen queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['meldungen'] });
      router.push('/issues');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Problem konnte nicht gemeldet werden');
    },
  });

  const handleSubmit = async (data: IssueFormData) => {
    createIssue(data);
  };

  return (
    <PageContainer
      header={
        <Header
          title="Problem melden"
          showBack
          backHref="/issues"
        />
      }
    >
      <IssueForm
        properties={properties}
        userCoords={coords}
        onSubmit={handleSubmit}
        isSubmitting={isPending}
      />
    </PageContainer>
  );
}
