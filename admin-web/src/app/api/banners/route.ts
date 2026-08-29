import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { currentAdmin } from "@/lib/auth";
import { TAG_CONTENT } from "@/lib/cache";
import { clean, safeLink } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await db()
    .from("banners")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ banners: data ?? [] });
}

export async function POST(req: Request) {
  if (!(await currentAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const imageUrl = clean(body.image_url);
  if (!imageUrl) {
    return NextResponse.json({ error: "ব্যানারের ছবি দিতে হবে।" }, { status: 400 });
  }

  const link = safeLink(clean(body.link_url));
  if (link === null) {
    return NextResponse.json(
      { error: "লিংকটি http:// বা https:// দিয়ে শুরু হতে হবে।" },
      { status: 400 },
    );
  }

  const { data, error } = await db()
    .from("banners")
    .insert({
      title: clean(body.title),
      image_url: imageUrl,
      link_url: link,
      sort_order: Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0,
      is_active: body.is_active !== false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  revalidateTag(TAG_CONTENT);

  return NextResponse.json({ banner: data }, { status: 201 });
}
