'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchExtractionFields, fetchUsers, updateExtractionFields } from '@/lib/api';
import type { ExtractionFieldConfig } from '@/types';

export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: fetchUsers,
  });
}

export function useExtractionFields() {
  return useQuery({
    queryKey: ['admin', 'extraction-fields'],
    queryFn: fetchExtractionFields,
  });
}

export function useUpdateExtractionFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fields: ExtractionFieldConfig[]) => updateExtractionFields(fields),
    onSuccess: (data) => {
      qc.setQueryData(['admin', 'extraction-fields'], data);
    },
  });
}
