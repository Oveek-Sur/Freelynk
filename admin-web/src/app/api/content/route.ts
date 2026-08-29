import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { safeEqual } from "@/lib/crypto";
import { NO_STORE, publicFeedHeaders, readActiveContent } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PUBLIC endpoint for banners and partner shops. No login.
 *
 * Deliberately NOT encrypted, unlike /api/sync. WiFi passwords are
 * secrets; adverts and shop phone numbers are meant to be seen. Wrapping
 * them in AES would add ceremony without protecting anything, and would
 * force the app to cache them offline when the whole point is that this
 * section needs a live connection.
 *
 * Still gated on X-Client-Key so it isn't trivially scriptable.
 */
export async function GET(req: Request) {
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

  let banners;
  let shops;
  try {
    // Cached until an admin write bumps the tag — see lib/cache.ts.
    ({ banners, shops } = await readActiveContent());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Database unavailable." },
      { status: 500, headers: NO_STORE },
    );
  }

  const body = {
    banners: banners.map((b) => ({
      id: b.id,
      title: b.title,
      imageUrl: b.image_url,
      linkUrl: b.link_url,
    })),
    shops: shops.map((s) => ({
      id: s.id,
      name: s.name,
      imageUrl: s.image_url,
      sells: s.sells,
      address: s.address,
      phone: s.phone,
    })),
  };

  const payload = JSON.stringify(body);
  const rev = createHash("sha256").update(payload).digest("hex").slice(0, 16);

  const headers = publicFeedHeaders(rev);

  if (req.headers.get("if-none-match") === `"${rev}"`) {
    return new NextResponse(null, { status: 304, headers });
  }

  return new NextResponse(payload, {
    status: 200,
    headers: { ...headers, "content-type": "application/json" },
  });
}
