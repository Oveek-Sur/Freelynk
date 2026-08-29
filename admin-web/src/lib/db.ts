import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type WifiNetwork = {
  id: string;
  name: string;
  ssid: string;
  password: string;
  security: "WPA" | "WEP" | "OPEN";
  area: string;
  note: string;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

let cached: SupabaseClient | null = null;

/**
 * Server-only Supabase client using the service_role key.
 * Never import this from a "use client" file.
 */
export function db(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable.",
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
