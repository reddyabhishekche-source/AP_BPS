'use client';

import { useState } from 'react';
import { Link2, Search, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useVendors, usePurchaseOrders, useUpdateInvoice } from '@/hooks/useInvoice';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/utils';
import type { Invoice, Vendor, PurchaseOrder } from '@/types';

interface Props {
  invoice: Invoice;
}

export function MatchingPanel({ invoice }: Props) {
  const [vendorSearch, setVendorSearch] = useState('');
  const { data: vendors = [], isFetching: loadingVendors } = useVendors(vendorSearch || undefined);
  const { data: pos = [] } = usePurchaseOrders(invoice.vendor_id ?? undefined);
  const { mutateAsync: update, isPending } = useUpdateInvoice(invoice.invoice_id);

  const setVendor = async (vendor: Vendor) => {
    try {
      await update({ vendor_id: vendor.vendor_id });
      toast({ title: 'Vendor updated', variant: 'success' as never });
    } catch {
      toast({ title: 'Failed to update vendor', variant: 'destructive' });
    }
  };

  const setPO = async (po: PurchaseOrder) => {
    try {
      await update({ po_reference: po.po_number });
      toast({ title: 'PO reference updated', variant: 'success' as never });
    } catch {
      toast({ title: 'Failed to update PO', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-5">
      {/* Vendor matching */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-semibold">Vendor Match</span>
          {invoice.vendor_id && (
            <Badge variant="success" className="ml-auto text-xs">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {invoice.vendor_name}
            </Badge>
          )}
        </div>

        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-xs"
            placeholder="Search vendors…"
            value={vendorSearch}
            onChange={(e) => setVendorSearch(e.target.value)}
          />
        </div>

        <ScrollArea className="h-36 rounded-md border">
          <div className="divide-y">
            {loadingVendors && (
              <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
            )}
            {vendors.slice(0, 20).map((v) => (
              <button
                key={v.vendor_id}
                className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/50 transition-colors ${invoice.vendor_id === v.vendor_id ? 'bg-blue-50' : ''}`}
                onClick={() => setVendor(v)}
              >
                <div>
                  <p className="text-xs font-medium">{v.legal_name}</p>
                  <p className="text-xs text-muted-foreground">{v.erp_vendor_code}</p>
                </div>
                {invoice.vendor_id === v.vendor_id && (
                  <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
                )}
              </button>
            ))}
            {vendors.length === 0 && !loadingVendors && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                {vendorSearch ? 'No vendors found' : 'Type to search vendors'}
              </p>
            )}
          </div>
        </ScrollArea>
      </div>

      <Separator />

      {/* PO matching */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="h-4 w-4 text-purple-500" />
          <span className="text-sm font-semibold">PO Match</span>
          {invoice.po_reference && (
            <Badge variant="info" className="ml-auto text-xs">{invoice.po_reference}</Badge>
          )}
        </div>

        {!invoice.vendor_id ? (
          <p className="text-xs text-muted-foreground">Match a vendor first to see open POs.</p>
        ) : (
          <ScrollArea className="h-36 rounded-md border">
            <div className="divide-y">
              {pos.map((po) => (
                <button
                  key={po.po_id}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/50 transition-colors ${invoice.po_reference === po.po_number ? 'bg-purple-50' : ''}`}
                  onClick={() => setPO(po)}
                >
                  <div>
                    <p className="text-xs font-medium">{po.po_number}</p>
                    <p className="text-xs text-muted-foreground">{po.company_code}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium">{formatCurrency(po.amount_limit)}</p>
                    <p className="text-xs text-muted-foreground">±{po.tolerance_percent}%</p>
                  </div>
                </button>
              ))}
              {pos.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No open POs for this vendor.
                </p>
              )}
            </div>
          </ScrollArea>
        )}

        {invoice.po_reference && (
          <div className="mt-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => update({ po_reference: null })}
              disabled={isPending}
            >
              Clear PO
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
