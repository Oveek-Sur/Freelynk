import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentAdmin } from "@/lib/auth";
import { NO_STORE } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Usage figures for the dashboard. Owner only — a moderator keeps the
 * data tidy, they do not get the business numbers.
 *
 * All of it comes from one SQL function so the counting rules live in
 * the database rather than being reimplemented here, and so the page
 * costs one round trip instead of six.
 */
export async function GET() {
  if (!(await currentAdmin())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }

  const { data, error } = await db().rpc("app_stats");

  if (error) {
    // Almost always means schema-analytics.sql has not been run yet.
    return NextResponse.json(
      {
        error: error.message,
        hint: "admin-web/schema-analytics.sql একবার Supabase SQL editor-এ চালান।",
      },
      { status: 500, headers: NO_STORE },
    );
  }

  return NextResponse.json({ stats: data }, { headers: NO_STORE });
}
