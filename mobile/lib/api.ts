/**
 * QuantEdge API Client
 * Communicates with the same backend as the web app
 */

import * as SecureStore from 'expo-secure-store';

const API_BASE = 'https://quantedgelabs.net';

async function getAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync('auth_token');
  } catch {
    return null;
  }
}

export async function setAuthToken(token: string): Promise<void> {
  await SecureStore.setItemAsync('auth_token', token);
}

export async function clearAuthToken(): Promise<void> {
  await SecureStore.deleteItemAsync('auth_token');
}

interface FetchOptions extends RequestInit {
  requiresAuth?: boolean;
}

export async function apiFetch<T = any>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { requiresAuth = true, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders as Record<string, string>),
  };

  if (requiresAuth) {
    const token = await getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers,
    ...rest,
  });

  if (!response.ok) {
    const error = await response.text().catch(() => 'Unknown error');
    throw new Error(`API Error ${response.status}: ${error}`);
  }

  return response.json();
}

// Auth endpoints
export async function login(email: string, password: string) {
  const data = await apiFetch<{ token: string; user: any }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    requiresAuth: false,
  });
  await setAuthToken(data.token);
  return data;
}

export async function getMe() {
  return apiFetch<{ user: any }>('/api/auth/me');
}

export async function logout() {
  await clearAuthToken();
}

// Market data
export async function getMarketBatch(symbols: string) {
  return apiFetch(`/api/market-data/batch/${symbols}`, { requiresAuth: false });
}

export async function getStockQuote(symbol: string) {
  return apiFetch(`/api/market-data/quote/${symbol}`);
}

// Trade ideas
export async function getTradeIdeas(params?: { limit?: number; status?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.status) searchParams.set('status', String(params.status));
  const qs = searchParams.toString();
  return apiFetch(`/api/trade-ideas${qs ? `?${qs}` : ''}`);
}

// Morning briefing
export async function getMorningBriefing() {
  return apiFetch('/api/morning-briefing/latest');
}

// News
export async function getLatestNews(limit = 10) {
  return apiFetch(`/api/news/latest?limit=${limit}`);
}

// Watchlist
export async function getWatchlist() {
  return apiFetch('/api/watchlist');
}

export async function addToWatchlist(symbol: string) {
  return apiFetch('/api/watchlist', {
    method: 'POST',
    body: JSON.stringify({ symbol }),
  });
}

// Earnings
export async function getEarningsCalendar() {
  return apiFetch('/api/earnings/calendar');
}
