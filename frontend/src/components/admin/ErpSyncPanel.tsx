'use client';

import { useState } from 'react';
import { RefreshCw, Database } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { triggerErpSync } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';

const ENTITY_TYPES = ['vendor', 'purchase_order', 'receipt', 'gl_code'];

export function ErpSyncPanel() {
  const [entityType, setEntityType] = useState('vendor');
  const [companyCode, setCompanyCode] = useState('');

  const { mutateAsync: sync, isPending } = useMutation({
    mutationFn: () => triggerErpSync(entityType, companyCode || undefined),
  });

  const handleSync = async () => {
    try {
      const result = await sync();
      toast({
        title: 'ERP sync started',
        description: `Sync ID: ${result?.sync_id ?? 'N/A'}`,
        variant: 'success' as never,
      });
    } catch {
      toast({ title: 'Sync failed', variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-slate-600" />
          <CardTitle className="text-sm">ERP Master Data Sync</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Synchronize vendor, PO, receipt, and GL code data from your ERP system.
          A full sync may take several hours for large datasets.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Entity Type</Label>
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs capitalize">
                    {t.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Company Code (optional)</Label>
            <Input
              className="h-8 text-xs"
              placeholder="e.g. US01"
              value={companyCode}
              onChange={(e) => setCompanyCode(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button size="sm" onClick={handleSync} disabled={isPending}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
            {isPending ? 'Starting sync…' : 'Trigger Sync'}
          </Button>
          {companyCode && (
            <Badge variant="info" className="text-xs">
              Company: {companyCode}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
