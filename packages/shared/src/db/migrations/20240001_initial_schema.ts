import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Users
  await knex.schema.createTable('users', (t) => {
    t.uuid('user_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('email', 255).notNullable().unique();
    t.string('password_hash', 255).notNullable();
    t.string('full_name', 255).notNullable();
    t.enu('role', ['ap_clerk', 'finance_manager', 'admin']).notNullable().defaultTo('ap_clerk');
    t.string('assigned_company', 100).nullable();
    t.decimal('approval_limit', 18, 2).nullable();
    t.enu('status', ['active', 'inactive']).notNullable().defaultTo('active');
    t.timestamps(true, true);
  });

  // Vendors (synced from ERP)
  await knex.schema.createTable('vendors', (t) => {
    t.uuid('vendor_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('erp_vendor_code', 100).notNullable().unique();
    t.string('legal_name', 255).notNullable();
    t.string('tax_id', 100).nullable();
    t.string('branch_or_company', 100).nullable();
    t.string('payment_terms', 100).nullable();
    t.enu('status', ['active', 'inactive', 'pending']).notNullable().defaultTo('active');
    t.timestamps(true, true);
  });

  // Purchase Orders
  await knex.schema.createTable('purchase_orders', (t) => {
    t.uuid('po_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('vendor_id').references('vendor_id').inTable('vendors').onDelete('SET NULL').nullable();
    t.string('company_code', 50).notNullable();
    t.string('po_number', 100).notNullable().unique();
    t.decimal('amount_limit', 18, 2).nullable();
    t.decimal('tolerance_percent', 5, 2).notNullable().defaultTo(2.0);
    t.jsonb('line_details').defaultTo('[]');
    t.enu('status', ['open', 'closed', 'cancelled']).notNullable().defaultTo('open');
    t.timestamps(true, true);
  });

  // GL Codes
  await knex.schema.createTable('gl_codes', (t) => {
    t.string('gl_code', 50).primary();
    t.string('company_code', 50).notNullable();
    t.string('department', 100).nullable();
    t.string('cost_center', 100).nullable();
    t.string('project', 100).nullable();
    t.string('tax_treatment', 100).nullable();
    t.string('description', 255).nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
  });

  // Documents (raw files)
  await knex.schema.createTable('documents', (t) => {
    t.uuid('document_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('invoice_id').nullable(); // FK added after invoices table
    t.string('message_id', 255).nullable();
    t.string('original_filename', 500).notNullable();
    t.string('mime_type', 100).notNullable();
    t.string('storage_path', 1000).notNullable();
    t.integer('file_size_bytes').nullable();
    t.text('ocr_text').nullable();
    t.jsonb('extraction_payload').nullable();
    t.integer('page_count').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Invoices
  await knex.schema.createTable('invoices', (t) => {
    t.uuid('invoice_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('vendor_id').references('vendor_id').inTable('vendors').onDelete('SET NULL').nullable();
    t.uuid('raw_document_id').references('document_id').inTable('documents').onDelete('SET NULL').nullable();
    t.string('invoice_number', 200).nullable();
    t.date('invoice_date').nullable();
    t.date('due_date').nullable();
    t.decimal('subtotal', 18, 2).nullable();
    t.decimal('tax', 18, 2).nullable();
    t.decimal('total', 18, 2).nullable();
    t.string('currency', 10).notNullable().defaultTo('USD');
    t.enu('source_channel', ['email', 'upload', 'api']).notNullable().defaultTo('email');
    t.enu('status', [
      'received', 'processing', 'extracted', 'verification',
      'validated', 'pending_approval', 'approved', 'rejected', 'posted', 'error',
    ]).notNullable().defaultTo('received');
    t.decimal('confidence_score', 5, 4).nullable();
    t.string('po_reference', 200).nullable();
    t.string('receipt_reference', 200).nullable();
    t.enu('ai_provider_used', ['openai', 'anthropic', 'gemini']).nullable();
    t.enu('exception_type', [
      'unknown_vendor', 'missing_po', 'missing_receipt', 'low_confidence',
      'duplicate_suspicion', 'amount_mismatch', 'tax_mismatch', 'validation_error', 'stale_erp_sync',
    ]).nullable();
    t.text('exception_notes').nullable();
    t.timestamps(true, true);
  });

  // Add FK on documents → invoices
  await knex.schema.alterTable('documents', (t) => {
    t.uuid('invoice_id').references('invoice_id').inTable('invoices').onDelete('SET NULL').alter();
  });

  // Line Items
  await knex.schema.createTable('line_items', (t) => {
    t.uuid('line_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('invoice_id').notNullable().references('invoice_id').inTable('invoices').onDelete('CASCADE');
    t.text('description').nullable();
    t.decimal('quantity', 14, 4).nullable();
    t.decimal('unit_price', 18, 2).nullable();
    t.decimal('amount', 18, 2).nullable();
    t.string('tax_code', 50).nullable();
    t.string('po_line_reference', 100).nullable();
    t.string('gl_code', 50).nullable().references('gl_code').inTable('gl_codes');
    t.string('cost_center', 100).nullable();
    t.integer('sort_order').notNullable().defaultTo(0);
  });

  // Receipts / DRNs
  await knex.schema.createTable('receipts', (t) => {
    t.uuid('receipt_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('po_id').references('po_id').inTable('purchase_orders').onDelete('SET NULL').nullable();
    t.uuid('vendor_id').references('vendor_id').inTable('vendors').onDelete('SET NULL').nullable();
    t.string('location', 255).nullable();
    t.decimal('received_quantity', 14, 4).nullable();
    t.date('receipt_date').nullable();
    t.string('erp_drn_code', 100).nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Approvals
  await knex.schema.createTable('approvals', (t) => {
    t.uuid('approval_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('invoice_id').notNullable().references('invoice_id').inTable('invoices').onDelete('CASCADE');
    t.uuid('approver_user_id').notNullable().references('user_id').inTable('users').onDelete('CASCADE');
    t.integer('stage').notNullable().defaultTo(1);
    t.enu('decision', ['approved', 'rejected', 'escalated', 'pending']).notNullable().defaultTo('pending');
    t.text('comments').nullable();
    t.timestamp('timestamp').defaultTo(knex.fn.now());
  });

  // ERP Sync Log
  await knex.schema.createTable('erp_sync_log', (t) => {
    t.uuid('sync_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('entity_type', 50).notNullable(); // vendor | po | receipt | gl_code
    t.string('company_code', 50).nullable();
    t.integer('records_synced').defaultTo(0);
    t.enu('status', ['running', 'completed', 'failed']).notNullable().defaultTo('running');
    t.text('error_message').nullable();
    t.timestamp('started_at').defaultTo(knex.fn.now());
    t.timestamp('completed_at').nullable();
  });

  // Indexes
  await knex.raw('CREATE INDEX idx_invoices_status ON invoices(status)');
  await knex.raw('CREATE INDEX idx_invoices_vendor ON invoices(vendor_id)');
  await knex.raw('CREATE INDEX idx_invoices_created ON invoices(created_at DESC)');
  await knex.raw('CREATE UNIQUE INDEX idx_invoices_number_vendor ON invoices(invoice_number, vendor_id) WHERE invoice_number IS NOT NULL');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('approvals');
  await knex.schema.dropTableIfExists('receipts');
  await knex.schema.dropTableIfExists('line_items');
  await knex.schema.dropTableIfExists('invoices');
  await knex.schema.dropTableIfExists('documents');
  await knex.schema.dropTableIfExists('gl_codes');
  await knex.schema.dropTableIfExists('purchase_orders');
  await knex.schema.dropTableIfExists('vendors');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('erp_sync_log');
}
