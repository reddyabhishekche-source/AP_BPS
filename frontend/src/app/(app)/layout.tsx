'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { isAuthenticated } from '@/lib/auth';
import { Button } from '@/components/ui/button';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const shouldAutoHideSidebar = useMemo(() => {
    const p = pathname ?? '';
    return /^\/invoices\/[^/]+$/.test(p);
  }, [pathname]);

  const [sidebarHidden, setSidebarHidden] = useState(shouldAutoHideSidebar);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
    }
  }, [router]);

  useEffect(() => {
    setSidebarHidden(shouldAutoHideSidebar);
  }, [shouldAutoHideSidebar]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {!sidebarHidden && <Sidebar />}
      <main className="relative flex-1 overflow-y-auto">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="fixed left-3 top-3 z-50 h-9 w-9 bg-white/90 shadow-sm backdrop-blur"
          onClick={() => setSidebarHidden((v) => !v)}
          aria-label={sidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
          title={sidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
        >
          {sidebarHidden ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
        {children}
      </main>
    </div>
  );
}
