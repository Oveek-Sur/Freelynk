import { NextResponse } from "next/server";
import { db, removeStoredImage, type Banner } from "@/lib/db";
import { currentAdmin } from "@/lib/auth";
import { safeLink } from "@/lib/validate";

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
  if (typeof body.title === "string") patch.title = body.title.trim();
  if (typeof body.image_url === "string" && body.image_url.trim()) {
    patch.image_url = body.image_url.trim();
  }
  if (typeof body.link_url === "string") {
    const link = safeLink(body.link_url.trim());
    if (link === null) {
      return NextResponse.json(
        { error: "লিংকটি http:// বা https:// দিয়ে শুরু হতে হবে।" },
        { status: 400 },
      );
    }
    patch.link_url = link;
  }
  if (Number.isFinite(body.sort_order)) patch.sort_order = Number(body.sort_order);
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "কিছু পরিবর্তন করা হয়নি।" }, { status: 400 });
  }

  // Swapping the image? Drop the old file once the row is updated.
  let previousImage: string | null = null;
  if (patch.image_url) {
    const { data } = await db()
      .from("banners")
      .select("image_url")
      .eq("id", id)
      .single();
    previousImage = (data as Pick<Banner, "image_url"> | null)?.image_url ?? null;
  }

  const { data, error } = await db()
    .from("banners")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (previousImage && previousImage !== patch.image_url) {
    await removeStoredImage(previousImage);
  }

  return NextResponse.json({ banner: data });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  if (!(await currentAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const { data: row } = await db()
    .from("banners")
    .select("image_url")
    .eq("id", id)
    .single();

  const { error } = await db().from("banners").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const image = (row as Pick<Banner, "image_url"> | null)?.image_url;
  if (image) await removeStoredImage(image);

  return NextResponse.json({ ok: true });
}
