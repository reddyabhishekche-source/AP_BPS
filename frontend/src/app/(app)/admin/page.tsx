'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { UserTable } from '@/components/admin/UserTable';
import { ErpSyncPanel } from '@/components/admin/ErpSyncPanel';
import { ExtractionFieldsPanel } from '@/components/admin/ExtractionFieldsPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useProviders } from '@/hooks/useInvoice';

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { data: providerData } = useProviders();

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  if (!user || user.role !== 'admin') return null;

  const providers = providerData?.available ?? [];

  return (
    <div className="flex flex-col h-full">
      <Header title="Admin" />
      <div className="flex-1 p-6">
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="erp">ERP Sync</TabsTrigger>
            <TabsTrigger value="ai">AI Providers</TabsTrigger>
            <TabsTrigger value="fields">Global Fields</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">User Management</CardTitle>
                <CardDescription>
                  Manage AP clerks, finance managers, and admins.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UserTable />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="erp" className="mt-5">
            <div className="max-w-lg">
              <ErpSyncPanel />
            </div>
          </TabsContent>

          <TabsContent value="ai" className="mt-5">
            <div className="max-w-lg space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">AI Extraction Providers</CardTitle>
                  <CardDescription>
                    Configure which AI providers are available for invoice extraction.
                    Keys are set via environment variables.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {providers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Loading provider status…</p>
                  ) : (
                    providers.map((p) => (
                      <div key={p.id} className="flex items-center justify-between rounded-md border px-4 py-3">
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {p.id === 'openai' && 'OPENAI_API_KEY'}
                            {p.id === 'anthropic' && 'ANTHROPIC_API_KEY'}
                            {p.id === 'gemini' && 'GOOGLE_GENERATIVE_AI_API_KEY'}
                          </p>
                        </div>
                        <Badge variant={p.configured ? 'success' : 'secondary'}>
                          {p.configured ? 'Configured' : 'Not configured'}
                        </Badge>
                      </div>
                    ))
                  )}
                  <p className="text-xs text-muted-foreground pt-2">
                    Default provider: <span className="font-mono">{providerData?.default ?? 'openai'}</span>
                    {' '}(set via <span className="font-mono">DEFAULT_AI_PROVIDER</span> env var)
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="fields" className="mt-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Application-Level Extraction Fields</CardTitle>
                <CardDescription>
                  Configure global fields that all invoices should extract, regardless of provider.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ExtractionFieldsPanel />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
