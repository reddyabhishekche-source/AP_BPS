'use client';

import { FileText, Clock, CheckCircle, AlertTriangle, Send, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardStats, InvoiceStatus } from '@/types';

interface StatConfig {
  label: string;
  statuses: InvoiceStatus[];
  icon: React.ElementType;
  colorClass: string;
  bgClass: string;
}

const STAT_CONFIGS: StatConfig[] = [
  {
    label: 'In Queue',
    statuses: ['received', 'processing'],
    icon: Clock,
    colorClass: 'text-blue-600',
    bgClass: 'bg-blue-50',
  },
  {
    label: 'Needs Review',
    statuses: ['verification', 'extracted'],
    icon: AlertTriangle,
    colorClass: 'text-yellow-600',
    bgClass: 'bg-yellow-50',
  },
  {
    label: 'Pending Approval',
    statuses: ['validated', 'pending_approval'],
    icon: Send,
    colorClass: 'text-purple-600',
    bgClass: 'bg-purple-50',
  },
  {
    label: 'Approved',
    statuses: ['approved'],
    icon: CheckCircle,
    colorClass: 'text-green-600',
    bgClass: 'bg-green-50',
  },
  {
    label: 'Posted',
    statuses: ['posted'],
    icon: FileText,
    colorClass: 'text-slate-600',
    bgClass: 'bg-slate-50',
  },
  {
    label: 'Rejected / Error',
    statuses: ['rejected', 'error'],
    icon: XCircle,
    colorClass: 'text-red-600',
    bgClass: 'bg-red-50',
  },
];

interface Props {
  stats: DashboardStats | undefined;
  loading: boolean;
}

export function StatsCards({ stats, loading }: Props) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <Skeleton className="h-8 w-8 rounded-lg mb-3" />
              <Skeleton className="h-6 w-12 mb-1" />
              <Skeleton className="h-4 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {STAT_CONFIGS.map(({ label, statuses, icon: Icon, colorClass, bgClass }) => {
        const count = statuses.reduce(
          (sum, s) => sum + (stats?.byStatus?.[s] ?? 0),
          0,
        );
        return (
          <Card key={label}>
            <CardContent className="p-5">
              <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${bgClass}`}>
                <Icon className={`h-5 w-5 ${colorClass}`} />
              </div>
              <p className="text-2xl font-bold text-slate-900">{count}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
