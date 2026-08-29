import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentAdmin } from "@/lib/auth";
import { clean, safePhone } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await db()
    .from("shops")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ shops: data ?? [] });
}

export async function POST(req: Request) {
  if (!(await currentAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const name = clean(body.name);
  if (!name) {
    return NextResponse.json({ error: "দোকানের নাম দিতে হবে।" }, { status: 400 });
  }

  const phone = safePhone(clean(body.phone));
  if (phone === null) {
    return NextResponse.json(
      { error: "ফোন নাম্বারটি সঠিক নয়। যেমন: 01712345678" },
      { status: 400 },
    );
  }

  const { data, error } = await db()
    .from("shops")
    .insert({
      name,
      image_url: clean(body.image_url),
      sells: clean(body.sells),
      address: clean(body.address),
      phone,
      sort_order: Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0,
      is_active: body.is_active !== false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ shop: data }, { status: 201 });
}
