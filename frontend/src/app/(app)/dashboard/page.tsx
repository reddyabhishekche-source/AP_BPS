'use client';

import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { StatsCards } from '@/components/dashboard/StatsCards';
import { AgingChart } from '@/components/dashboard/AgingChart';
import { RecentInvoices } from '@/components/dashboard/RecentInvoices';
import { useDashboardStats, useRecentInvoices } from '@/hooks/useDashboard';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { data: stats, isLoading: statsLoading, isFetching: statsFetching } = useDashboardStats();
  const { data: recentData, isLoading: recentLoading, isFetching: recentFetching } = useRecentInvoices();
  const refreshing = statsFetching || recentFetching;

  async function handleRefreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['invoices', 'recent'] }),
    ]);
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Dashboard" />
      <div className="flex-1 space-y-6 p-6">
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => void handleRefreshAll()} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh All'}
          </Button>
        </div>
        <StatsCards stats={stats} loading={statsLoading} />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <AgingChart stats={stats} loading={statsLoading} />
          </div>
          <div className="lg:col-span-2">
            <RecentInvoices invoices={recentData?.data} loading={recentLoading} />
          </div>
        </div>
      </div>
    </div>
  );
}
