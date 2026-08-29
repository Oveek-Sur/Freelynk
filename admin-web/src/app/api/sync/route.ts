import { NextResponse } from "next/server";
import { encryptPayload, revisionOf, safeEqual } from "@/lib/crypto";
import { NO_STORE, publicFeedHeaders, readActiveNetworks } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PUBLIC endpoint consumed by the mobile app. No user login.
 *
 * Protection layers:
 *   1. X-Client-Key header must match SYNC_CLIENT_KEY (keeps casual scrapers out)
 *   2. Response body is AES-256-GCM encrypted with SYNC_SECRET
 *
 * Be realistic: both secrets ship inside the APK, so a determined
 * reverse-engineer can extract them. This stops drive-by scraping,
 * not a motivated attacker. Rotate SYNC_SECRET + SYNC_CLIENT_KEY and
 * push an app update if you ever need to cut old builds off.
 */
export async function GET(req: Request) {
  const syncSecret = process.env.SYNC_SECRET;
  const clientKey = process.env.SYNC_CLIENT_KEY;

  if (!syncSecret || !clientKey) {
    return NextResponse.json(
      { error: "Server is missing SYNC_SECRET / SYNC_CLIENT_KEY." },
      { status: 500, headers: NO_STORE },
    );
  }

  const provided = req.headers.get("x-client-key") ?? "";
  if (!safeEqual(provided, clientKey)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: NO_STORE },
    );
  }

  let data;
  try {
    // Cached until an admin write bumps the tag, so the phones' traffic does
    // not reach Postgres at all.
    data = await readActiveNetworks();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Database unavailable." },
      { status: 500, headers: NO_STORE },
    );
  }

  const plaintext = JSON.stringify({
    networks: (data ?? []).map((n) => ({
      id: n.id,
      name: n.name,
      ssid: n.ssid,
      password: n.password,
      security: n.security,
      area: n.area,
      note: n.note,
      priority: n.priority,
      updatedAt: n.updated_at,
    })),
  });

  const rev = revisionOf(plaintext);

  const headers = publicFeedHeaders(rev);

  // Nothing changed since the app's last sync? Save the bandwidth.
  if (req.headers.get("if-none-match") === `"${rev}"`) {
    return new NextResponse(null, { status: 304, headers });
  }

  return NextResponse.json(
    {
      v: 1,
      alg: "AES-256-GCM",
      rev,
      count: data?.length ?? 0,
      // Deliberately not a timestamp. This response is cached and handed to
      // many phones; stamping the moment it was generated would make every
      // copy unique and defeat the point.
      data: encryptPayload(plaintext, syncSecret),
    },
    { headers },
  );
}
