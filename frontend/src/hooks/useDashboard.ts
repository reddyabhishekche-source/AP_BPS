import { useQuery } from '@tanstack/react-query';
import { fetchDashboardStats, fetchInvoices } from '@/lib/api';

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: fetchDashboardStats,
    refetchInterval: 30_000,
  });
}

export function useRecentInvoices() {
  return useQuery({
    queryKey: ['invoices', 'recent'],
    queryFn: () => fetchInvoices({ page: 1, limit: 10 }),
    refetchInterval: 30_000,
  });
}
