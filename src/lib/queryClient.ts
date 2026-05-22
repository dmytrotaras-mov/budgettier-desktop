import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { callBackend } from "./tauri-api";

// Bridges legacy fetch("/api/*") code to Tauri commands. Components keep their
// existing call signatures (apiRequest + queryKey) — only this file knows
// about invoke().

function toResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data ?? null), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
): Promise<Response> {
  try {
    const result = await callBackend(method as any, url, data);
    return toResponse(result);
  } catch (err: any) {
    const msg = typeof err === "string" ? err : err?.message || String(err);
    return new Response(msg, { status: 500, statusText: msg });
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  () =>
  async ({ queryKey }) => {
    // Convention used by hooks across the app:
    //   queryKey: ["/api/wallets"]                                -> GET /api/wallets
    //   queryKey: ["/api/categories", "income"]                   -> GET /api/categories/income
    //   queryKey: ["/api/transactions", startISO, endISO]         -> GET /api/transactions/{start}/{end}
    // Strings after the first are joined as path segments.
    const parts = queryKey
      .filter((p) => p !== undefined && p !== null)
      .map((p) => String(p));
    if (parts.length === 0) return null as any;
    const url = parts.length === 1 ? parts[0] : parts.join("/");
    return (await callBackend("GET", url)) as any;
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30000,
      gcTime: 5 * 60 * 1000,
      retry: 0,
    },
    mutations: {
      retry: false,
    },
  },
});
