import axios from 'axios';
import { getToken, clearToken } from './auth';
import type {
  Invoice,
  LineItem,
  Vendor,
  PurchaseOrder,
  GLCode,
  Approval,
  ApprovalWithUser,
  ApprovalDecision,
  User,
  AIProvider,
  InvoiceStatus,
  ApiResponse,
  PaginatedResponse,
  DashboardStats,
  AIProviderInfo,
  ExtractionFieldConfig,
  ValidationResult,
} from '@/types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

export const api = axios.create({ baseURL: BASE });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      clearToken();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string) {
  const { data } = await api.post<ApiResponse<{ token: string; user: User }>>('/auth/login', {
    email,
    password,
  });
  return data;
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export interface InvoiceFilters {
  status?: InvoiceStatus;
  vendor_id?: string;
  source_channel?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

export async function fetchInvoices(filters: InvoiceFilters = {}) {
  const { data } = await api.get<PaginatedResponse<Invoice>>('/invoices', { params: filters });
  return data;
}

export async function fetchInvoice(id: string) {
  const { data } = await api.get<ApiResponse<Invoice>>(`/invoices/${id}`);
  return data.data!;
}

export async function fetchDashboardStats() {
  const { data } = await api.get<ApiResponse<DashboardStats>>('/invoices/stats');
  return data.data!;
}

export async function updateInvoice(id: string, updates: Partial<Invoice>) {
  const { data } = await api.patch<ApiResponse<Invoice>>(`/invoices/${id}`, updates);
  return data.data!;
}

export async function updateInvoiceStatus(id: string, status: InvoiceStatus) {
  const { data } = await api.patch<ApiResponse<Invoice>>(`/invoices/${id}/status`, { status });
  return data.data!;
}

export async function deleteInvoice(id: string) {
  const { data } = await api.delete<ApiResponse<unknown>>(`/invoices/${id}`);
  return data;
}

export async function updateLineItems(invoiceId: string, line_items: Partial<LineItem>[]) {
  const { data } = await api.put<ApiResponse<LineItem[]>>(`/invoices/${invoiceId}/line-items`, {
    line_items,
  });
  return data.data!;
}

export async function uploadInvoice(file: File, ai_provider?: AIProvider) {
  const form = new FormData();
  form.append('file', file);
  if (ai_provider) form.append('ai_provider', ai_provider);
  const { data } = await api.post<ApiResponse<{ invoice_id: string }>>('/invoices/intake/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

// ─── Extraction ───────────────────────────────────────────────────────────────

export async function fetchProviders() {
  const { data } = await api.get<ApiResponse<{ available: AIProviderInfo[]; default: AIProvider }>>(
    '/extraction/providers',
  );
  return data.data!;
}

export async function triggerExtraction(invoiceId: string, ai_provider?: AIProvider, ai_model?: string) {
  const { data } = await api.post<ApiResponse<{
    job_id?: string;
    retry_count?: number;
    last_retried_at?: string | null;
  }>>(`/extraction/${invoiceId}/trigger`, {
    ai_provider,
    ai_model,
  });
  return data;
}

export async function fetchExtractionStatus(invoiceId: string) {
  const { data } = await api.get<ApiResponse<{ status: string; progress: number; attempts: number; jobId?: string }>>(
    `/extraction/${invoiceId}/status`,
  );
  return data.data!;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export async function runValidation(invoiceId: string) {
  const { data } = await api.post<ApiResponse<ValidationResult>>(`/validation/${invoiceId}/run`);
  return data.data!;
}

// ─── Approvals ────────────────────────────────────────────────────────────────

export interface ApprovalFilters {
  user_id?: string;
  status?: ApprovalDecision;
  page?: number;
  limit?: number;
}

export async function fetchApprovals(filters: ApprovalFilters = {}) {
  const { data } = await api.get<PaginatedResponse<ApprovalWithUser>>('/approvals', {
    params: filters,
  });
  return data;
}

export async function decideApproval(
  approvalId: string,
  decision: ApprovalDecision,
  comments?: string,
) {
  const { data } = await api.post<ApiResponse<{ decision: string; invoice_status: string }>>(
    `/approvals/${approvalId}/decide`,
    { decision, comments },
  );
  return data.data!;
}

export async function postInvoiceToERP(invoiceId: string) {
  const { data } = await api.post<ApiResponse<unknown>>(`/approvals/invoice/${invoiceId}/post`);
  return data;
}

// ─── ERP Master Data ──────────────────────────────────────────────────────────

export async function fetchVendors(search?: string) {
  const { data } = await api.get<PaginatedResponse<Vendor>>('/vendors', {
    params: search ? { search, limit: 50 } : { limit: 200 },
  });
  return data.data;
}

export async function fetchPurchaseOrders(vendor_id?: string) {
  const { data } = await api.get<PaginatedResponse<PurchaseOrder>>('/purchase-orders', {
    params: { vendor_id, limit: 100, status: 'open' },
  });
  return data.data;
}

export async function fetchGLCodes() {
  const { data } = await api.get<PaginatedResponse<GLCode>>('/gl-codes', {
    params: { limit: 500, is_active: true },
  });
  return data.data;
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function fetchUsers() {
  const { data } = await api.get<ApiResponse<User[]>>('/admin/users');
  return data.data ?? [];
}

export async function createUser(payload: Omit<User, 'user_id'> & { password: string }) {
  const { data } = await api.post<ApiResponse<User>>('/admin/users', payload);
  return data.data!;
}

export async function fetchExtractionFields() {
  const { data } = await api.get<ApiResponse<ExtractionFieldConfig[]>>('/admin/extraction-fields');
  return data.data ?? [];
}

export async function updateExtractionFields(fields: ExtractionFieldConfig[]) {
  const { data } = await api.put<ApiResponse<ExtractionFieldConfig[]>>('/admin/extraction-fields', { fields });
  return data.data ?? [];
}

export async function triggerErpSync(entity_type?: string, company_code?: string) {
  const { data } = await api.post<ApiResponse<{ sync_id: string }>>('/erp-sync/trigger', {
    entity_type,
    company_code,
  });
  return data.data!;
}

export async function fetchSyncStatus() {
  const { data } = await api.get<ApiResponse<unknown>>('/erp-sync/status');
  return data.data;
}
