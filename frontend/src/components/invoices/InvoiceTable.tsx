'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from './StatusBadge';
import { cn, formatCurrency, formatDate, formatPercent, truncate } from '@/lib/utils';
import type { Invoice } from '@/types';

interface Props {
  invoices: Invoice[];
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  onPageChange: (p: number) => void;
}

type ConfidenceTone = 'green' | 'orange' | 'red';

function getConfidenceTone(value: number): ConfidenceTone {
  if (value > 0.9) return 'green';
  if (value > 0.6 && value < 0.9) return 'orange';
  return 'red';
}

function readFieldConfidence(inv: Invoice, fieldKey: string): number | null {
  const payload = inv.extraction_payload as { field_confidence?: Record<string, unknown> } | null;
  const raw = payload?.field_confidence?.[fieldKey];
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function FieldValueWithConfidence({ value, confidence }: { value: string; confidence: number | null }) {
  if (confidence == null) {
    return (
      <div className="min-w-[100px]">
        <p className="text-[12px] font-medium text-slate-700">{value || '-'}</p>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1.5 w-full rounded-full bg-slate-200" />
          <span className="min-w-[34px] text-[10px] font-semibold text-slate-500">N/A</span>
        </div>
      </div>
    );
  }
  const tone = getConfidenceTone(confidence);
  return (
    <div className="min-w-[100px]">
      <p className="text-[12px] font-medium text-slate-700">{value || '-'}</p>
      <div className="mt-1 flex items-center gap-2">
        <div className="h-1.5 w-full rounded-full bg-slate-200">
          <div
            className={cn(
              'h-1.5 rounded-full',
              tone === 'green' && 'bg-emerald-500',
              tone === 'orange' && 'bg-amber-500',
              tone === 'red' && 'bg-rose-500',
            )}
            style={{ width: `${Math.round(confidence * 100)}%` }}
          />
        </div>
        <span
          className={cn(
            'min-w-[34px] text-[10px] font-semibold',
            tone === 'green' && 'text-emerald-700',
            tone === 'orange' && 'text-amber-700',
            tone === 'red' && 'text-rose-700',
          )}
        >
          {formatPercent(confidence)}
        </span>
      </div>
    </div>
  );
}

export function InvoiceTable({ invoices, total, page, totalPages, loading, onPageChange }: Props) {
  const router = useRouter();
  const openInvoice = (invoiceId: string) => {
    try {
      router.push(`/invoices/${invoiceId}`);
    } catch {
      if (typeof window !== 'undefined') window.location.assign(`/invoices/${invoiceId}`);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2 rounded-xl border bg-white p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-violet-600 px-4 py-2.5 text-xs font-semibold text-white">
        Invoice Review
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-slate-100/80 hover:bg-slate-100/80">
            <TableHead>Status</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Invoice Number</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead>Invoice Date</TableHead>
            <TableHead>Due Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                No invoices found.
              </TableCell>
            </TableRow>
          )}

          {invoices.map((inv) => {
            const invoiceNumberConfidence = readFieldConfidence(inv, 'invoice_number');
            const amountConfidence = readFieldConfidence(inv, 'total');
            const currencyConfidence = readFieldConfidence(inv, 'currency');
            const invoiceDateConfidence = readFieldConfidence(inv, 'invoice_date');
            const dueDateConfidence = readFieldConfidence(inv, 'due_date');

            return (
              <TableRow
                key={inv.invoice_id}
                className="cursor-pointer bg-white hover:bg-slate-50"
                onClick={(e) => {
                  const target = e.target as HTMLElement | null;
                  if (target?.closest('a,button,input,select,textarea,label')) return;
                  openInvoice(inv.invoice_id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openInvoice(inv.invoice_id);
                  }
                }}
                tabIndex={0}
                role="link"
                aria-label={`Open invoice ${inv.invoice_number ?? inv.invoice_id}`}
              >
                <TableCell>
                  <StatusBadge status={inv.status} />
                </TableCell>

                <TableCell>
                  <div className="min-w-[150px]">
                    <p className="text-sm font-medium text-slate-800">{truncate(inv.vendor_name, 32)}</p>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{inv.source_channel}</p>
                  </div>
                </TableCell>

                <TableCell>
                  <Link
                    href={`/invoices/${inv.invoice_id}`}
                    className="inline-block text-blue-700 hover:underline"
                  >
                    <FieldValueWithConfidence
                      value={inv.invoice_number ?? '-'}
                      confidence={invoiceNumberConfidence}
                    />
                  </Link>
                </TableCell>

                <TableCell>
                  <FieldValueWithConfidence
                    value={formatCurrency(inv.total, inv.currency)}
                    confidence={amountConfidence}
                  />
                </TableCell>

                <TableCell>
                  <FieldValueWithConfidence
                    value={inv.currency ?? '-'}
                    confidence={currencyConfidence}
                  />
                </TableCell>

                <TableCell>
                  <FieldValueWithConfidence
                    value={formatDate(inv.invoice_date)}
                    confidence={invoiceDateConfidence}
                  />
                </TableCell>

                <TableCell>
                  <FieldValueWithConfidence
                    value={formatDate(inv.due_date)}
                    confidence={dueDateConfidence}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between border-t bg-slate-50 px-4 py-2 text-sm text-muted-foreground">
        <span>
          {total} invoice{total !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2">
            {page} / {totalPages || 1}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
