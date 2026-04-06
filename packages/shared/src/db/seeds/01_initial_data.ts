import type { Knex } from 'knex';
import bcrypt from 'bcryptjs';

export async function seed(knex: Knex): Promise<void> {
  await knex('approvals').del();
  await knex('line_items').del();
  await knex('invoices').del();
  await knex('documents').del();
  await knex('receipts').del();
  await knex('purchase_orders').del();
  await knex('gl_codes').del();
  await knex('vendors').del();
  await knex('users').del();

  const passwordHash = await bcrypt.hash('admin123', 10);

  await knex('users').insert([
    {
      email: 'admin@company.com',
      password_hash: passwordHash,
      full_name: 'AP Admin',
      role: 'admin',
      assigned_company: 'CORP01',
      approval_limit: null,
    },
    {
      email: 'clerk@company.com',
      password_hash: passwordHash,
      full_name: 'AP Clerk',
      role: 'ap_clerk',
      assigned_company: 'CORP01',
      approval_limit: null,
    },
    {
      email: 'manager@company.com',
      password_hash: passwordHash,
      full_name: 'Finance Manager',
      role: 'finance_manager',
      assigned_company: 'CORP01',
      approval_limit: 100000,
    },
  ]);

  await knex('vendors').insert([
    { erp_vendor_code: 'V001', legal_name: 'Acme Corp', tax_id: '12-3456789', payment_terms: 'Net 30', status: 'active' },
    { erp_vendor_code: 'V002', legal_name: 'Global Supplies Ltd', tax_id: '98-7654321', payment_terms: 'Net 45', status: 'active' },
    { erp_vendor_code: 'V003', legal_name: 'Tech Solutions Inc', tax_id: '55-1234567', payment_terms: 'Net 15', status: 'active' },
  ]);

  await knex('gl_codes').insert([
    { gl_code: '5001', company_code: 'CORP01', department: 'Operations', description: 'Office Supplies', is_active: true },
    { gl_code: '5002', company_code: 'CORP01', department: 'IT', description: 'Software & Licenses', is_active: true },
    { gl_code: '6001', company_code: 'CORP01', department: 'Finance', description: 'Professional Services', is_active: true },
    { gl_code: '6002', company_code: 'CORP01', department: 'HR', description: 'Training & Development', is_active: true },
  ]);
}
