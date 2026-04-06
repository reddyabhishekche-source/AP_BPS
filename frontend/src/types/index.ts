// ─── Enums ────────────────────────────────────────────────────────────────────

export type InvoiceStatus =
  | 'received'
  | 'processing'
  | 'extracted'
  | 'verification'
  | 'validated'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'posted'
  | 'error';

export type SourceChannel = 'email' | 'upload' | 'api';
export type AIProvider = 'openai' | 'anthropic' | 'gemini';
export type UserRole = 'ap_clerk' | 'finance_manager' | 'admin';
export type ApprovalDecision = 'approved' | 'rejected' | 'escalated' | 'pending';
export type VendorStatus = 'active' | 'inactive' | 'pending';

export type ExceptionType =
  | 'unknown_vendor'
  | 'missing_po'
  | 'missing_receipt'
  | 'low_confidence'
  | 'duplicate_suspicion'
  | 'amount_mismatch'
  | 'tax_mismatch'
  | 'validation_error'
  | 'stale_erp_sync';

// ─── Entities ─────────────────────────────────────────────────────────────────

export interface Invoice {
  invoice_id: string;
  vendor_id: string | null;
  vendor_name: string | null;
  erp_vendor_code: string | null;
  payment_terms: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  currency: string;
  source_channel: SourceChannel;
  status: InvoiceStatus;
  confidence_score: number | null;
  po_reference: string | null;
  po_amount_limit: number | null;
  tolerance_percent: number | null;
  receipt_reference: string | null;
  raw_document_id: string | null;
  original_filename: string | null;
  mime_type: string | null;
  storage_path: string | null;
  ocr_text: string | null;
  ocr_metadata: {
    imageWidth?: number;
    imageHeight?: number;
    renderedPages?: Array<{
      page: number;
      imageBase64: string;
      mimeType: string;
      width?: number;
      height?: number;
    }>;
    words?: Array<{
      text: string;
      x: number;
      y: number;
      width: number;
      height: number;
      confidence: number;
    }>;
  } | null;
  extraction_payload: Record<string, unknown> | null;
  ai_provider_used: AIProvider | null;
  extraction_retry_count?: number;
  extraction_last_retried_at?: string | null;
  extraction_last_status?: 'idle' | 'queued' | 'processing' | 'completed' | 'failed';
  extraction_last_job_id?: string | null;
  exception_type: ExceptionType | null;
  exception_notes: string | null;
  created_at: string;
  updated_at: string;
  line_items?: LineItem[];
  approvals?: ApprovalWithUser[];
}

export interface FieldRegionBox {
  page?: number;
  left: number;
  top: number;
  width: number;
  height: number;
  page_width?: number;
  page_height?: number;
  coordinate_space?: 'normalized' | 'page';
}

export interface LineItem {
  line_id: string;
  invoice_id: string;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  tax_code: string | null;
  po_line_reference: string | null;
  gl_code: string | null;
  cost_center: string | null;
  sort_order: number;
}

export interface Vendor {
  vendor_id: string;
  erp_vendor_code: string;
  legal_name: string;
  tax_id: string | null;
  branch_or_company: string | null;
  payment_terms: string | null;
  status: VendorStatus;
}

export interface PurchaseOrder {
  po_id: string;
  vendor_id: string;
  company_code: string;
  po_number: string;
  amount_limit: number | null;
  tolerance_percent: number;
  status: 'open' | 'closed' | 'cancelled';
}

export interface GLCode {
  gl_code: string;
  company_code: string;
  department: string | null;
  cost_center: string | null;
  description: string | null;
  is_active: boolean;
}

export interface Approval {
  approval_id: string;
  invoice_id: string;
  approver_user_id: string;
  stage: number;
  decision: ApprovalDecision;
  comments: string | null;
  timestamp: string;
}

export interface ApprovalWithUser extends Approval {
  approver_name: string;
  approver_email: string;
  invoice_number?: string | null;
  invoice_date?: string | null;
  total?: number | null;
  currency?: string;
  vendor_name?: string | null;
}

export interface User {
  user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  assigned_company: string | null;
  approval_limit: number | null;
  status: 'active' | 'inactive';
}

// ─── API shapes ────────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DashboardStats {
  byStatus: Record<InvoiceStatus, number>;
  aging: Array<{ bucket: string; count: string }>;
}

export interface AIProviderInfo {
  id: AIProvider;
  name: string;
  configured: boolean;
  default_model?: string;
  models?: string[];
}

export type ExtractionFieldType = 'string' | 'number' | 'date' | 'boolean';
export type ExtractionFieldAppliesTo = 'header' | 'line_item';

export interface ExtractionFieldConfig {
  field_id?: string;
  field_key: string;
  field_label: string;
  field_type: ExtractionFieldType;
  applies_to: ExtractionFieldAppliesTo;
  description?: string | null;
  required: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
  exception_type: ExceptionType | null;
}

export interface AuthTokenPayload {
  user_id: string;
  email: string;
  role: UserRole;
  full_name: string;
}
