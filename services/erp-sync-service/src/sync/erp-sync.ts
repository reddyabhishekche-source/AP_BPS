import { db, logger } from '@ap-bps/shared';

// Mock ERP data for demonstration – replace with real ERP API calls
async function fetchVendorsFromErp(): Promise<Array<Record<string, unknown>>> {
  const erpType = process.env.ERP_TYPE ?? 'mock';
  if (erpType === 'mock') {
    return [
      { erp_vendor_code: 'V001', legal_name: 'Acme Corp', tax_id: '12-3456789', payment_terms: 'Net 30' },
      { erp_vendor_code: 'V002', legal_name: 'Global Supplies Ltd', tax_id: '98-7654321', payment_terms: 'Net 45' },
      { erp_vendor_code: 'V003', legal_name: 'Tech Solutions Inc', tax_id: '55-1234567', payment_terms: 'Net 15' },
      { erp_vendor_code: 'V004', legal_name: 'Office World', tax_id: '44-9876543', payment_terms: 'Net 30' },
    ];
  }
  // Real ERP: axios.get(`${process.env.ERP_API_URL}/vendors`,  { headers: { 'x-api-key': process.env.ERP_API_KEY } })
  return [];
}

async function fetchPOsFromErp(): Promise<Array<Record<string, unknown>>> {
  const erpType = process.env.ERP_TYPE ?? 'mock';
  if (erpType === 'mock') {
    return [
      { po_number: 'PO-2024-001', erp_vendor_code: 'V001', company_code: 'CORP01', amount_limit: 5000, tolerance_percent: 2 },
      { po_number: 'PO-2024-002', erp_vendor_code: 'V002', company_code: 'CORP01', amount_limit: 15000, tolerance_percent: 3 },
      { po_number: 'PO-2024-003', erp_vendor_code: 'V003', company_code: 'CORP01', amount_limit: 8500, tolerance_percent: 2 },
    ];
  }
  return [];
}

export async function runErpSync(companyCode?: string): Promise<{ vendors: number; pos: number }> {
  logger.info('Starting ERP sync', { companyCode: companyCode ?? 'all' });

  const syncId = (await db('erp_sync_log').insert({
    entity_type: 'full',
    company_code: companyCode ?? null,
    status: 'running',
  }).returning('sync_id'))[0].sync_id;

  let vendorCount = 0;
  let poCount = 0;

  try {
    // Sync vendors
    const vendors = await fetchVendorsFromErp();
    for (const v of vendors) {
      await db('vendors')
        .insert({ erp_vendor_code: v.erp_vendor_code, legal_name: v.legal_name, tax_id: v.tax_id, payment_terms: v.payment_terms, status: 'active' })
        .onConflict('erp_vendor_code')
        .merge(['legal_name', 'tax_id', 'payment_terms', 'updated_at']);
    }
    vendorCount = vendors.length;

    // Sync POs
    const pos = await fetchPOsFromErp();
    for (const p of pos) {
      const vendor = await db('vendors').where({ erp_vendor_code: p.erp_vendor_code }).select('vendor_id').first();
      if (!vendor) continue;
      await db('purchase_orders')
        .insert({
          vendor_id: vendor.vendor_id,
          company_code: p.company_code,
          po_number: p.po_number,
          amount_limit: p.amount_limit,
          tolerance_percent: p.tolerance_percent ?? 2,
          status: 'open',
        })
        .onConflict('po_number')
        .merge(['amount_limit', 'tolerance_percent', 'updated_at']);
    }
    poCount = pos.length;

    await db('erp_sync_log').where({ sync_id: syncId }).update({
      status: 'completed',
      records_synced: vendorCount + poCount,
      completed_at: db.fn.now(),
    });

    logger.info('ERP sync complete', { vendors: vendorCount, pos: poCount });
    return { vendors: vendorCount, pos: poCount };
  } catch (err) {
    await db('erp_sync_log').where({ sync_id: syncId }).update({
      status: 'failed',
      error_message: String(err),
      completed_at: db.fn.now(),
    });
    throw err;
  }
}
