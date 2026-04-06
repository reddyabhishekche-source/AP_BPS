import type { AuthTokenPayload } from '@/types';

const TOKEN_KEY = 'ap_bps_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function parseJwtPayload(token: string): AuthTokenPayload | null {
  try {
    const base64 = token.split('.')[1];
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as AuthTokenPayload;
  } catch {
    return null;
  }
}

export function getUser(): AuthTokenPayload | null {
  const token = getToken();
  if (!token) return null;
  const payload = parseJwtPayload(token);
  if (!payload) return null;
  // Check expiry
  const exp = (payload as unknown as Record<string, unknown>).exp as number | undefined;
  if (exp && Date.now() / 1000 > exp) {
    clearToken();
    return null;
  }
  return payload;
}

export function isAuthenticated(): boolean {
  return getUser() !== null;
}
