import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { currentAdmin } from "@/lib/auth";
import { TAG_NETWORKS } from "@/lib/cache";

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
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.ssid === "string") patch.ssid = body.ssid.trim().replace(/["']/g, "");
  if (typeof body.password === "string") patch.password = body.password;
  if (["WPA", "WEP", "OPEN"].includes(body.security)) patch.security = body.security;
  if (typeof body.area === "string") patch.area = body.area.trim();
  if (typeof body.note === "string") patch.note = body.note.trim();
  if (Number.isFinite(body.priority)) patch.priority = Number(body.priority);
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "কিছু পরিবর্তন করা হয়নি।" }, { status: 400 });
  }

  const { data, error } = await db()
    .from("networks")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    const msg = error.code === "23505" ? "এই SSID আগেই যোগ করা আছে।" : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  revalidateTag(TAG_NETWORKS);

  return NextResponse.json({ network: data });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  if (!(await currentAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const { error } = await db().from("networks").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // The point of the whole cache design: gone from the database means gone
  // from every phone, without any of them polling for it.
  revalidateTag(TAG_NETWORKS);

  return NextResponse.json({ ok: true });
}
