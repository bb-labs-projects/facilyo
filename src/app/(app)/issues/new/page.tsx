'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Header, PageContainer } from '@/components/layout/header';
import { IssueForm } from '@/components/issues/issue-form';
import { useAuthStore } from '@/stores/auth-store';
import { useGeolocation } from '@/hooks/use-geolocation';
import { useSimpleMutation } from '@/hooks/use-optimistic-mutation';
import { getClient } from '@/lib/supabase/client';
import type { Property, IssueInsert } from '@/types/database';
import type { IssueFormData } from '@/lib/validations';

export default function NewIssuePage() {
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);
  const { coords, getCurrentPosition } = useGeolocation();

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
  const { mutate: createIssue, isPending } = useSimpleMutation({
    mutationFn: async (data: IssueFormData) => {
      const supabase = getClient();

      const issueData: IssueInsert = {
        property_id: data.propertyId,
        reported_by: profile!.id,
        category: data.category,
        priority: data.priority,
        title: data.title,
        description: data.description || null,
        photo_urls: data.photoUrls || [],
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      };

      const { data: issue, error } = await supabase
        .from('issues')
        .insert(issueData)
        .select()
        .single();

      if (error) throw error;
      return issue;
    },
    queryKey: ['issues'],
    successMessage: 'Problem wurde gemeldet',
    errorMessage: 'Problem konnte nicht gemeldet werden',
    onSuccess: () => {
      router.push('/issues');
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
