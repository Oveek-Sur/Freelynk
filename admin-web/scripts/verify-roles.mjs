/**
 * Proves the role boundary holds on the live site, and that the usage
 * counting works end to end.
 *
 *   MOD_USER=arjun MOD_PASS='...' node scripts/verify-roles.mjs
 *
 * The moderator checks matter more than the admin ones: hiding a tab is
 * decoration, the API refusing is the actual security boundary.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const BASE = (process.env.BASE ?? "https://freelynk.vercel.app").replace(/\/$/, "");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const MOD_USER = process.env.MOD_USER ?? "";
const MOD_PASS = process.env.MOD_PASS ?? "";

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(50)} ${detail}`);
  if (!ok) failures++;
};

async function login(username, password) {
  const res = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const json = await res.json().catch(() => ({}));
  return {
    status: res.status,
    role: json.role ?? null,
    cookie: (res.headers.get("set-cookie") ?? "").split(";")[0],
  };
}

const get = (path, cookie) => fetch(`${BASE}${path}`, { headers: { cookie } });

console.log(`\nTarget: ${BASE}\n`);

// ── admin ────────────────────────────────────────────────────────────────
console.log("Owner sign-in");
const admin = await login(env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
check("admin credentials accepted", admin.status === 200, `HTTP ${admin.status}`);
check("session says admin", admin.role === "admin", `role=${admin.role}`);

// ── has the analytics schema been installed? ─────────────────────────────
console.log("\nUsage schema");
const statsRes = await get("/api/stats", admin.cookie);
const statsJson = await statsRes.json().catch(() => ({}));
check("/api/stats works for the owner", statsRes.status === 200,
  statsRes.status === 200 ? "" : (statsJson.hint ?? statsJson.error ?? `HTTP ${statsRes.status}`));

if (statsRes.status === 200) {
  const s = statsJson.stats ?? {};
  console.log(`        devices=${s.totalDevices} dau=${s.dau} wau=${s.wau} mau=${s.mau}`);
  check("returns every expected figure",
    ["totalDevices", "newToday", "dau", "wau", "mau", "daily"].every((k) => k in s));
}

// ── counting a device ────────────────────────────────────────────────────
console.log("\nCounting a device");
const testId = randomUUID();
const ping = async (id) =>
  fetch(`${BASE}/api/ping`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-client-key": env.SYNC_CLIENT_KEY },
    body: JSON.stringify({ deviceId: id, platform: "android", appVersion: "verify" }),
  });

const noKey = await fetch(`${BASE}/api/ping`, { method: "POST" });
check("rejects a missing client key", noKey.status === 403, `HTTP ${noKey.status}`);

const bad = await ping("not-a-uuid");
check("rejects a junk device id", bad.status === 400, `HTTP ${bad.status}`);

const before = statsRes.status === 200 ? (statsJson.stats?.totalDevices ?? 0) : null;
const p1 = await ping(testId);
check("accepts a real ping", p1.status === 200, `HTTP ${p1.status}`);
const p2 = await ping(testId);
check("the same device twice is not double counted", p2.status === 200, `HTTP ${p2.status}`);

if (before !== null && p1.status === 200) {
  const after = await (await get("/api/stats", admin.cookie)).json();
  const grew = (after.stats?.totalDevices ?? 0) - before;
  check("install count rose by exactly one", grew === 1, `${before} -> ${after.stats?.totalDevices}`);
  check("today's active count includes it", (after.stats?.dau ?? 0) >= 1, `dau=${after.stats?.dau}`);
}

// ── moderator ────────────────────────────────────────────────────────────
console.log("\nModerator sign-in");
if (!MOD_USER || !MOD_PASS) {
  console.log("  (set MOD_USER / MOD_PASS to test the moderator)");
} else {
  let mod = await login(MOD_USER, MOD_PASS);

  // The password was quoted in chat with spaces around the "=", which is
  // exactly how a stray leading space gets into a dashboard field. If the
  // clean value fails, say so rather than leaving it a mystery.
  if (mod.status !== 200) {
    const padded = await login(MOD_USER, ` ${MOD_PASS}`);
    if (padded.status === 200) {
      console.log("  NOTE: only works with a LEADING SPACE — fix the value in Vercel.");
      mod = padded;
    }
  }

  check("moderator credentials accepted", mod.status === 200, `HTTP ${mod.status}`);
  check("session says moderator", mod.role === "moderator", `role=${mod.role}`);

  if (mod.status === 200) {
    console.log("\nModerator may manage data");
    for (const p of ["/api/networks", "/api/shops"]) {
      const r = await get(p, mod.cookie);
      check(`${p} allowed`, r.status === 200, `HTTP ${r.status}`);
    }

    // Can actually write, not just read.
    const made = await fetch(`${BASE}/api/shops`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: mod.cookie },
      body: JSON.stringify({ name: "__rolecheck", sells: "x", address: "y" }),
    });
    const madeJson = await made.json().catch(() => ({}));
    check("moderator can add a shop", made.status === 201, `HTTP ${made.status}`);
    if (madeJson.shop?.id) {
      const del = await fetch(`${BASE}/api/shops/${madeJson.shop.id}`, {
        method: "DELETE",
        headers: { cookie: mod.cookie },
      });
      check("moderator can remove a shop", del.status === 200, `HTTP ${del.status}`);
    }

    console.log("\nModerator is refused everything else");
    for (const p of ["/api/banners", "/api/stats"]) {
      const r = await get(p, mod.cookie);
      check(`${p} refused`, r.status === 401, `HTTP ${r.status}`);
    }
    const bannerWrite = await fetch(`${BASE}/api/banners`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: mod.cookie },
      body: JSON.stringify({ image_url: "https://example.com/a.jpg" }),
    });
    check("cannot create a banner", bannerWrite.status === 401, `HTTP ${bannerWrite.status}`);
  }
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
