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

export const MEDIA_BUCKET = "media";

/**
 * Turns a public storage URL back into the object path so deleted rows
 * don't leave their images behind, slowly filling the bucket.
 * Returns null for empty values or URLs from somewhere else.
 */
export function storagePathFromUrl(url: string): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${MEDIA_BUCKET}/`;
  const at = url.indexOf(marker);
  return at === -1 ? null : decodeURIComponent(url.slice(at + marker.length));
}

/** Best-effort image cleanup. A failure here must never fail the request. */
export async function removeStoredImage(url: string): Promise<void> {
  const path = storagePathFromUrl(url);
  if (!path) return;
  try {
    await db().storage.from(MEDIA_BUCKET).remove([path]);
  } catch {
    // orphaned file is not worth failing a delete over
  }
}

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
