'use client';

import { useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useUpdateLineItems, useGLCodes } from '@/hooks/useInvoice';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/utils';
import type { LineItem } from '@/types';

interface Props {
  invoiceId: string;
  lineItems: LineItem[];
  currency?: string;
  onValueFocus?: (value: string | null) => void;
}

type EditableLineItem = Omit<LineItem, 'line_id' | 'invoice_id' | 'sort_order'> & {
  _key: string;
};

function toIntOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export function LineItemsEditor({ invoiceId, lineItems, currency = 'USD', onValueFocus }: Props) {
  const { mutateAsync: save, isPending } = useUpdateLineItems(invoiceId);
  const { data: glCodes = [] } = useGLCodes();

  const [items, setItems] = useState<EditableLineItem[]>(() =>
    lineItems.map((li, i) => ({
      _key: `${i}`,
      description: li.description,
      quantity: toIntOrNull(li.quantity),
      unit_price: li.unit_price,
      amount: li.amount,
      tax_code: li.tax_code,
      po_line_reference: li.po_line_reference,
      gl_code: li.gl_code,
      cost_center: li.cost_center,
    })),
  );

  const [dirty, setDirty] = useState(false);
  const focusValue = (value?: string | number | null) => {
    if (value == null) return onValueFocus?.(null);
    const v = String(value).trim();
    onValueFocus?.(v.length ? v : null);
  };

  const update = (key: string, field: keyof EditableLineItem, value: unknown) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item._key !== key) return item;
        const updated = { ...item, [field]: field === 'quantity' ? toIntOrNull(value) : value };
        // Auto-compute amount when qty × price
        if (field === 'quantity' || field === 'unit_price') {
          const q = Number(field === 'quantity' ? toIntOrNull(value) ?? 0 : item.quantity ?? 0);
          const p = Number(field === 'unit_price' ? value : item.unit_price ?? 0);
          if (q && p) updated.amount = parseFloat((q * p).toFixed(2));
        }
        return updated;
      }),
    );
    setDirty(true);
  };

  const addRow = () => {
    setItems((prev) => [
      ...prev,
      {
        _key: Date.now().toString(),
        description: null, quantity: null, unit_price: null, amount: null,
        tax_code: null, po_line_reference: null, gl_code: null, cost_center: null,
      },
    ]);
    setDirty(true);
  };

  const removeRow = (key: string) => {
    setItems((prev) => prev.filter((i) => i._key !== key));
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      await save(items.map(({ _key: _k, ...rest }) => rest));
      setDirty(false);
      toast({ title: 'Line items saved', variant: 'success' as never });
    } catch {
      toast({ title: 'Failed to save line items', variant: 'destructive' });
    }
  };

  const total = items.reduce((s, i) => s + Number(i.amount ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="w-24">Qty</TableHead>
              <TableHead className="w-28">Unit Price</TableHead>
              <TableHead className="w-28">Amount</TableHead>
              <TableHead className="w-28">GL Code</TableHead>
              <TableHead className="w-28">Cost Center</TableHead>
              <TableHead className="w-28">Tax Code</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item._key}>
                <TableCell>
                  <Input
                    className="h-7 text-xs"
                    value={item.description ?? ''}
                    onChange={(e) => update(item._key, 'description', e.target.value || null)}
                    onFocus={() => focusValue(item.description)}
                    onClick={() => focusValue(item.description)}
                    placeholder="Description"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    className="h-7 text-xs tabular-nums"
                    value={item.quantity ?? ''}
                    step={1}
                    inputMode="numeric"
                    onChange={(e) => update(item._key, 'quantity', e.target.value ? e.target.value : null)}
                    onFocus={() => focusValue(item.quantity)}
                    onClick={() => focusValue(item.quantity)}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-7 text-xs"
                    value={item.unit_price ?? ''}
                    onChange={(e) => update(item._key, 'unit_price', e.target.value ? Number(e.target.value) : null)}
                    onFocus={() => focusValue(item.unit_price)}
                    onClick={() => focusValue(item.unit_price)}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-7 text-xs"
                    value={item.amount ?? ''}
                    onChange={(e) => update(item._key, 'amount', e.target.value ? Number(e.target.value) : null)}
                    onFocus={() => focusValue(item.amount)}
                    onClick={() => focusValue(item.amount)}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-7 text-xs"
                    list={`gl-codes-${item._key}`}
                    value={item.gl_code ?? ''}
                    onChange={(e) => update(item._key, 'gl_code', e.target.value || null)}
                    onFocus={() => focusValue(item.gl_code)}
                    onClick={() => focusValue(item.gl_code)}
                    placeholder="GL code"
                  />
                  <datalist id={`gl-codes-${item._key}`}>
                    {glCodes.map((g) => (
                      <option key={g.gl_code} value={g.gl_code}>
                        {g.description}
                      </option>
                    ))}
                  </datalist>
                </TableCell>
                <TableCell>
                  <Input
                    className="h-7 text-xs"
                    value={item.cost_center ?? ''}
                    onChange={(e) => update(item._key, 'cost_center', e.target.value || null)}
                    onFocus={() => focusValue(item.cost_center)}
                    onClick={() => focusValue(item.cost_center)}
                    placeholder="Cost center"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-7 text-xs"
                    value={item.tax_code ?? ''}
                    onChange={(e) => update(item._key, 'tax_code', e.target.value || null)}
                    onFocus={() => focusValue(item.tax_code)}
                    onClick={() => focusValue(item.tax_code)}
                    placeholder="Tax code"
                  />
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => removeRow(item._key)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center text-xs text-muted-foreground">
                  No line items. Add one below.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Line
        </Button>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            Total: <span className="font-semibold text-foreground">{formatCurrency(total, currency)}</span>
          </span>
          <Button size="sm" onClick={handleSave} disabled={isPending || !dirty}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {isPending ? 'Saving…' : 'Save Lines'}
          </Button>
        </div>
      </div>
    </div>
  );
}
