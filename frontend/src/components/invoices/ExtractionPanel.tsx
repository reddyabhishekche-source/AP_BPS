'use client';

import { useState } from 'react';
import { Save, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useUpdateInvoice, useRunValidation } from '@/hooks/useInvoice';
import { toast } from '@/components/ui/use-toast';
import { formatPercent } from '@/lib/utils';
import type { Invoice } from '@/types';

const schema = z.object({
  invoice_number: z.string().nullable().optional(),
  invoice_date: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  subtotal: z.coerce.number().nullable().optional(),
  tax: z.coerce.number().nullable().optional(),
  total: z.coerce.number().nullable().optional(),
  currency: z.string().min(3).max(3),
  po_reference: z.string().nullable().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  invoice: Invoice;
  onValueFocus?: (value: string | null) => void;
}

function toDateInputValue(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();

  // If API already returns a DATE-only value, keep it stable for <input type="date" />.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // If API returns a timestamp (common when Postgres DATE is parsed as JS Date),
  // convert to a local calendar date instead of taking the YYYY-MM-DD prefix or UTC day.
  const dt = new Date(trimmed);
  if (!Number.isNaN(dt.getTime())) {
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // Fallback: accept any string that starts with YYYY-MM-DD.
  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  return '';
}

export function ExtractionPanel({ invoice, onValueFocus }: Props) {
  const { mutateAsync: update, isPending: saving } = useUpdateInvoice(invoice.invoice_id);
  const { mutateAsync: validate, isPending: validating, data: validationResult } = useRunValidation(invoice.invoice_id);
  const [dirty, setDirty] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      invoice_number: invoice.invoice_number ?? '',
      invoice_date: toDateInputValue(invoice.invoice_date),
      due_date: toDateInputValue(invoice.due_date),
      subtotal: invoice.subtotal ?? undefined,
      tax: invoice.tax ?? undefined,
      total: invoice.total ?? undefined,
      currency: invoice.currency ?? 'USD',
      po_reference: invoice.po_reference ?? '',
    },
  });

  const onSubmit = async (data: FormValues) => {
    try {
      await update(data);
      setDirty(false);
      toast({ title: 'Invoice updated', variant: 'success' as never });
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' });
    }
  };

  const handleValidate = async () => {
    try {
      const result = await validate();
      if (result?.valid) {
        toast({ title: 'Validation passed', variant: 'success' as never });
      } else {
        toast({
          title: `Validation found ${result?.errors?.length ?? 0} error(s)`,
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: 'Validation failed', variant: 'destructive' });
    }
  };

  const confidence = invoice.confidence_score;
  const customFields = (() => {
    const payload = invoice.extraction_payload as { custom_fields?: Record<string, unknown> } | null;
    if (!payload || typeof payload !== 'object' || !payload.custom_fields || typeof payload.custom_fields !== 'object') {
      return [] as Array<{ key: string; value: string }>;
    }
    return Object.entries(payload.custom_fields)
      .map(([key, value]) => ({
        key,
        value: value == null ? '' : String(value),
      }))
      .filter((item) => item.value.trim().length > 0);
  })();
  const focusedValue = (value?: string | number | null) => {
    if (value == null) return onValueFocus?.(null);
    const v = String(value).trim();
    onValueFocus?.(v.length ? v : null);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} onChange={() => setDirty(true)} className="space-y-5">
      {/* Processing state */}
      {invoice.status === 'processing' && (
        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5">
          <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
          <p className="text-xs text-blue-700">
            Extraction in progress — fields will update automatically when complete.
          </p>
        </div>
      )}

      {/* Confidence */}
      {confidence != null && (
        <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
          <span className="text-xs text-muted-foreground">Extraction confidence</span>
          <Badge variant={confidence >= 0.7 ? 'success' : 'warning'}>
            {formatPercent(confidence)}
          </Badge>
        </div>
      )}

      {/* Exception banner */}
      {invoice.exception_type && (
        <div className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
          <div>
            <p className="text-xs font-semibold text-yellow-800 capitalize">
              {invoice.exception_type.replace(/_/g, ' ')}
            </p>
            {invoice.exception_notes && (
              <p className="text-xs text-yellow-700 mt-0.5">{invoice.exception_notes}</p>
            )}
          </div>
        </div>
      )}

      <Separator />

      {/* Header fields */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Invoice Number</Label>
          <Input
            className="h-8 text-sm"
            {...register('invoice_number')}
            onFocus={() => focusedValue(watch('invoice_number'))}
            onClick={() => focusedValue(watch('invoice_number'))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Currency</Label>
          <Input
            className="h-8 text-sm"
            maxLength={3}
            {...register('currency')}
            onFocus={() => focusedValue(watch('currency'))}
            onClick={() => focusedValue(watch('currency'))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Invoice Date</Label>
          <Input
            type="date"
            className="h-8 text-sm"
            {...register('invoice_date')}
            onFocus={() => focusedValue(watch('invoice_date'))}
            onClick={() => focusedValue(watch('invoice_date'))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Due Date</Label>
          <Input
            type="date"
            className="h-8 text-sm"
            {...register('due_date')}
            onFocus={() => focusedValue(watch('due_date'))}
            onClick={() => focusedValue(watch('due_date'))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Subtotal</Label>
          <Input
            type="number"
            step="0.01"
            className="h-8 text-sm"
            {...register('subtotal')}
            onFocus={() => focusedValue(watch('subtotal'))}
            onClick={() => focusedValue(watch('subtotal'))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Tax</Label>
          <Input
            type="number"
            step="0.01"
            className="h-8 text-sm"
            {...register('tax')}
            onFocus={() => focusedValue(watch('tax'))}
            onClick={() => focusedValue(watch('tax'))}
          />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Total</Label>
          <Input
            type="number"
            step="0.01"
            className="h-8 text-sm"
            {...register('total')}
            onFocus={() => focusedValue(watch('total'))}
            onClick={() => focusedValue(watch('total'))}
          />
          {errors.total && <p className="text-xs text-destructive">{errors.total.message}</p>}
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">PO Reference</Label>
          <Input
            className="h-8 text-sm"
            {...register('po_reference')}
            onFocus={() => focusedValue(watch('po_reference'))}
            onClick={() => focusedValue(watch('po_reference'))}
          />
        </div>
      </div>

      {customFields.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Custom Extracted Fields</p>
            <div className="grid grid-cols-2 gap-2">
              {customFields.map((field) => (
                <button
                  type="button"
                  key={field.key}
                  className="rounded-md border bg-white px-2.5 py-2 text-left hover:bg-slate-50"
                  onClick={() => focusedValue(field.value)}
                >
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{field.key}</p>
                  <p className="text-sm font-medium text-slate-800 break-all">{field.value}</p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Validation results */}
      {validationResult && (
        <div className="space-y-1.5 rounded-md border p-3">
          <div className="flex items-center gap-1.5">
            {validationResult.valid ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-600" />
            )}
            <span className="text-xs font-semibold">
              {validationResult.valid ? 'All checks passed' : `${validationResult.errors.length} error(s)`}
            </span>
          </div>
          {validationResult.errors.map((e, i) => (
            <p key={i} className="text-xs text-destructive">• {e.field}: {e.message}</p>
          ))}
          {validationResult.warnings.map((w, i) => (
            <p key={i} className="text-xs text-yellow-700">⚠ {w.field}: {w.message}</p>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving || !dirty}>
          <Save className="mr-2 h-3.5 w-3.5" />
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={handleValidate} disabled={validating}>
          <CheckCircle className="mr-2 h-3.5 w-3.5" />
          {validating ? 'Validating…' : 'Run Validation'}
        </Button>
      </div>
    </form>
  );
}
