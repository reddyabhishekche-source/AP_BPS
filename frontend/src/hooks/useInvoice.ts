import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchInvoice,
  updateInvoice,
  updateInvoiceStatus,
  updateLineItems,
  deleteInvoice,
  triggerExtraction,
  fetchExtractionStatus,
  runValidation,
  fetchProviders,
  postInvoiceToERP,
  fetchVendors,
  fetchPurchaseOrders,
  fetchGLCodes,
} from '@/lib/api';
import type { Invoice, LineItem, InvoiceStatus, AIProvider } from '@/types';

export function useInvoice(id: string) {
  return useQuery({
    queryKey: ['invoice', id],
    queryFn: () => fetchInvoice(id),
    enabled: !!id,
  });
}

export function useUpdateInvoice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: Partial<Invoice>) => updateInvoice(id, updates),
    onSuccess: (updated) => {
      qc.setQueryData(['invoice', id], updated);
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useUpdateStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: InvoiceStatus) => updateInvoiceStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateLineItems(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (line_items: Partial<LineItem>[]) => updateLineItems(invoiceId, line_items),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', invoiceId] });
    },
  });
}

export function useDeleteInvoice(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => deleteInvoice(invoiceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useTriggerExtraction(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params?: { provider?: AIProvider; model?: string }) =>
      triggerExtraction(invoiceId, params?.provider, params?.model),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useRunValidation(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => runValidation(invoiceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', invoiceId] });
    },
  });
}

export function usePostToERP(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postInvoiceToERP(invoiceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useExtractionStatus(invoiceId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['extraction-status', invoiceId],
    queryFn: () => fetchExtractionStatus(invoiceId),
    enabled,
    refetchInterval: enabled ? 3000 : false,
  });
}

export function useProviders() {
  return useQuery({
    queryKey: ['extraction', 'providers'],
    queryFn: fetchProviders,
    staleTime: Infinity,
  });
}

export function useVendors(search?: string) {
  return useQuery({
    queryKey: ['vendors', search],
    queryFn: () => fetchVendors(search),
    staleTime: 60_000,
  });
}

export function usePurchaseOrders(vendor_id?: string) {
  return useQuery({
    queryKey: ['purchase-orders', vendor_id],
    queryFn: () => fetchPurchaseOrders(vendor_id),
    staleTime: 60_000,
    enabled: !!vendor_id,
  });
}

export function useGLCodes() {
  return useQuery({
    queryKey: ['gl-codes'],
    queryFn: fetchGLCodes,
    staleTime: 300_000,
  });
}
