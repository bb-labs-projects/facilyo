'use client';

import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { toast } from 'sonner';

interface OptimisticMutationOptions<TData, TVariables, TContext> {
  // The mutation function
  mutationFn: (variables: TVariables) => Promise<TData>;
  // Query key to invalidate on success
  queryKey: unknown[];
  // Function to optimistically update the cache
  optimisticUpdate?: (
    oldData: TData | undefined,
    variables: TVariables
  ) => TData;
  // Success message (German)
  successMessage?: string;
  // Error message (German)
  errorMessage?: string;
  // Additional mutation options
  options?: Omit<
    UseMutationOptions<TData, Error, TVariables, TContext>,
    'mutationFn' | 'onMutate' | 'onError' | 'onSuccess' | 'onSettled'
  >;
}

export function useOptimisticMutation<
  TData,
  TVariables,
  TContext = { previousData: TData | undefined }
>({
  mutationFn,
  queryKey,
  optimisticUpdate,
  successMessage,
  errorMessage = 'Ein Fehler ist aufgetreten',
  options,
}: OptimisticMutationOptions<TData, TVariables, TContext>) {
  const queryClient = useQueryClient();

  return useMutation<TData, Error, TVariables, TContext>({
    mutationFn,
    ...options,

    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<TData>(queryKey);

      // Optimistically update to the new value
      if (optimisticUpdate && previousData !== undefined) {
        queryClient.setQueryData<TData>(queryKey, (old) =>
          optimisticUpdate(old, variables)
        );
      }

      // Return a context object with the snapshotted value
      return { previousData } as TContext;
    },

    onError: (error, _variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      const ctx = context as { previousData: TData | undefined } | undefined;
      if (ctx?.previousData !== undefined) {
        queryClient.setQueryData(queryKey, ctx.previousData);
      }

      // Show error toast
      toast.error(errorMessage, {
        description: error.message,
      });
    },

    onSuccess: (_data) => {
      // Show success toast if message provided
      if (successMessage) {
        toast.success(successMessage);
      }
    },

    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

// Simpler mutation hook without optimistic updates
interface SimpleMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  queryKey?: unknown[];
  successMessage?: string;
  errorMessage?: string;
  onSuccess?: (data: TData) => void;
  onError?: (error: Error) => void;
}

export function useSimpleMutation<TData, TVariables>({
  mutationFn,
  queryKey,
  successMessage,
  errorMessage = 'Ein Fehler ist aufgetreten',
  onSuccess,
  onError,
}: SimpleMutationOptions<TData, TVariables>) {
  const queryClient = useQueryClient();

  return useMutation<TData, Error, TVariables>({
    mutationFn,

    onError: (error) => {
      toast.error(errorMessage, {
        description: error.message,
      });
      onError?.(error);
    },

    onSuccess: (data) => {
      if (successMessage) {
        toast.success(successMessage);
      }
      onSuccess?.(data);
    },

    onSettled: () => {
      if (queryKey) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}
