'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useExtractionFields, useUpdateExtractionFields } from '@/hooks/useAdmin';
import type { ExtractionFieldConfig, ExtractionFieldType, ExtractionFieldAppliesTo } from '@/types';

const FIELD_TYPES: ExtractionFieldType[] = ['string', 'number', 'date', 'boolean'];
const STANDARD_FIELDS: Array<{ key: string; label: string; type: string }> = [
  { key: 'invoice_number', label: 'Invoice Number', type: 'string' },
  { key: 'invoice_date', label: 'Invoice Date', type: 'date' },
  { key: 'due_date', label: 'Due Date', type: 'date' },
  { key: 'vendor_name', label: 'Vendor Name', type: 'string' },
  { key: 'vendor_tax_id', label: 'Vendor Tax ID', type: 'string' },
  { key: 'vendor_address', label: 'Vendor Address', type: 'string' },
  { key: 'po_reference', label: 'PO Reference', type: 'string' },
  { key: 'currency', label: 'Currency', type: 'string' },
  { key: 'subtotal', label: 'Subtotal', type: 'number' },
  { key: 'tax', label: 'Tax', type: 'number' },
  { key: 'total', label: 'Total', type: 'number' },
  { key: 'confidence_score', label: 'Confidence Score', type: 'number' },
];
const LINE_ITEM_STANDARD_FIELDS: Array<{ key: string; label: string; type: string }> = [
  { key: 'description', label: 'Description', type: 'string' },
  { key: 'quantity', label: 'Quantity', type: 'number' },
  { key: 'unit_price', label: 'Unit Price', type: 'number' },
  { key: 'amount', label: 'Amount', type: 'number' },
  { key: 'tax_code', label: 'Tax Code', type: 'string' },
  { key: 'po_line_reference', label: 'PO Line Reference', type: 'string' },
];
const APPLIES_TO_OPTIONS: ExtractionFieldAppliesTo[] = ['header', 'line_item'];

function createEmptyField(sortOrder: number): ExtractionFieldConfig {
  return {
    field_key: '',
    field_label: '',
    field_type: 'string',
    applies_to: 'header',
    description: '',
    required: false,
    is_active: true,
    sort_order: sortOrder,
  };
}

export function ExtractionFieldsPanel() {
  const { data: remoteFields = [], isLoading } = useExtractionFields();
  const { mutateAsync: saveFields, isPending: saving } = useUpdateExtractionFields();
  const [draft, setDraft] = useState<ExtractionFieldConfig[] | null>(null);

  const fields = draft ?? remoteFields;
  const dirty = draft !== null;

  const maxSort = useMemo(() => (
    fields.reduce((max, field) => Math.max(max, field.sort_order), -1)
  ), [fields]);

  const updateField = (index: number, updates: Partial<ExtractionFieldConfig>) => {
    setDraft(fields.map((field, i) => (i === index ? { ...field, ...updates } : field)));
  };

  const removeField = (index: number) => {
    setDraft(fields.filter((_, i) => i !== index).map((field, i) => ({ ...field, sort_order: i })));
  };

  const addField = () => {
    setDraft([...fields, createEmptyField(maxSort + 1)]);
  };

  const resetDraft = () => {
    setDraft(null);
  };

  const handleSave = async () => {
    try {
      const payload = fields.map((field, i) => ({
        ...field,
        sort_order: i,
      }));
      await saveFields(payload);
      setDraft(null);
      toast({ title: 'Extraction fields saved', variant: 'success' as never });
    } catch {
      toast({ title: 'Failed to save extraction fields', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Add application-level fields that should be extracted for every invoice. These fields appear under
        <span className="font-medium"> custom_fields </span>in extraction results.
      </p>

      <div className="rounded-md border bg-white p-3">
        <p className="text-sm font-medium text-slate-800">Existing Standard Header Fields</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          These invoice-level fields are extracted by default.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {STANDARD_FIELDS.map((field) => (
            <div key={field.key} className="rounded border bg-slate-50 px-2.5 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{field.key}</p>
              <p className="text-sm font-medium text-slate-800">{field.label}</p>
              <p className="text-[11px] text-muted-foreground">Type: {field.type}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-md border bg-white p-3">
        <p className="text-sm font-medium text-slate-800">Existing Standard Line Item Fields</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          These line-item fields are extracted by default for each row.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {LINE_ITEM_STANDARD_FIELDS.map((field) => (
            <div key={field.key} className="rounded border bg-slate-50 px-2.5 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{field.key}</p>
              <p className="text-sm font-medium text-slate-800">{field.label}</p>
              <p className="text-[11px] text-muted-foreground">Type: {field.type}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {fields.map((field, index) => (
          <div key={`${field.field_key}-${index}`} className="rounded-md border p-3">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Applies To</Label>
                <Select
                  value={field.applies_to ?? 'header'}
                  onValueChange={(value) => updateField(index, { applies_to: value as ExtractionFieldAppliesTo })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPLIES_TO_OPTIONS.map((scope) => (
                      <SelectItem key={scope} value={scope}>{scope === 'header' ? 'Header' : 'Line Item'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Field Key</Label>
                <Input
                  value={field.field_key}
                  onChange={(e) => updateField(index, { field_key: e.target.value })}
                  placeholder="payment_method"
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Label</Label>
                <Input
                  value={field.field_label}
                  onChange={(e) => updateField(index, { field_label: e.target.value })}
                  placeholder="Payment Method"
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select
                  value={field.field_type}
                  onValueChange={(value) => updateField(index, { field_type: value as ExtractionFieldType })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3 space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Input
                  value={field.description ?? ''}
                  onChange={(e) => updateField(index, { description: e.target.value })}
                  placeholder="Optional guidance for extraction"
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-1 flex items-end justify-end">
                <Button type="button" variant="ghost" size="icon" onClick={() => removeField(index)}>
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </div>

            <div className="mt-2 flex gap-4">
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => updateField(index, { required: e.target.checked })}
                />
                Required
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={field.is_active}
                  onChange={(e) => updateField(index, { is_active: e.target.checked })}
                />
                Active
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addField}>
          <Plus className="mr-2 h-4 w-4" />
          Add Field
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving || !dirty}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
        {dirty && (
          <Button type="button" variant="ghost" size="sm" onClick={resetDraft} disabled={saving}>
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
