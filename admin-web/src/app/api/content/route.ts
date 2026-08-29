import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db, type Banner, type Shop } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";

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
      { status: 500 },
    );
  }

  if (!safeEqual(req.headers.get("x-client-key") ?? "", clientKey)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  if (bannersRes.error || shopsRes.error) {
    return NextResponse.json(
      { error: bannersRes.error?.message ?? shopsRes.error?.message },
      { status: 500 },
    );
  }

  const banners = (bannersRes.data ?? []) as Pick<
    Banner,
    "id" | "title" | "image_url" | "link_url" | "sort_order" | "updated_at"
  >[];
  const shops = (shopsRes.data ?? []) as Pick<
    Shop,
    | "id"
    | "name"
    | "image_url"
    | "sells"
    | "address"
    | "phone"
    | "sort_order"
    | "updated_at"
  >[];

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

  if (req.headers.get("if-none-match") === `"${rev}"`) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: `"${rev}"`, "Cache-Control": "no-store" },
    });
  }

  return new NextResponse(payload, {
    status: 200,
    headers: {
      "content-type": "application/json",
      ETag: `"${rev}"`,
      "Cache-Control": "no-store",
    },
  });
}
