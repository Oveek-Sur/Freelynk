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

export type Banner = {
  id: string;
  title: string;
  image_url: string;
  link_url: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Shop = {
  id: string;
  name: string;
  image_url: string;
  sells: string;
  address: string;
  phone: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/*
 * Image hosting used to live here.
 *
 * Pictures were uploaded into a Supabase bucket and served from it, which
 * meant the project paid egress every time a phone drew a banner — for
 * files up to 5 MB that were never resized. Banners and shop photos are
 * now plain https links to wherever they already live, so there is nothing
 * to store, nothing to clean up when a row is deleted, and no bandwidth
 * bill that grows with the number of installs.
 */

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
