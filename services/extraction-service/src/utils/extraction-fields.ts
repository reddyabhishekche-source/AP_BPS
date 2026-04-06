import { db, logger } from '@ap-bps/shared';
import type { ExtractionFieldConfig } from '@ap-bps/shared';

export async function getActiveExtractionFields(): Promise<ExtractionFieldConfig[]> {
  try {
    const rows = await db('extraction_field_configs')
      .select('field_id', 'field_key', 'field_label', 'field_type', 'applies_to', 'description', 'required', 'is_active', 'sort_order')
      .where({ is_active: true })
      .orderBy([{ column: 'sort_order', order: 'asc' }, { column: 'field_label', order: 'asc' }]);
    return rows as ExtractionFieldConfig[];
  } catch (err) {
    logger.warn('Failed to load extraction field configs; continuing without custom fields', err);
    return [];
  }
}
