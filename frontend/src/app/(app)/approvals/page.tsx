'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { ApprovalCard } from '@/components/approvals/ApprovalCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useApprovals } from '@/hooks/useApprovals';

export default function ApprovalsPage() {
  const { data, isLoading } = useApprovals({ status: 'pending', limit: 50 });
  const approvals = data?.data ?? [];

  return (
    <div className="flex flex-col h-full">
      <Header title="Approvals" />
      <div className="flex-1 p-6">
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-sm font-semibold text-slate-700">Pending Approvals</h2>
          {!isLoading && (
            <Badge variant="info">{data?.total ?? 0} items</Badge>
          )}
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        ) : approvals.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-muted-foreground">
            <p className="text-sm font-medium">No pending approvals</p>
            <p className="text-xs">All caught up!</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {approvals.map((approval) => (
              <ApprovalCard key={approval.approval_id} approval={approval} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
