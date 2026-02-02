import { QueryClient, QueryFunction, QueryFunctionContext } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

function getCSRFToken(): string | null {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : null;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  const csrfToken = getCSRFToken();
  if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
    headers["x-csrf-token"] = csrfToken;
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

// Type for query parameters
type ParamsRecord = Record<string, any>;

// Query key type with params - union type to accept both with and without params
type QueryWithParamsKey<TParams extends ParamsRecord | undefined = undefined> = readonly [string, TParams?];

// Factory function that returns a properly typed QueryFunction
export function fetchWithParams<TData, TParams extends ParamsRecord | undefined = ParamsRecord | undefined>(): QueryFunction<TData, QueryWithParamsKey<TParams>> {
  return async ({ queryKey, signal }: QueryFunctionContext<QueryWithParamsKey<TParams>>): Promise<TData> => {
    const [url, params] = queryKey;
    
    let finalUrl = url;
    if (params && Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      finalUrl = `${url}?${searchParams.toString()}`;
    }
    
    const res = await fetch(finalUrl, {
      credentials: "include",
      signal, // Forward abort signal
    });
    
    if (!res.ok) {
      const text = (await res.text()) || res.statusText;
      throw new Error(`${res.status}: ${text}`);
    }
    
    return await res.json() as TData;
  };
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes default - data considered fresh
      gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache
      retry: 1, // One retry for transient failures
      retryDelay: 1000,
      networkMode: 'offlineFirst', // Use cache while offline
    },
    mutations: {
      retry: false,
    },
  },
});

// Cache duration constants for consistent use across app
export const CACHE_TIMES = {
  REALTIME: 10 * 1000, // 10 seconds for live prices
  FAST: 30 * 1000, // 30 seconds for frequently changing data
  MEDIUM: 2 * 60 * 1000, // 2 minutes for market data
  SLOW: 5 * 60 * 1000, // 5 minutes for analysis data
  STABLE: 15 * 60 * 1000, // 15 minutes for rarely changing data
  STATIC: 60 * 60 * 1000, // 1 hour for static data
};
