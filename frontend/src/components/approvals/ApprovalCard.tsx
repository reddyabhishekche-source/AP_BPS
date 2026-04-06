'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle, XCircle, ArrowUpCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useDecideApproval } from '@/hooks/useApprovals';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate, truncate } from '@/lib/utils';
import type { ApprovalWithUser, ApprovalDecision } from '@/types';

interface Props {
  approval: ApprovalWithUser;
}

export function ApprovalCard({ approval }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<ApprovalDecision | null>(null);
  const [comments, setComments] = useState('');
  const { mutateAsync: decide, isPending } = useDecideApproval();

  const openDialog = (decision: ApprovalDecision) => {
    setPendingDecision(decision);
    setDialogOpen(true);
  };

  const handleDecide = async () => {
    if (!pendingDecision) return;
    try {
      await decide({ approvalId: approval.approval_id, decision: pendingDecision, comments });
      toast({
        title: `Invoice ${pendingDecision}`,
        variant: pendingDecision === 'approved' ? 'success' as never : 'destructive',
      });
      setDialogOpen(false);
      setComments('');
    } catch {
      toast({ title: 'Action failed', variant: 'destructive' });
    }
  };

  return (
    <>
      <div className="rounded-lg border bg-white p-5 shadow-sm hover:shadow transition-shadow">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                {approval.invoice_number ?? 'No number'}
              </span>
              <Badge variant="info" className="text-xs">Stage {approval.stage}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {truncate(approval.vendor_name, 40)}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold">
              {formatCurrency(approval.total, approval.currency)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDate(approval.invoice_date ?? null)}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="flex-1 bg-green-600 hover:bg-green-700"
            onClick={() => openDialog('approved')}
          >
            <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="flex-1"
            onClick={() => openDialog('rejected')}
          >
            <XCircle className="mr-1.5 h-3.5 w-3.5" />
            Reject
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openDialog('escalated')}
            title="Escalate"
          >
            <ArrowUpCircle className="h-3.5 w-3.5" />
          </Button>
          <Link href={`/invoices/${approval.invoice_id}`} target="_blank">
            <Button size="sm" variant="ghost" title="View invoice">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Confirm dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{pendingDecision} Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Invoice <span className="font-medium">{approval.invoice_number ?? 'N/A'}</span> from{' '}
              <span className="font-medium">{approval.vendor_name}</span> —{' '}
              {formatCurrency(approval.total, approval.currency)}
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Comments (optional)</label>
              <Textarea
                placeholder="Add a note…"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDecide}
              disabled={isPending}
              variant={pendingDecision === 'rejected' ? 'destructive' : 'default'}
              className={pendingDecision === 'approved' ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              {isPending ? 'Processing…' : `Confirm ${pendingDecision}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
