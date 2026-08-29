import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { currentAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TEMPORARY diagnostic. Delete once the deployment is confirmed healthy.
 *
 * Reports whether each variable arrived and a short fingerprint of its
 * value, so a local copy can be compared against production without ever
 * putting the secret itself on the wire. Also flags surrounding whitespace,
 * which is the usual casualty of pasting a .env file into a web form.
 *
 * Admin session required.
 */
const NAMES = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
  "SESSION_SECRET",
  "SYNC_SECRET",
  "SYNC_CLIENT_KEY",
] as const;

export async function GET() {
  if (!(await currentAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const report = NAMES.map((name) => {
    const raw = process.env[name];
    if (raw === undefined) return { name, present: false };
    return {
      name,
      present: true,
      length: raw.length,
      fingerprint: createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 12),
      hasSurroundingWhitespace: raw !== raw.trim(),
      hasCarriageReturn: raw.includes("\r"),
      hasQuotes: /^["']|["']$/.test(raw),
    };
  });

  return NextResponse.json({ report });
}
