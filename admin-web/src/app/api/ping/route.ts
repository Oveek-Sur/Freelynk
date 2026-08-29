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

  const now = new Date().toISOString();

  // Upsert, so first_seen survives: it is only written when the row is
  // new, and this is what makes "total installs" mean something.
  const device = await db()
    .from("app_devices")
    .upsert(
      { id, last_seen: now, platform, app_version: version },
      { onConflict: "id" },
    );

  if (device.error) {
    return NextResponse.json(
      { error: device.error.message },
      { status: 500, headers: NO_STORE },
    );
  }

  // Day in Dhaka time, not UTC — otherwise "today" would roll over at
  // six in the morning for the people actually using this.
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
  }).format(new Date());

  // Second call is a no-op for a device already counted today, which is
  // why the primary key is (device_id, day).
  const activity = await db()
    .from("app_activity")
    .upsert({ device_id: id, day }, { onConflict: "device_id,day" });

  if (activity.error) {
    return NextResponse.json(
      { error: activity.error.message },
      { status: 500, headers: NO_STORE },
    );
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
