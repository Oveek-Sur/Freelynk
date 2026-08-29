import { NextResponse } from "next/server";
import { createSession, setSessionCookie } from "@/lib/auth";
import { safeEqual } from "@/lib/crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));

  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPass = process.env.ADMIN_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return NextResponse.json(
      { error: "Server is missing ADMIN_USERNAME / ADMIN_PASSWORD." },
      { status: 500 },
    );
  }

  const ok =
    typeof username === "string" &&
    typeof password === "string" &&
    safeEqual(username, expectedUser) &&
    safeEqual(password, expectedPass);

  if (!ok) {
    // Small delay to blunt brute forcing.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json(
      { error: "ইউজারনেম বা পাসওয়ার্ড ভুল।" },
      { status: 401 },
    );
  }

  await setSessionCookie(await createSession(username));
  return NextResponse.json({ ok: true });
}
