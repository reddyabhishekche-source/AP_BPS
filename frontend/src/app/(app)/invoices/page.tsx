'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { InvoiceTable } from '@/components/invoices/InvoiceTable';
import { InvoiceFilters, type Filters } from '@/components/invoices/InvoiceFilters';
import { useInvoices } from '@/hooks/useInvoices';
import type { InvoiceStatus } from '@/types';

export default function InvoicesPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>({
    search: '',
    status: '',
    source_channel: '',
  });

  const { data, isLoading } = useInvoices({
    page,
    limit: 20,
    ...(filters.status ? { status: filters.status as InvoiceStatus } : {}),
    ...(filters.source_channel ? { source_channel: filters.source_channel } : {}),
    ...(filters.search ? { search: filters.search } : {}),
  });

  const handleFiltersChange = (newFilters: Filters) => {
    setFilters(newFilters);
    setPage(1);
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Invoices" />
      <div className="flex-1 space-y-4 p-6">
        <InvoiceFilters filters={filters} onChange={handleFiltersChange} />
        <InvoiceTable
          invoices={data?.data ?? []}
          total={data?.total ?? 0}
          page={page}
          totalPages={data?.totalPages ?? 1}
          loading={isLoading}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
