import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encryptPayload, revisionOf, safeEqual } from "@/lib/crypto";

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
      { status: 500 },
    );
  }

  const provided = req.headers.get("x-client-key") ?? "";
  if (!safeEqual(provided, clientKey)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await db()
    .from("networks")
    .select("id, name, ssid, password, security, area, note, priority, updated_at")
    .eq("is_active", true)
    .order("priority", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  // Nothing changed since the app's last sync? Save the bandwidth.
  if (req.headers.get("if-none-match") === `"${rev}"`) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: `"${rev}"`, "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json(
    {
      v: 1,
      alg: "AES-256-GCM",
      rev,
      count: data?.length ?? 0,
      generatedAt: new Date().toISOString(),
      data: encryptPayload(plaintext, syncSecret),
    },
    { headers: { ETag: `"${rev}"`, "Cache-Control": "no-store" } },
  );
}
