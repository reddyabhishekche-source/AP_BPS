'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/invoices/StatusBadge';
import { DocumentViewer } from '@/components/invoices/DocumentViewer';
import { ExtractionPanel } from '@/components/invoices/ExtractionPanel';
import { LineItemsEditor } from '@/components/invoices/LineItemsEditor';
import { MatchingPanel } from '@/components/invoices/MatchingPanel';
import { AIProviderPicker } from '@/components/invoices/AIProviderPicker';
import { ApprovalTimeline } from '@/components/invoices/ApprovalTimeline';
import { useInvoice, useUpdateStatus, useDeleteInvoice } from '@/hooks/useInvoice';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { FieldRegionBox } from '@/types';
import { buildOcrFieldRegions } from '@/lib/ocrHighlight';
import type { OcrWord } from '@/lib/ocrHighlight';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: invoice, isLoading } = useInvoice(id);
  const { mutateAsync: updateStatus, isPending: updatingStatus } = useUpdateStatus(id);
  const { mutateAsync: deleteInvoice, isPending: deletingInvoice } = useDeleteInvoice(id);
  const [activeTab, setActiveTab] = useState('extraction');
  const [activeHighlight, setActiveHighlight] = useState<string | null>(null);

  // Must be before early returns to comply with React hooks rules.
  // Computes highlight field regions using Tesseract OCR word positions (pixel-accurate)
  // with a fallback to GPT field_regions for fields that couldn't be matched via OCR.
  const computedFieldRegions = useMemo(() => {
    if (!invoice) return {};

    const SUPPORTED_FIELDS = new Set([
      'invoice_number', 'invoice_date', 'due_date', 'vendor_name',
      'po_reference', 'subtotal', 'tax', 'total', 'currency',
    ]);

    // Filter GPT regions to only known fields — prevents spurious highlights from GPT.
    const rawGptRegions = (invoice.extraction_payload as { field_regions?: unknown } | null)
      ?.field_regions as Record<string, FieldRegionBox[]> | undefined ?? {};
    const gptRegions: Record<string, FieldRegionBox[]> = {};
    for (const [key, boxes] of Object.entries(rawGptRegions)) {
      if (SUPPORTED_FIELDS.has(key)) gptRegions[key] = boxes;
    }

    const ocrWords = (invoice.ocr_metadata?.words ?? []) as OcrWord[];
    const renderedPage = invoice.ocr_metadata?.renderedPages?.[0];
    const imgW = renderedPage?.width ?? invoice.ocr_metadata?.imageWidth ?? 0;
    const imgH = renderedPage?.height ?? invoice.ocr_metadata?.imageHeight ?? 0;

    if (!ocrWords.length || !imgW || !imgH) {
      return gptRegions;
    }

    const fv = {
      invoice_number: invoice.invoice_number,
      invoice_date: (invoice.extraction_payload as { invoice_date?: unknown } | null)
        ?.invoice_date as string | undefined ?? invoice.invoice_date,
      due_date: (invoice.extraction_payload as { due_date?: unknown } | null)
        ?.due_date as string | undefined ?? invoice.due_date,
      vendor_name: invoice.vendor_name,
      po_reference: invoice.po_reference,
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      total: invoice.total,
      currency: invoice.currency,
    };

    const ocrRegions = buildOcrFieldRegions(fv, ocrWords, imgW, imgH);
    // OCR regions (accurate pixel positions) override GPT regions where a match was found.
    return { ...gptRegions, ...ocrRegions };
  }, [invoice]);

  const handleSubmitForApproval = async () => {
    try {
      await updateStatus('pending_approval');
      toast({ title: 'Submitted for approval', variant: 'success' as never });
    } catch {
      toast({ title: 'Failed to submit', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    const ok = window.confirm('Delete this invoice? This action cannot be undone.');
    if (!ok) return;
    try {
      await deleteInvoice();
      toast({ title: 'Invoice deleted', variant: 'success' as never });
      router.push('/invoices');
    } catch {
      toast({ title: 'Failed to delete invoice', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Invoice not found.</p>
      </div>
    );
  }

  const canSubmit = ['extracted', 'verification', 'validated'].includes(invoice.status);

  // Extract custom-field values and per-field confidence scores from the extraction payload.
  // NOTE: highlight_terms (broad text snippets) are intentionally excluded — they match too
  // widely and cause non-extracted text to be highlighted. Only actual extracted values are used.
  const { extractedCustomValues, fieldConfidence } = (() => {
    const payload = invoice.extraction_payload as {
      custom_fields?: Record<string, unknown>;
      field_confidence?: Record<string, unknown>;
      line_items?: Array<{ custom_fields?: Record<string, unknown> }>;
    } | null;
    if (!payload || typeof payload !== 'object') {
      return { extractedCustomValues: [] as string[], fieldConfidence: {} as Record<string, number | null> };
    }

    const customFieldValues = payload.custom_fields && typeof payload.custom_fields === 'object'
      ? Object.values(payload.custom_fields).map((v) => (v == null ? '' : String(v).trim())).filter(Boolean)
      : [];
    const lineItemCustomFieldValues = Array.isArray(payload.line_items)
      ? payload.line_items.flatMap((li) => (
          li?.custom_fields && typeof li.custom_fields === 'object'
            ? Object.values(li.custom_fields).map((v) => (v == null ? '' : String(v).trim())).filter(Boolean)
            : []
        ))
      : [];

    const parsedFieldConfidence: Record<string, number | null> =
      payload.field_confidence && typeof payload.field_confidence === 'object'
        ? Object.fromEntries(
            Object.entries(payload.field_confidence).map(([k, v]) => {
              const n = Number(v);
              return [k, Number.isFinite(n) ? n : null];
            }),
          )
        : {};

    return {
      extractedCustomValues: Array.from(new Set([...customFieldValues, ...lineItemCustomFieldValues])),
      fieldConfidence: parsedFieldConfidence,
    };
  })();

  const highlightValues = [
    invoice.invoice_number,
    invoice.invoice_date,
    invoice.due_date,
    invoice.po_reference,
    invoice.currency,
    invoice.total != null ? String(invoice.total) : null,
    invoice.subtotal != null ? String(invoice.subtotal) : null,
    invoice.tax != null ? String(invoice.tax) : null,
    invoice.vendor_name,
    ...(invoice.line_items ?? []).flatMap((li) => [
      li.description,
      li.quantity != null ? String(li.quantity) : null,
      li.unit_price != null ? String(li.unit_price) : null,
      li.amount != null ? String(li.amount) : null,
    ]),
    ...extractedCustomValues,
  ]
    .map((v) => (v == null ? null : String(v).trim()))
    .filter((v): v is string => !!v);

  // fieldValues used by DocumentViewer (mirrors what's computed inside computedFieldRegions useMemo).
  const fieldValues = {
    invoice_number: invoice.invoice_number,
    invoice_date: (invoice.extraction_payload as { invoice_date?: unknown } | null)
      ?.invoice_date as string | undefined ?? invoice.invoice_date,
    due_date: (invoice.extraction_payload as { due_date?: unknown } | null)
      ?.due_date as string | undefined ?? invoice.due_date,
    vendor_name: invoice.vendor_name,
    po_reference: invoice.po_reference,
    subtotal: invoice.subtotal,
    tax: invoice.tax,
    total: invoice.total,
    currency: invoice.currency,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800">
                {invoice.invoice_number ?? 'No number'}
              </span>
              <StatusBadge status={invoice.status} />
              {invoice.exception_type && (
                <Badge variant="warning" className="text-xs capitalize">
                  {invoice.exception_type.replace(/_/g, ' ')}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {invoice.vendor_name ?? 'Unknown vendor'} ·{' '}
              {formatCurrency(invoice.total, invoice.currency)} ·{' '}
              {formatDate(invoice.invoice_date)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="destructive"
            onClick={handleDelete}
            disabled={deletingInvoice}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            {deletingInvoice ? 'Deleting...' : 'Delete'}
          </Button>
          {canSubmit && (
            <Button size="sm" onClick={handleSubmitForApproval} disabled={updatingStatus}>
              <Send className="mr-2 h-3.5 w-3.5" />
              Submit for Approval
            </Button>
          )}
        </div>
      </div>

      {/* Body – side by side */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: document viewer */}
        <div className="w-[45%] border-r overflow-y-auto p-4">
          <DocumentViewer
            invoiceId={id}
            storageUrl={invoice.storage_path}
            filename={invoice.original_filename}
            mimeType={invoice.mime_type ?? undefined}
            fieldRegions={computedFieldRegions}
            fieldValues={fieldValues}
            renderedPages={invoice.ocr_metadata?.renderedPages ?? undefined}
            fieldConfidence={fieldConfidence}
            highlightValues={highlightValues}
            activeHighlight={activeHighlight}
          />

          {/* AI Provider picker below document */}
          <div className="mt-4">
            <AIProviderPicker
              invoiceId={id}
              currentProvider={invoice.ai_provider_used}
              invoiceStatus={invoice.status}
              retryCount={invoice.extraction_retry_count ?? 0}
              lastRetriedAt={invoice.extraction_last_retried_at ?? null}
              extractionLastStatus={invoice.extraction_last_status ?? 'idle'}
              extractionLastJobId={invoice.extraction_last_job_id ?? null}
            />
          </div>
        </div>

        {/* Right: tabs */}
        <div className="flex-1 overflow-y-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <div className="border-b bg-white px-4 pt-3">
              <TabsList className="h-9">
                <TabsTrigger value="extraction" className="text-xs">Extracted Fields</TabsTrigger>
                <TabsTrigger value="lines" className="text-xs">
                  Line Items ({invoice.line_items?.length ?? 0})
                </TabsTrigger>
                <TabsTrigger value="matching" className="text-xs">Matching</TabsTrigger>
                <TabsTrigger value="approvals" className="text-xs">
                  Approvals ({invoice.approvals?.length ?? 0})
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <TabsContent value="extraction" className="mt-0">
                <ExtractionPanel invoice={invoice} onValueFocus={setActiveHighlight} />
              </TabsContent>

              <TabsContent value="lines" className="mt-0">
                <LineItemsEditor
                  invoiceId={id}
                  lineItems={invoice.line_items ?? []}
                  currency={invoice.currency}
                  onValueFocus={setActiveHighlight}
                />
              </TabsContent>

              <TabsContent value="matching" className="mt-0">
                <MatchingPanel invoice={invoice} />
              </TabsContent>

              <TabsContent value="approvals" className="mt-0">
                <ApprovalTimeline approvals={invoice.approvals ?? []} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
