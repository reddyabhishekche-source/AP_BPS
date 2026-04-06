import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '@ap-bps/shared';
import type { UserRole, ExtractionFieldConfig, ExtractionFieldType, ExtractionFieldAppliesTo } from '@ap-bps/shared';

export const adminRouter = Router();

const EXTRACTION_FIELD_TYPES: ExtractionFieldType[] = ['string', 'number', 'date', 'boolean'];
const EXTRACTION_FIELD_APPLIES_TO: ExtractionFieldAppliesTo[] = ['header', 'line_item'];

function normalizeFieldKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}

// GET /api/admin/users
adminRouter.get('/users', async (_req: Request, res: Response) => {
  try {
    const users = await db('users')
      .select('user_id', 'email', 'full_name', 'role', 'assigned_company', 'approval_limit', 'status', 'created_at')
      .orderBy('created_at', 'desc');
    return res.json({ success: true, data: users });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

// POST /api/admin/users
adminRouter.post('/users', async (req: Request, res: Response) => {
  const { email, password, full_name, role, assigned_company, approval_limit } = req.body as {
    email: string; password: string; full_name: string;
    role: UserRole; assigned_company?: string; approval_limit?: number;
  };

  if (!email || !password || !full_name || !role) {
    return res.status(400).json({ success: false, error: 'email, password, full_name, and role are required' });
  }

  try {
    const exists = await db('users').where({ email }).first();
    if (exists) return res.status(409).json({ success: false, error: 'Email already exists' });

    const password_hash = await bcrypt.hash(password, 12);
    const [user] = await db('users')
      .insert({ email, password_hash, full_name, role, assigned_company, approval_limit })
      .returning(['user_id', 'email', 'full_name', 'role', 'assigned_company', 'approval_limit', 'status']);

    return res.status(201).json({ success: true, data: user });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to create user' });
  }
});

// PATCH /api/admin/users/:id
adminRouter.patch('/users/:id', async (req: Request, res: Response) => {
  const { full_name, role, assigned_company, approval_limit, status } = req.body;
  try {
    const updates: Record<string, unknown> = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (role !== undefined) updates.role = role;
    if (assigned_company !== undefined) updates.assigned_company = assigned_company;
    if (approval_limit !== undefined) updates.approval_limit = approval_limit;
    if (status !== undefined) updates.status = status;

    const [user] = await db('users')
      .where({ user_id: req.params.id })
      .update({ ...updates, updated_at: db.fn.now() })
      .returning(['user_id', 'email', 'full_name', 'role', 'assigned_company', 'approval_limit', 'status']);

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    return res.json({ success: true, data: user });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to update user' });
  }
});

// GET /api/admin/system-settings (placeholder)
adminRouter.get('/system-settings', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      default_ai_provider: process.env.DEFAULT_AI_PROVIDER ?? 'openai',
      email_intake_enabled: !!process.env.EMAIL_INTAKE_HOST,
      erp_type: process.env.ERP_TYPE ?? 'mock',
      max_file_size_mb: Number(process.env.MAX_FILE_SIZE_MB ?? 25),
    },
  });
});

// GET /api/admin/extraction-fields
adminRouter.get('/extraction-fields', async (_req: Request, res: Response) => {
  try {
    const fields = await db('extraction_field_configs')
      .select('field_id', 'field_key', 'field_label', 'field_type', 'applies_to', 'description', 'required', 'is_active', 'sort_order')
      .orderBy([{ column: 'sort_order', order: 'asc' }, { column: 'field_label', order: 'asc' }]);
    return res.json({ success: true, data: fields });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch extraction fields' });
  }
});

// PUT /api/admin/extraction-fields
adminRouter.put('/extraction-fields', async (req: Request, res: Response) => {
  const { fields } = req.body as { fields?: ExtractionFieldConfig[] };
  if (!Array.isArray(fields)) {
    return res.status(400).json({ success: false, error: 'fields array is required' });
  }

  let normalized: Array<{
    field_key: string;
    field_label: string;
    field_type: ExtractionFieldType;
    applies_to: ExtractionFieldAppliesTo;
    description: string | null;
    required: boolean;
    is_active: boolean;
    sort_order: number;
  }> = [];

  try {
    const seen = new Set<string>();
    normalized = fields.map((field, idx) => {
      const fieldKey = normalizeFieldKey(field.field_key ?? '');
      if (!fieldKey) throw new Error(`Field ${idx + 1}: key is required`);
      const appliesTo = (field.applies_to ?? 'header') as ExtractionFieldAppliesTo;
      if (!EXTRACTION_FIELD_APPLIES_TO.includes(appliesTo)) {
        throw new Error(`Field ${fieldKey}: invalid scope`);
      }
      const dedupeKey = `${appliesTo}:${fieldKey}`;
      if (seen.has(dedupeKey)) throw new Error(`Duplicate field key in ${appliesTo}: ${fieldKey}`);
      seen.add(dedupeKey);

      const fieldType = field.field_type as ExtractionFieldType;
      if (!EXTRACTION_FIELD_TYPES.includes(fieldType)) {
        throw new Error(`Field ${fieldKey}: invalid type`);
      }

      return {
        field_key: fieldKey,
        field_label: (field.field_label ?? '').trim() || fieldKey,
        field_type: fieldType,
        applies_to: appliesTo,
        description: field.description?.trim() || null,
        required: Boolean(field.required),
        is_active: field.is_active !== false,
        sort_order: Number.isFinite(field.sort_order) ? Number(field.sort_order) : idx,
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid extraction field payload';
    return res.status(400).json({ success: false, error: message });
  }

  try {
    await db.transaction(async (trx) => {
      await trx('extraction_field_configs').del();
      if (normalized.length > 0) {
        await trx('extraction_field_configs').insert(normalized);
      }
    });

    const saved = await db('extraction_field_configs')
      .select('field_id', 'field_key', 'field_label', 'field_type', 'applies_to', 'description', 'required', 'is_active', 'sort_order')
      .orderBy([{ column: 'sort_order', order: 'asc' }, { column: 'field_label', order: 'asc' }]);
    return res.json({ success: true, data: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update extraction fields';
    return res.status(400).json({ success: false, error: message });
  }
});
