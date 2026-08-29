import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { currentAdmin } from "@/lib/auth";
import { TAG_CONTENT } from "@/lib/cache";
import { safeImageUrl, safeLink } from "@/lib/validate";

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
    const image = safeImageUrl(body.image_url.trim());
    if (!image) {
      return NextResponse.json(
        { error: "ছবির লিংক https:// দিয়ে শুরু হতে হবে।" },
        { status: 400 },
      );
    }
    patch.image_url = image;
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

  // Nothing to clean up when the image changes: we only ever held a link,
  // never the file. Whoever hosts it stays responsible for it.
  const { data, error } = await db()
    .from("banners")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  revalidateTag(TAG_CONTENT);

  return NextResponse.json({ banner: data });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  if (!(await currentAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const { error } = await db().from("banners").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  revalidateTag(TAG_CONTENT);

  return NextResponse.json({ ok: true });
}
