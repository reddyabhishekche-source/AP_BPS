import { Badge } from '@/components/ui/badge';
import type { InvoiceStatus } from '@/types';

const STATUS_CONFIG: Record<
  InvoiceStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'purple' }
> = {
  received:        { label: 'Received',        variant: 'info' },
  processing:      { label: 'Processing',      variant: 'info' },
  extracted:       { label: 'Extracted',       variant: 'secondary' },
  verification:    { label: 'Needs Review',    variant: 'warning' },
  validated:       { label: 'Validated',       variant: 'secondary' },
  pending_approval:{ label: 'Pending Approval',variant: 'purple' },
  approved:        { label: 'Approved',        variant: 'success' },
  rejected:        { label: 'Rejected',        variant: 'destructive' },
  posted:          { label: 'Posted',          variant: 'success' },
  error:           { label: 'Error',           variant: 'destructive' },
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: 'outline' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
