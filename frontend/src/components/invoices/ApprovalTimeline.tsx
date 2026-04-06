'use client';

import { CheckCircle2, XCircle, Clock, ArrowUpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatDateRelative } from '@/lib/utils';
import type { ApprovalWithUser } from '@/types';

const DECISION_CONFIG = {
  approved:  { icon: CheckCircle2, color: 'text-green-600', variant: 'success'  as const },
  rejected:  { icon: XCircle,      color: 'text-red-600',   variant: 'destructive' as const },
  escalated: { icon: ArrowUpCircle,color: 'text-orange-600',variant: 'warning'  as const },
  pending:   { icon: Clock,        color: 'text-blue-500',  variant: 'info'     as const },
};

interface Props {
  approvals: ApprovalWithUser[];
}

export function ApprovalTimeline({ approvals }: Props) {
  if (approvals.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        No approval events yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {approvals.map((approval, idx) => {
        const config = DECISION_CONFIG[approval.decision];
        const Icon = config.icon;
        const isLast = idx === approvals.length - 1;

        return (
          <div key={approval.approval_id} className="relative flex gap-3">
            {/* Connector line */}
            {!isLast && (
              <div className="absolute left-3.5 top-7 h-full w-px bg-border" />
            )}
            <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background ${config.color}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 pb-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{approval.approver_name}</p>
                <Badge variant={config.variant} className="text-xs capitalize">
                  {approval.decision}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Stage {approval.stage} · {formatDateRelative(approval.timestamp)}
              </p>
              {approval.comments && (
                <p className="mt-1 rounded-md bg-muted px-2 py-1 text-xs italic text-muted-foreground">
                  "{approval.comments}"
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
