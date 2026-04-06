'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/invoices/StatusBadge';
import { formatCurrency, formatDateRelative, truncate } from '@/lib/utils';
import type { Invoice } from '@/types';

interface Props {
  invoices: Invoice[] | undefined;
  loading: boolean;
}

export function RecentInvoices({ invoices, loading }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-semibold">Recent Invoices</CardTitle>
        <Link
          href="/invoices"
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-3 px-6 py-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="divide-y">
            {(invoices ?? []).length === 0 && (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                No invoices yet.
              </p>
            )}
            {(invoices ?? []).map((inv) => (
              <Link
                key={inv.invoice_id}
                href={`/invoices/${inv.invoice_id}`}
                className="flex items-center justify-between px-6 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {inv.invoice_number ?? 'No number'} — {truncate(inv.vendor_name, 28)}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateRelative(inv.created_at)}</p>
                </div>
                <div className="ml-4 flex shrink-0 items-center gap-3">
                  <span className="text-sm font-medium">
                    {formatCurrency(inv.total, inv.currency)}
                  </span>
                  <StatusBadge status={inv.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
