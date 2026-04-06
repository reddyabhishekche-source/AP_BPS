'use client';

import { Upload, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRef, useState } from 'react';
import { useUploadInvoice } from '@/hooks/useInvoices';
import { useProviders } from '@/hooks/useInvoice';
import { toast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { AIProvider } from '@/types';

export function Header({ title }: { title: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [provider, setProvider] = useState<AIProvider>('openai');
  const { mutateAsync: upload, isPending } = useUploadInvoice();
  const { data: providerData } = useProviders();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setOpen(true);
    }
    e.target.value = '';
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    try {
      const res = await upload({ file: selectedFile, provider });
      toast({
        title: 'Invoice uploaded',
        description: res.message ?? `Queued for extraction via ${provider}`,
        variant: 'success' as never,
      });
      setOpen(false);
      setSelectedFile(null);
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' });
    }
  };

  const availableProviders = providerData?.available.filter((p) => p.configured) ?? [];

  return (
    <>
      <header className="flex h-14 items-center justify-between border-b bg-white px-6">
        <h1 className="text-lg font-semibold text-slate-800">{title}</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Bell className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            Upload Invoice
          </Button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.tiff,.xlsx,.xls"
            onChange={handleFileChange}
          />
        </div>
      </header>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm text-muted-foreground">
                File: <span className="font-medium text-foreground">{selectedFile?.name}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : ''}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>AI Extraction Provider</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as AIProvider)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableProviders.length > 0
                    ? availableProviders.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))
                    : (
                      <>
                        <SelectItem value="openai">OpenAI GPT-4o</SelectItem>
                        <SelectItem value="anthropic">Anthropic Claude</SelectItem>
                        <SelectItem value="gemini">Google Gemini</SelectItem>
                      </>
                    )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={isPending}>
              {isPending ? 'Uploading…' : 'Upload & Extract'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
