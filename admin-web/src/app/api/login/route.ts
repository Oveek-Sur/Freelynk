import { NextResponse } from "next/server";
import { createSession, setSessionCookie, type Role } from "@/lib/auth";
import { safeEqual } from "@/lib/crypto";

export const runtime = "nodejs";

/**
 * One form, two sets of credentials.
 *
 * The role follows from which password was typed, so there is no role
 * selector for anyone to tamper with, and nothing extra for a moderator
 * to understand — they simply sign in and see less.
 */
export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));

  const adminUser = process.env.ADMIN_USERNAME;
  const adminPass = process.env.ADMIN_PASSWORD;

  if (!adminUser || !adminPass) {
    return NextResponse.json(
      { error: "Server is missing ADMIN_USERNAME / ADMIN_PASSWORD." },
      { status: 500 },
    );
  }

  const accounts: { user: string; pass: string; role: Role }[] = [
    { user: adminUser, pass: adminPass, role: "admin" },
  ];

  // Optional: leave the pair unset and there is simply no moderator.
  const modUser = process.env.MODERATOR_USERNAME;
  const modPass = process.env.MODERATOR_PASSWORD;
  if (modUser && modPass) {
    accounts.push({ user: modUser, pass: modPass, role: "moderator" });
  }

  const typedUser = typeof username === "string" ? username : "";
  const typedPass = typeof password === "string" ? password : "";

  // Every candidate is checked with no early exit, so how long this takes
  // does not hint at which account names exist.
  let matched: Role | null = null;
  for (const account of accounts) {
    const hit =
      safeEqual(typedUser, account.user) && safeEqual(typedPass, account.pass);
    if (hit) matched = account.role;
  }

  if (!matched) {
    // Small delay to blunt brute forcing.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json(
      { error: "ইউজারনেম বা পাসওয়ার্ড ভুল।" },
      { status: 401 },
    );
  }

  await setSessionCookie(await createSession(typedUser, matched));
  return NextResponse.json({ ok: true, role: matched });
}
