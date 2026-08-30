import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";
import { NO_STORE } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Somebody tapped this advert."
 *
 * Separate from /api/ping because the two are counted differently: a
 * ping is once per device per day, a tap is every time. Both stay off
 * the cached feeds so the read path keeps costing nothing.
 *
 * Cheap at scale despite being uncapped, because taps are rare next to
 * views — a few hundred a day where there are millions of launches, and
 * the write lands on one counter row per advert per day.
 *
 * Nothing about the device is recorded. This counts what an advert got,
 * not what a person did.
 */
const KINDS = new Set(["shop_call", "banner"]);

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
  const kind = typeof body.kind === "string" ? body.kind : "";
  const id = typeof body.id === "string" ? body.id.trim() : "";

  if (!KINDS.has(kind) || !UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Bad kind or id." },
      { status: 400, headers: NO_STORE },
    );
  }

  const { error } = await db().rpc("record_click", {
    p_kind: kind,
    p_target: id,
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
