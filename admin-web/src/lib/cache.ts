import { unstable_cache } from "next/cache";
import { db, type Banner, type Shop } from "@/lib/db";

/**
 * Read-path caching.
 *
 * Every phone asks for the same bytes, and those bytes change only when the
 * admin edits something — which is rare. Serving that from Postgres on every
 * app launch makes the load scale with the number of users, which is the one
 * thing this product must not do. A hundred users and a hundred thousand
 * should cost the origin the same.
 *
 * Two layers, because they fail independently:
 *
 *   1. The CDN holds the finished response, so most requests never reach a
 *      function at all. This is what makes the user count stop mattering.
 *   2. `unstable_cache` holds the database rows, so on the rare request that
 *      does reach a function, Postgres is still not touched.
 *
 * Writes call `revalidateTag`, which drops layer 2 immediately. Layer 1
 * expires on its own within EDGE_TTL, so a deleted network disappears from
 * every phone within about a minute without anyone polling for it.
 */

/** Bump either tag to drop the cached rows the moment an admin edits. */
export const TAG_NETWORKS = "networks";
export const TAG_CONTENT = "content";

/**
 * How long the CDN may answer without consulting the origin.
 *
 * Short on purpose. It bounds how stale a phone can be if a cache purge is
 * ever missed, and it costs nothing: origin hits are roughly
 * (edge locations x 60 per hour), which is a constant — it does not grow
 * with traffic. Ten million users cost the same as ten.
 */
export const EDGE_TTL = 60;

/**
 * How long a stale copy may still be served while a fresh one is fetched
 * behind the scenes. A full day, so a phone is never left waiting on the
 * origin and a brief outage is invisible.
 */
export const EDGE_SWR = 86_400;

/** Cache headers for the two public, identical-for-everyone feeds. */
export function publicFeedHeaders(rev: string): Record<string, string> {
  const policy = `public, s-maxage=${EDGE_TTL}, stale-while-revalidate=${EDGE_SWR}`;
  return {
    // Phones get `no-cache` so they always revalidate — cheap, because the
    // ETag turns it into a 304 that the CDN answers itself.
    "Cache-Control": `no-cache, ${policy}`,
    // Vercel prefers this one when both are present.
    "CDN-Cache-Control": policy,
    ETag: `"${rev}"`,
    // Separate cache entries per key, so a request without the shared key
    // can never be served a cached payload meant for the app.
    Vary: "X-Client-Key",
  };
}

/** Never let a rejection be cached and handed to somebody else. */
export const NO_STORE = { "Cache-Control": "no-store" } as const;

type NetworkRow = {
  id: string;
  name: string;
  ssid: string;
  password: string;
  security: string;
  area: string | null;
  note: string | null;
  priority: number;
  updated_at: string;
};

/**
 * Active networks, newest-priority first.
 *
 * Cached until a write bumps TAG_NETWORKS. Throwing on error matters: a
 * failed read must not be cached as an empty list, or every phone would
 * quietly lose its network list until the next edit.
 */
export const readActiveNetworks = unstable_cache(
  async (): Promise<NetworkRow[]> => {
    const { data, error } = await db()
      .from("networks")
      .select("id, name, ssid, password, security, area, note, priority, updated_at")
      .eq("is_active", true)
      .order("priority", { ascending: false })
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as NetworkRow[];
  },
  ["active-networks"],
  { tags: [TAG_NETWORKS] },
);

type BannerRow = Pick<
  Banner,
  "id" | "title" | "image_url" | "link_url" | "sort_order" | "updated_at"
>;
type ShopRow = Pick<
  Shop,
  "id" | "name" | "image_url" | "sells" | "address" | "phone" | "sort_order" | "updated_at"
>;

/** Banners and shops, cached until a write bumps TAG_CONTENT. */
export const readActiveContent = unstable_cache(
  async (): Promise<{ banners: BannerRow[]; shops: ShopRow[] }> => {
    const [bannersRes, shopsRes] = await Promise.all([
      db()
        .from("banners")
        .select("id, title, image_url, link_url, sort_order, updated_at")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false }),
      db()
        .from("shops")
        .select("id, name, image_url, sells, address, phone, sort_order, updated_at")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    if (bannersRes.error) throw new Error(bannersRes.error.message);
    if (shopsRes.error) throw new Error(shopsRes.error.message);

    return {
      banners: (bannersRes.data ?? []) as BannerRow[],
      shops: (shopsRes.data ?? []) as ShopRow[],
    };
  },
  ["active-content"],
  { tags: [TAG_CONTENT] },
);
