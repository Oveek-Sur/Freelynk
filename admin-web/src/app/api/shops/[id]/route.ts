import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { currentAdmin } from "@/lib/auth";
import { TAG_CONTENT } from "@/lib/cache";
import { safeImageUrl, safePhone } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  if (!(await currentAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim();
  }
  if (typeof body.image_url === "string") {
    const image = safeImageUrl(body.image_url.trim());
    if (image === null) {
      return NextResponse.json(
        { error: "ছবির লিংক https:// দিয়ে শুরু হতে হবে।" },
        { status: 400 },
      );
    }
    patch.image_url = image;
  }
  if (typeof body.sells === "string") patch.sells = body.sells.trim();
  if (typeof body.address === "string") patch.address = body.address.trim();
  if (typeof body.phone === "string") {
    const phone = safePhone(body.phone.trim());
    if (phone === null) {
      return NextResponse.json(
        { error: "ফোন নাম্বারটি সঠিক নয়। যেমন: 01712345678" },
        { status: 400 },
      );
    }
    patch.phone = phone;
  }
  if (Number.isFinite(body.sort_order)) patch.sort_order = Number(body.sort_order);
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "কিছু পরিবর্তন করা হয়নি।" }, { status: 400 });
  }

  // Nothing to clean up when the image changes: we only ever held a link,
  // never the file. Whoever hosts it stays responsible for it.
  const { data, error } = await db()
    .from("shops")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  revalidateTag(TAG_CONTENT);

  return NextResponse.json({ shop: data });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  if (!(await currentAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const { error } = await db().from("shops").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  revalidateTag(TAG_CONTENT);

  return NextResponse.json({ ok: true });
}
