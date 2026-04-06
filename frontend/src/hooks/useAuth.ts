'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { login as apiLogin } from '@/lib/api';
import { setToken, clearToken, getUser } from '@/lib/auth';
import type { AuthTokenPayload } from '@/types';

export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<AuthTokenPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(getUser());
    setLoading(false);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await apiLogin(email, password);
      if (result.success && result.data?.token) {
        setToken(result.data.token);
        setUser(getUser());
        router.push('/dashboard');
      }
      return result;
    },
    [router],
  );

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    router.push('/login');
  }, [router]);

  return { user, loading, login, logout };
}
