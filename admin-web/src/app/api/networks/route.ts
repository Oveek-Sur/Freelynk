import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { currentAdmin } from "@/lib/auth";
import { TAG_NETWORKS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function GET() {
  if (!(await currentAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await db()
    .from("networks")
    .select("*")
    .order("priority", { ascending: false })
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ networks: data ?? [] });
}

export async function POST(req: Request) {
  if (!(await currentAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  // SSID must not carry stray quotes — that was a real bug source before.
  const ssid = clean(body.ssid).replace(/["']/g, "");
  const name = clean(body.name) || ssid;
  const password = typeof body.password === "string" ? body.password : "";
  const security = ["WPA", "WEP", "OPEN"].includes(body.security)
    ? body.security
    : "WPA";

  if (!ssid) {
    return NextResponse.json({ error: "SSID দিতে হবে।" }, { status: 400 });
  }
  if (security !== "OPEN" && password.length < 8) {
    return NextResponse.json(
      { error: "WPA/WEP নেটওয়ার্কের পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।" },
      { status: 400 },
    );
  }

  const { data, error } = await db()
    .from("networks")
    .insert({
      name,
      ssid,
      password,
      security,
      area: clean(body.area),
      note: clean(body.note),
      priority: Number.isFinite(body.priority) ? Number(body.priority) : 0,
      is_active: body.is_active !== false,
    })
    .select()
    .single();

  if (error) {
    const msg = error.code === "23505" ? "এই SSID আগেই যোগ করা আছে।" : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Drop the cached list so the phones pick this up on their next sync.
  revalidateTag(TAG_NETWORKS);

  return NextResponse.json({ network: data }, { status: 201 });
}
