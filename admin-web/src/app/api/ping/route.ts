import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";
import { NO_STORE } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "This device was used today."
 *
 * Deliberately a separate endpoint rather than counting /api/sync hits.
 * /api/sync is served from the CDN precisely so it never reaches a
 * function — counting there would mean turning that off and paying a
 * function invocation per launch, which is the cost the caching exists
 * to avoid. Splitting them keeps the expensive path free and confines
 * the metered work to one small write.
 *
 * The app calls this at most once per calendar day per install, so the
 * traffic here is bounded by daily active users, not by launches.
 *
 * The id is a random UUID the app made up for itself. There is no
 * account, no phone number, no advertising id and no location — the app
 * asks for no login, so it has no business knowing who anyone is.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const clientKey = process.env.SYNC_CLIENT_KEY;
  if (!clientKey) {
    return NextResponse.json(
      { error: "Server is missing SYNC_CLIENT_KEY." },
      { status: 500, headers: NO_STORE },
    );
  }

  if (!safeEqual(req.headers.get("x-client-key") ?? "", clientKey)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: NO_STORE },
    );
  }

  const body = await req.json().catch(() => ({}));
  const id = typeof body.deviceId === "string" ? body.deviceId.trim() : "";

  // Reject anything that is not a UUID. Without this, a junk id per
  // request would inflate the install count without limit.
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Bad device id." },
      { status: 400, headers: NO_STORE },
    );
  }

  const version =
    typeof body.appVersion === "string" ? body.appVersion.trim().slice(0, 32) : null;
  const platform =
    typeof body.platform === "string" && body.platform.trim()
      ? body.platform.trim().slice(0, 16)
      : "android";

  // One statement: it updates the device row and, only if this device
  // has not already been seen today, bumps that day's counter. Keeping
  // the rule in SQL means a launch costs a single round trip, and means
  // the "already counted today" decision is made where the row is
  // locked rather than across the network.
  const { error } = await db().rpc("record_device", {
    p_id: id,
    p_platform: platform,
    p_version: version,
  });

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        hint: "admin-web/schema-analytics.sql একবার Supabase SQL editor-এ চালান।",
      },
      { status: 500, headers: NO_STORE },
    );
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
