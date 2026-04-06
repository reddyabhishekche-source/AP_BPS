'use client';

import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { InvoiceStatus } from '@/types';

export interface Filters {
  search: string;
  status: string;
  source_channel: string;
}

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
}

const STATUS_OPTIONS: { value: InvoiceStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'received', label: 'Received' },
  { value: 'processing', label: 'Processing' },
  { value: 'extracted', label: 'Extracted' },
  { value: 'verification', label: 'Needs Review' },
  { value: 'validated', label: 'Validated' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'posted', label: 'Posted' },
  { value: 'error', label: 'Error' },
];

export function InvoiceFilters({ filters, onChange }: Props) {
  const hasFilters = filters.search || filters.status || filters.source_channel;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[220px] flex-1">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search invoice # or vendor…"
          className="pl-8"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </div>

      <Select
        value={filters.status || '_all'}
        onValueChange={(v) => onChange({ ...filters, status: v === '_all' ? '' : v })}
      >
        <SelectTrigger className="w-[170px]">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value || '_all'} value={opt.value || '_all'}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.source_channel || '_all'}
        onValueChange={(v) => onChange({ ...filters, source_channel: v === '_all' ? '' : v })}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="All channels" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">All channels</SelectItem>
          <SelectItem value="email">Email</SelectItem>
          <SelectItem value="upload">Upload</SelectItem>
          <SelectItem value="api">API</SelectItem>
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ search: '', status: '', source_channel: '' })}
        >
          <X className="mr-1 h-3 w-3" />
          Clear
        </Button>
      )}
    </div>
  );
}
