import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const COOKIE = "fl_session";
const MAX_AGE = 60 * 60 * 12; // 12 hours

/**
 * Who is signed in.
 *
 * `admin` is the owner: everything, including banners and the usage
 * figures. `moderator` is for someone helping keep the data current —
 * they add and remove WiFi networks and partner shops, and that is all.
 * Banners are advertising and the numbers are the business, so neither
 * is a moderator's to touch.
 *
 * The role is baked into the signed session cookie, so it cannot be
 * changed by the browser without invalidating the signature.
 */
export type Role = "admin" | "moderator";

export type Session = { username: string; role: Role };

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("Missing SESSION_SECRET environment variable.");
  return new TextEncoder().encode(s);
}

export async function createSession(
  username: string,
  role: Role,
): Promise<string> {
  return await new SignJWT({ u: username, r: role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** The signed-in user, or null. Either role. */
export async function currentUser(): Promise<Session | null> {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.u !== "string") return null;

    // Sessions signed before roles existed carry no `r`. Treating those
    // as admin is safe: only the owner could have had one.
    const role: Role = payload.r === "moderator" ? "moderator" : "admin";
    return { username: payload.u, role };
  } catch {
    return null;
  }
}

/** True when signed in as the owner. */
export async function isAdmin(): Promise<boolean> {
  return (await currentUser())?.role === "admin";
}

/**
 * Signed-in username for routes both roles may use, or null.
 *
 * Named for what it guards rather than for a role, so a future reader
 * does not have to guess whether a moderator gets through.
 */
export async function currentStaff(): Promise<string | null> {
  return (await currentUser())?.username ?? null;
}

/** Signed-in username for admin-only routes, or null for everyone else. */
export async function currentAdmin(): Promise<string | null> {
  const user = await currentUser();
  return user?.role === "admin" ? user.username : null;
}
