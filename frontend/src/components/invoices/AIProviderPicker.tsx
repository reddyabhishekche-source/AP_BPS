'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Zap, AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useProviders, useTriggerExtraction, useExtractionStatus } from '@/hooks/useInvoice';
import { toast } from '@/components/ui/use-toast';
import type { AIProvider, InvoiceStatus } from '@/types';

const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  gemini: 'Google Gemini',
};

const MAX_ATTEMPTS = 3;
const SUCCESS_STATUSES: InvoiceStatus[] = ['approved', 'posted'];

interface Props {
  invoiceId: string;
  currentProvider: AIProvider | null;
  invoiceStatus: InvoiceStatus;
  retryCount?: number;
  lastRetriedAt?: string | null;
  extractionLastStatus?: 'idle' | 'queued' | 'processing' | 'completed' | 'failed';
  extractionLastJobId?: string | null;
}

function formatLastRetried(value?: string | null): string {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString();
}

export function AIProviderPicker({
  invoiceId,
  currentProvider,
  invoiceStatus,
  retryCount = 0,
  lastRetriedAt = null,
  extractionLastStatus = 'idle',
  extractionLastJobId = null,
}: Props) {
  const { data: providerData } = useProviders();
  const { mutateAsync: trigger, isPending } = useTriggerExtraction(invoiceId);
  const defaultProvider = (providerData?.default ?? 'openai') as AIProvider;
  const [selected, setSelected] = useState<AIProvider>(currentProvider ?? defaultProvider);
  const selectedProviderInfo = providerData?.available?.find((p) => p.id === selected);
  const providerModels = selectedProviderInfo?.models ?? [];
  const defaultModel = selectedProviderInfo?.default_model ?? providerModels[0] ?? '';
  const [selectedModel, setSelectedModel] = useState<string>(defaultModel);

  useEffect(() => {
    if (!providerModels.length) {
      setSelectedModel('');
      return;
    }
    if (!providerModels.includes(selectedModel)) {
      setSelectedModel(defaultModel);
    }
  }, [defaultModel, providerModels, selectedModel]);

  const isProcessing = invoiceStatus === 'processing';
  const isError = invoiceStatus === 'error';
  const isSuccess = SUCCESS_STATUSES.includes(invoiceStatus);
  const showRetryAction = !isSuccess;

  const { data: jobStatus } = useExtractionStatus(invoiceId, showRetryAction);
  const queueState = jobStatus?.status ?? 'not_found';
  const isPersistedQueued = extractionLastStatus === 'queued';
  const isPersistedProcessing = extractionLastStatus === 'processing';
  const isPersistedFailed = extractionLastStatus === 'failed';
  const isQueuedOrRunning = ['waiting', 'active', 'delayed', 'paused'].includes(queueState) || isProcessing || isPersistedQueued || isPersistedProcessing;

  const available = providerData?.available ?? [];
  const attempts = jobStatus?.attempts ?? 0;

  const handleRetrigger = async () => {
    try {
      const res = await trigger({
        provider: selected,
        model: selectedModel || undefined,
      });
      if (!res.success) {
        throw new Error(res.error || 'Retry request failed');
      }
      toast({
        title: 'Re-extraction queued',
        description: `${
          selectedModel
            ? `Processing with ${PROVIDER_LABELS[selected]} (${selectedModel})`
            : `Processing with ${PROVIDER_LABELS[selected]}`
        }${res.data?.job_id ? ` | Job: ${res.data.job_id}` : ''}`,
        variant: 'success' as never,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to trigger extraction';
      toast({ title: message, variant: 'destructive' });
    }
  };

  return (
    <div className="rounded-lg border bg-slate-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-4 w-4 text-blue-500" />
        <span className="text-sm font-semibold">AI Extraction Provider</span>
        {currentProvider && !isProcessing && (
          <Badge variant="info" className="ml-auto text-xs">
            Used: {PROVIDER_LABELS[currentProvider]}
          </Badge>
        )}
        {isProcessing && (
          <Badge variant="info" className="ml-auto text-xs">
            <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
            {attempts > 0 ? `Attempt ${attempts}/${MAX_ATTEMPTS}` : 'Processing...'}
          </Badge>
        )}
        {!isProcessing && queueState === 'waiting' && (
          <Badge variant="info" className="ml-auto text-xs">
            <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
            Queued
          </Badge>
        )}
        {isPersistedQueued && queueState === 'not_found' && (
          <Badge variant="info" className="ml-auto text-xs">
            <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
            Retry requested
          </Badge>
        )}
        {isPersistedProcessing && !isProcessing && (
          <Badge variant="info" className="ml-auto text-xs">
            <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
            Processing
          </Badge>
        )}
        {isPersistedFailed && !isError && (
          <Badge variant="destructive" className="ml-auto text-xs">
            <AlertCircle className="mr-1 h-3 w-3" />
            Last retry failed
          </Badge>
        )}
        {isError && (
          <Badge variant="destructive" className="ml-auto text-xs">
            <AlertCircle className="mr-1 h-3 w-3" />
            {attempts >= MAX_ATTEMPTS ? `Failed after ${MAX_ATTEMPTS} attempts` : 'Extraction failed'}
          </Badge>
        )}
      </div>

      {showRetryAction && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
          <p className="text-xs text-red-700">
            {isError
              ? `Extraction failed${attempts > 0 ? ` after ${attempts} attempt${attempts > 1 ? 's' : ''}` : ''}.`
              : 'You can change provider/model and retry extraction for this invoice.'}
            {' '}Select a provider and retry below.
          </p>
        </div>
      )}

      {retryCount > 0 && (
        <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-700">
            Retries triggered: <span className="font-semibold">{retryCount}</span>
            {lastRetriedAt && (
              <>
                {' '}| Last retried:{' '}
                <span className="font-semibold">{formatLastRetried(lastRetriedAt)}</span>
              </>
            )}
            {extractionLastJobId && (
              <>
                {' '}| Job:{' '}
                <span className="font-mono">{extractionLastJobId}</span>
              </>
            )}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Select
          value={selected}
          onValueChange={(v) => setSelected(v as AIProvider)}
          disabled={isQueuedOrRunning || !showRetryAction}
        >
          <SelectTrigger className="flex-1 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {available.length > 0
              ? available.map((p) => (
                  <SelectItem key={p.id} value={p.id} disabled={!p.configured}>
                    <span className="flex items-center gap-2">
                      {p.name}
                      {!p.configured && (
                        <span className="text-xs text-muted-foreground">(not configured)</span>
                      )}
                    </span>
                  </SelectItem>
                ))
              : Object.entries(PROVIDER_LABELS).map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
          </SelectContent>
        </Select>

        {providerModels.length > 0 && (
          <Select
            value={selectedModel}
            onValueChange={setSelectedModel}
            disabled={isQueuedOrRunning || !showRetryAction}
          >
            <SelectTrigger className="w-44 bg-white">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              {providerModels.map((model) => (
                <SelectItem key={model} value={model}>{model}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {showRetryAction && (
          <Button
            size="sm"
            onClick={handleRetrigger}
            disabled={isPending || isQueuedOrRunning}
            variant={isError ? 'destructive' : 'default'}
          >
            <RotateCcw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
            {isPending ? 'Queuing...' : isQueuedOrRunning ? 'Queued' : 'Retry'}
          </Button>
        )}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {showRetryAction
          ? (isQueuedOrRunning
              ? 'Retry already requested. Extraction is pending/processing; retry is disabled until it completes.'
              : 'Retrying will reset attempts and re-queue extraction.')
          : 'Retry is disabled for successful invoices (approved/posted).'}
      </p>
    </div>
  );
}
