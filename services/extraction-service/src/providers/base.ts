import type {
  ExtractedInvoiceData,
  ExtractionFieldConfig,
  ExtractionFieldType,
  ExtractionFieldAppliesTo,
} from '@ap-bps/shared';

export interface ExtractionInput {
  /** Plain text from OCR or PDF parse */
  text: string;
  /** Base64-encoded image (for vision models) */
  imageBase64?: string;
  /** Optional multi-page images (1-based page index) for vision models */
  imagePages?: Array<{ page: number; imageBase64: string; mimeType: string }>;
  /** MIME type of the source image */
  mimeType?: string;
  /** Original filename - helpful context for the model */
  filename?: string;
  /** Absolute/local path of source file (used by providers that support file upload) */
  filePath?: string;
  /** Optional provider-specific model override */
  model?: string;
  /** Optional globally configured custom extraction fields */
  customFields?: ExtractionFieldConfig[];
}

export interface AIExtractionProvider {
  name: string;
  extract(input: ExtractionInput): Promise<ExtractedInvoiceData>;
}

const BASE_JSON_SCHEMA = `{
  "invoice_number": string | null,
  "invoice_date": string | null,        // ISO 8601 YYYY-MM-DD
  "due_date": string | null,            // ISO 8601 YYYY-MM-DD
  "vendor": {
    "name": string | null,
    "address": string | null,
    "email": string | null,
    "tax_id": string | null
  },
  "customer": {
    "name": string | null,
    "address": string | null
  },
  "currency": string,                   // 3-letter ISO code, default USD
  "po_reference": string | null,
  "totals": {
    "subtotal": number | null,
    "tax": number | null,
    "total": number | null
  },
  "items": [
    {
      "description": string | null,
      "quantity": number | null,
      "unit_price": number | null,
      "amount": number | null,
      "tax_code": string | null,
      "po_line_reference": string | null,
      "custom_fields": object | null,   // key/value pairs for configured line-item custom fields
      "field_regions": object | null    // per-cell bounding boxes: field key -> [{page,left,top,width,height,coordinate_space}]
    }
  ],
  "custom_fields": object | null,       // key/value pairs for configured header-level custom fields
  "field_regions": object | null,       // header field key -> [{page,left,top,width,height,coordinate_space}]
  "field_confidence": object | null,    // field key -> confidence [0..1]
  "confidence_score": number            // 0.0 - 1.0 based on extraction quality
}`;

function typeInstruction(type: ExtractionFieldType): string {
  if (type === 'number') return 'number | null';
  if (type === 'date') return 'string (YYYY-MM-DD) | null';
  if (type === 'boolean') return 'boolean | null';
  return 'string | null';
}

function buildFieldInstructions(customFields: ExtractionFieldConfig[], appliesTo: ExtractionFieldAppliesTo): string {
  const scoped = customFields.filter((field) => (field.applies_to ?? 'header') === appliesTo);
  if (scoped.length === 0) {
    return appliesTo === 'header'
      ? 'No additional header-level custom fields are configured.'
      : 'No additional line-item custom fields are configured.';
  }

  const lines = scoped.map((field) =>
    `- ${field.field_key}: ${typeInstruction(field.field_type)}${field.required ? ' (required when present in document)' : ''}${field.description ? ` - ${field.description}` : ''}`,
  );

  return appliesTo === 'header'
    ? `Populate top-level custom_fields with these keys:\n${lines.join('\n')}`
    : `Populate line_items[].custom_fields with these keys for each line item:\n${lines.join('\n')}`;
}

export function buildExtractionSystemPrompt(customFields: ExtractionFieldConfig[] = []): string {
  return `You are an expert Accounts Payable data extraction engine.

Extract all invoice data from this document.

Return STRICT JSON only — no markdown, no code blocks, no extra text.

Rules:
- Detect fields automatically (no assumptions about layout)
- Extract EXACT values as seen in the document
- Do NOT hallucinate missing data
- Keep missing fields as null
- For invoice_date and due_date, always return ISO 8601 dates in the format YYYY-MM-DD. If a numeric date is ambiguous (could be MM/DD or DD/MM), return null.
- For currency, return 3-letter ISO code (default USD)

If an image is provided, return bounding boxes for every extracted value — both header fields and individual line item cells — using normalized 0..1 coordinates (0,0 = top-left, 1,1 = bottom-right of the image). Set coordinate_space to "normalized" for all boxes.
For header field_regions include keys: invoice_number, invoice_date, due_date, vendor.name, vendor.address, vendor.email, customer.name, po_reference, totals.subtotal, totals.tax, totals.total.
For each line item, populate its field_regions with boxes for: description, quantity, unit_price, amount (only include fields present and non-null for that row).
If multiple page images are provided, set the page field (1-based) on each box.
Draw every box as tightly as possible around the VALUE text only — exclude labels, table borders, and surrounding whitespace. If you are not confident about a box location, omit it rather than guessing.
For field_confidence, provide a confidence score [0..1] for each header field key based on how clearly the value is visible in the document.

Return exactly this JSON structure (use null for missing fields):
${BASE_JSON_SCHEMA}

${buildFieldInstructions(customFields, 'header')}

${buildFieldInstructions(customFields, 'line_item')}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function normalizeYear(year: number): number {
  if (year < 100) return year >= 70 ? 1900 + year : 2000 + year;
  return year;
}

function monthFromName(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  const map: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };
  return map[s] ?? null;
}

function normalizeCoreDate(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;

  // ISO or ISO-like timestamps: keep YYYY-MM-DD only.
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return isValidYmd(year, month, day) ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
  }

  // Compact YYYYMMDD
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    const year = Number(compact[1]);
    const month = Number(compact[2]);
    const day = Number(compact[3]);
    return isValidYmd(year, month, day) ? `${compact[1]}-${compact[2]}-${compact[3]}` : null;
  }

  // YYYY/MM/DD or YYYY.MM.DD or YYYY MM DD
  const ymd = text.match(/^(\d{4})[\/\.\s](\d{1,2})[\/\.\s](\d{1,2})(?:\s+.*)?$/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    return isValidYmd(year, month, day) ? `${ymd[1]}-${pad2(month)}-${pad2(day)}` : null;
  }

  // Month-name formats: "Apr 2, 2026" or "2 Apr 2026" (allow ordinals)
  const cleaned = text
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, '$1')
    .replace(/[,/\\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const mdy = cleaned.match(/^([A-Za-z]{3,9})\s+(\d{1,2})\s+(\d{2,4})$/);
  if (mdy) {
    const month = monthFromName(mdy[1]);
    const day = Number(mdy[2]);
    const year = normalizeYear(Number(mdy[3]));
    return month && isValidYmd(year, month, day) ? `${year}-${pad2(month)}-${pad2(day)}` : null;
  }
  const dmy = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = monthFromName(dmy[2]);
    const year = normalizeYear(Number(dmy[3]));
    return month && isValidYmd(year, month, day) ? `${year}-${pad2(month)}-${pad2(day)}` : null;
  }

  // Numeric formats: MM/DD/YYYY or DD/MM/YYYY (ambiguous => null)
  const numeric = text.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})(?:\s+.*)?$/);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const year = normalizeYear(Number(numeric[3]));

    // If one side exceeds 12, we can disambiguate.
    if (a > 12 && b <= 12) {
      const day = a;
      const month = b;
      return isValidYmd(year, month, day) ? `${year}-${pad2(month)}-${pad2(day)}` : null;
    }
    if (b > 12 && a <= 12) {
      const month = a;
      const day = b;
      return isValidYmd(year, month, day) ? `${year}-${pad2(month)}-${pad2(day)}` : null;
    }

    // Ambiguous numeric date (e.g. 03/04/2026): interpret using configured preference.
    // Default is DMY (common for non-US invoices). Set DATE_ORDER=MDY to change.
    const pref = String(process.env.DATE_ORDER ?? 'DMY').trim().toUpperCase();
    const preferMdy = pref === 'MDY' || pref === 'MM/DD' || pref === 'MMDD';
    const month = preferMdy ? a : b;
    const day = preferMdy ? b : a;
    return isValidYmd(year, month, day) ? `${year}-${pad2(month)}-${pad2(day)}` : null;
  }

  return null;
}

function normalizeCustomValue(value: unknown, fieldType: ExtractionFieldType): string | number | boolean | null {
  if (value == null) return null;
  if (fieldType === 'number') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (fieldType === 'boolean') {
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (['true', 'yes', '1'].includes(normalized)) return true;
    if (['false', 'no', '0'].includes(normalized)) return false;
    return null;
  }
  if (fieldType === 'date') {
    const text = String(value).trim();
    if (!text) return null;
    const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
    return iso ? iso[1] : text;
  }
  const text = String(value).trim();
  return text.length ? text : null;
}

function buildCustomFieldOutput(
  candidateSource: unknown,
  customFields: ExtractionFieldConfig[],
  appliesTo: ExtractionFieldAppliesTo,
): Record<string, string | number | boolean | null> {
  const scoped = customFields.filter((field) => (field.applies_to ?? 'header') === appliesTo);
  const candidate = typeof candidateSource === 'object' && candidateSource !== null
    ? (candidateSource as Record<string, unknown>)
    : {};

  const result: Record<string, string | number | boolean | null> = {};
  for (const field of scoped) {
    result[field.field_key] = normalizeCustomValue(candidate[field.field_key], field.field_type);
  }
  return result;
}

function normalizeLineItems(
  source: unknown,
  customFields: ExtractionFieldConfig[],
): ExtractedInvoiceData['line_items'] {
  const items = Array.isArray(source) ? source : [];
  return items.map((item) => {
    const row = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
    return {
      description: row.description == null ? null : String(row.description),
      quantity: row.quantity == null || !Number.isFinite(Number(row.quantity)) ? null : Number(row.quantity),
      unit_price: row.unit_price == null || !Number.isFinite(Number(row.unit_price)) ? null : Number(row.unit_price),
      amount: row.amount == null || !Number.isFinite(Number(row.amount)) ? null : Number(row.amount),
      tax_code: row.tax_code == null ? null : String(row.tax_code),
      po_line_reference: row.po_line_reference == null ? null : String(row.po_line_reference),
      custom_fields: buildCustomFieldOutput(row.custom_fields, customFields, 'line_item'),
      highlight_terms: Array.isArray(row.highlight_terms)
        ? row.highlight_terms.map((v) => String(v).trim()).filter(Boolean).slice(0, 8)
        : [],
      field_regions: normalizeFieldRegions(row.field_regions),
    };
  });
}

export const EXTRACTION_SYSTEM_PROMPT = buildExtractionSystemPrompt();

type RegionBox = {
  page?: number;
  left: number;
  top: number;
  width: number;
  height: number;
  page_width?: number;
  page_height?: number;
  coordinate_space?: 'normalized' | 'page';
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function normalizeRegionBox(value: unknown): RegionBox | null {
  if (typeof value !== 'object' || value == null) return null;
  const row = value as Record<string, unknown>;
  const left = Number(row.left);
  const top = Number(row.top);
  const width = Number(row.width);
  const height = Number(row.height);
  if (![left, top, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;

  const pageRaw = row.page == null ? undefined : Number(row.page);
  const page = pageRaw != null && Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.trunc(pageRaw) : undefined;
  const pageWidthRaw = row.page_width ?? row.pageWidth;
  const pageHeightRaw = row.page_height ?? row.pageHeight;
  const pageWidth = pageWidthRaw == null ? undefined : Number(pageWidthRaw);
  const pageHeight = pageHeightRaw == null ? undefined : Number(pageHeightRaw);
  const coordinateSpaceRaw = row.coordinate_space ?? row.coordinateSpace;
  const coordinateSpace = coordinateSpaceRaw === 'page' || coordinateSpaceRaw === 'normalized'
    ? coordinateSpaceRaw
    : undefined;

  if (pageWidth != null && pageHeight != null && Number.isFinite(pageWidth) && Number.isFinite(pageHeight) && pageWidth > 0 && pageHeight > 0) {
    const l = Math.min(pageWidth, Math.max(0, left));
    const t = Math.min(pageHeight, Math.max(0, top));
    const maxWidth = Math.max(0, pageWidth - l);
    const maxHeight = Math.max(0, pageHeight - t);
    const w = Math.min(Math.max(0, width), maxWidth);
    const h = Math.min(Math.max(0, height), maxHeight);
    if (w <= 0 || h <= 0) return null;
    return {
      page,
      left: l,
      top: t,
      width: w,
      height: h,
      page_width: pageWidth,
      page_height: pageHeight,
      coordinate_space: coordinateSpace ?? 'page',
    };
  }

  const l = clamp01(left);
  const t = clamp01(top);
  const w = clamp01(width);
  const h = clamp01(height);
  if (w <= 0 || h <= 0) return null;
  if (l >= 1 || t >= 1) return null;
  return {
    page,
    left: l,
    top: t,
    width: w,
    height: h,
    coordinate_space: 'normalized',
  };
}

function normalizeFieldRegions(source: unknown): Record<string, RegionBox[]> {
  const result: Record<string, RegionBox[]> = {};
  if (typeof source !== 'object' || source == null) return result;

  for (const [key, raw] of Object.entries(source as Record<string, unknown>)) {
    if (!key || typeof key !== 'string') continue;
    const boxes = Array.isArray(raw) ? raw : [];
    const normalized = boxes
      .map(normalizeRegionBox)
      .filter((b): b is RegionBox => !!b)
      .slice(0, 6);
    if (normalized.length > 0) result[key] = normalized;
  }

  return result;
}

export function parseModelOutput(raw: string, customFields: ExtractionFieldConfig[] = []): ExtractedInvoiceData {
  try {
    const cleaned = raw.replace(/```(?:json)?\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    // Support both new nested format (vendor.name, totals.subtotal, items)
    // and old flat format (vendor_name, subtotal, line_items) for backwards compatibility.
    const vendorObj = typeof parsed.vendor === 'object' && parsed.vendor !== null
      ? (parsed.vendor as Record<string, unknown>) : {};
    const totalsObj = typeof parsed.totals === 'object' && parsed.totals !== null
      ? (parsed.totals as Record<string, unknown>) : {};

    // Resolve scalar fields: prefer new nested keys, fall back to old flat keys.
    const rawVendorName = vendorObj.name ?? parsed.vendor_name;
    const rawVendorAddress = vendorObj.address ?? parsed.vendor_address;
    const rawVendorTaxId = vendorObj.tax_id ?? parsed.vendor_tax_id;
    const rawSubtotal = totalsObj.subtotal ?? parsed.subtotal;
    const rawTax = totalsObj.tax ?? parsed.tax;
    const rawTotal = totalsObj.total ?? parsed.total;
    // `items` (new) or `line_items` (old)
    const rawLineItemsSource = Array.isArray(parsed.items) ? parsed.items
      : Array.isArray(parsed.line_items) ? parsed.line_items : [];

    const parsedFieldConfidence = typeof parsed.field_confidence === 'object' && parsed.field_confidence !== null
      ? Object.entries(parsed.field_confidence as Record<string, unknown>).reduce<Record<string, number | null>>((acc, [key, value]) => {
          const n = Number(value);
          acc[key] = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
          return acc;
        }, {})
      : {};

    const field_regions = normalizeFieldRegions(parsed.field_regions);

    // Merge per-line-item field_regions into the top-level map as
    // "line_item_{idx}_{field}" keys so the viewer can look them up by a flat key.
    rawLineItemsSource.forEach((item: unknown, idx: number) => {
      const row = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
      const liRegions = normalizeFieldRegions(row.field_regions);
      for (const [field, boxes] of Object.entries(liRegions)) {
        field_regions[`line_item_${idx}_${field}`] = boxes;
      }
    });

    const result: ExtractedInvoiceData = {
      invoice_number: parsed.invoice_number == null ? null : String(parsed.invoice_number),
      invoice_date: normalizeCoreDate(parsed.invoice_date),
      due_date: normalizeCoreDate(parsed.due_date),
      vendor_name: rawVendorName == null ? null : String(rawVendorName),
      vendor_tax_id: rawVendorTaxId == null ? null : String(rawVendorTaxId),
      vendor_address: rawVendorAddress == null ? null : String(rawVendorAddress),
      po_reference: parsed.po_reference == null ? null : String(parsed.po_reference),
      currency: parsed.currency == null ? 'USD' : String(parsed.currency),
      subtotal: rawSubtotal == null || !Number.isFinite(Number(rawSubtotal)) ? null : Number(rawSubtotal),
      tax: rawTax == null || !Number.isFinite(Number(rawTax)) ? null : Number(rawTax),
      total: rawTotal == null || !Number.isFinite(Number(rawTotal)) ? null : Number(rawTotal),
      field_regions,
      line_items: normalizeLineItems(rawLineItemsSource, customFields),
      custom_fields: buildCustomFieldOutput(parsed.custom_fields, customFields, 'header'),
      field_confidence: parsedFieldConfidence,
      highlight_terms: Array.isArray(parsed.highlight_terms)
        ? parsed.highlight_terms.map((v) => String(v).trim()).filter(Boolean).slice(0, 20)
        : [],
      confidence_score: Number(parsed.confidence_score ?? 0.5),
      raw_response: raw,
    };

    return result;
  } catch {
    return {
      invoice_number: null,
      invoice_date: null,
      due_date: null,
      vendor_name: null,
      vendor_tax_id: null,
      vendor_address: null,
      po_reference: null,
      currency: 'USD',
      subtotal: null,
      tax: null,
      total: null,
      field_regions: {},
      line_items: [],
      custom_fields: buildCustomFieldOutput({}, customFields, 'header'),
      field_confidence: {},
      highlight_terms: [],
      confidence_score: 0.1,
      raw_response: raw,
    };
  }
}
