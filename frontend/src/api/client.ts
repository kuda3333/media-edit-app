import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const TOKEN_KEY = 'ais_token';

const isWeb = Platform.OS === 'web';

export async function getToken(): Promise<string | null> {
  try {
    if (isWeb) {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(TOKEN_KEY);
      }
      return null;
    }
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string | null) {
  if (isWeb) {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (token === null) window.localStorage.removeItem(TOKEN_KEY);
      else window.localStorage.setItem(TOKEN_KEY, token);
    }
    return;
  }
  if (token === null) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
}

export function fileUrl(pathWithApi: string): string {
  if (!pathWithApi) return '';
  return `${BASE}${pathWithApi}`;
}

export async function fileUrlAuthed(pathWithApi: string): Promise<string> {
  const t = await getToken();
  if (!pathWithApi) return '';
  const sep = pathWithApi.includes('?') ? '&' : '?';
  return `${BASE}${pathWithApi}${sep}token=${encodeURIComponent(t || '')}`;
}

export async function apiFetch<T = any>(
  path: string,
  opts: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (opts.auth !== false) {
    const tok = await getToken();
    if (tok) headers['Authorization'] = `Bearer ${tok}`;
  }
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = data?.detail ?? data ?? res.statusText;
    const msg = Array.isArray(detail)
      ? detail.map((e: any) => e?.msg || JSON.stringify(e)).join(' ')
      : typeof detail === 'string'
      ? detail
      : JSON.stringify(detail);
    throw new Error(msg);
  }
  return data as T;
}

export async function apiUpload<T = any>(path: string, form: FormData): Promise<T> {
  const tok = await getToken();
  const headers: Record<string, string> = {};
  if (tok) headers['Authorization'] = `Bearer ${tok}`;
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: form as any });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const detail = data?.detail ?? data ?? res.statusText;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return data as T;
}

export type User = {
  id: string;
  email: string;
  name?: string;
  role: string;
  created_at: string;
};

export type TokenResponse = { access_token: string; token_type: string; user: User };
