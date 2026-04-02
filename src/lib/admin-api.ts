/**
 * Client-side helper for admin operations.
 * Routes through /api/admin which uses the service role client (bypasses RLS).
 * Passes the Supabase access token in the Authorization header.
 */

import { createClient } from "@/lib/supabase/client";

interface AdminApiOptions {
  action: "insert" | "update" | "delete";
  table: string;
  data?: Record<string, unknown>;
  match?: { column: string; value: unknown };
}

interface AdminApiResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

async function getAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function adminApi(options: AdminApiOptions): Promise<AdminApiResult> {
  const token = await getAccessToken();
  if (!token) {
    return { success: false, error: "Not authenticated" };
  }

  const res = await fetch("/api/admin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(options),
  });

  const result = await res.json();

  if (!res.ok) {
    return { success: false, error: result.error || "Request failed" };
  }

  return { success: true, data: result.data };
}

/**
 * Fetch helper for admin GET endpoints. Includes auth token automatically.
 */
export async function adminFetch(url: string): Promise<Response> {
  const token = await getAccessToken();
  return fetch(url, {
    headers: token ? { "Authorization": `Bearer ${token}` } : {},
  });
}

/**
 * Fetch helper for admin POST endpoints with FormData. Includes auth token.
 */
export async function adminUpload(url: string, formData: FormData): Promise<Response> {
  const token = await getAccessToken();
  return fetch(url, {
    method: "POST",
    headers: token ? { "Authorization": `Bearer ${token}` } : {},
    body: formData,
  });
}

/**
 * Fetch helper for admin DELETE endpoints. Includes auth token.
 */
export async function adminDelete(url: string, body: unknown): Promise<Response> {
  const token = await getAccessToken();
  return fetch(url, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
