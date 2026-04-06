import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApprovals, decideApproval, type ApprovalFilters } from '@/lib/api';
import type { ApprovalDecision } from '@/types';

export function useApprovals(filters: ApprovalFilters = {}) {
  return useQuery({
    queryKey: ['approvals', filters],
    queryFn: () => fetchApprovals(filters),
    refetchInterval: 30_000,
  });
}

export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      approvalId,
      decision,
      comments,
    }: {
      approvalId: string;
      decision: ApprovalDecision;
      comments?: string;
    }) => decideApproval(approvalId, decision, comments),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
