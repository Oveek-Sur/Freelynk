/**
 * Proves the usage counting works against the live site, then removes
 * everything it created so the owner's figures start from zero.
 *
 *   node scripts/verify-analytics.mjs
 *
 * Checks the rules that actually matter: a device is counted once a day
 * however often it reports, a tap is counted every time, and a shop
 * deleted mid-month keeps the clicks it earned.
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

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(48)} ${detail}`);
  if (!ok) failures++;
};

const appHeaders = {
  "content-type": "application/json",
  "x-client-key": env.SYNC_CLIENT_KEY,
};

const post = (path, body, headers = appHeaders) =>
  fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });

console.log(`\nTarget: ${BASE}\n`);

// ── sign in ──────────────────────────────────────────────────────────────
const login = await fetch(`${BASE}/api/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    username: env.ADMIN_USERNAME,
    password: env.ADMIN_PASSWORD,
  }),
});
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
const stats = async () =>
  (await (await fetch(`${BASE}/api/stats`, { headers: { cookie } })).json()).stats;

console.log("Schema");
const first = await stats();
check("app_stats() responds", !!first, first ? "" : "did the SQL run?");
if (!first) {
  console.log("\nRun admin-web/schema-analytics.sql first.\n");
  process.exit(1);
}
check(
  "click breakdowns are present",
  Array.isArray(first.shopCalls) && Array.isArray(first.bannerClicks),
);
console.log(
  `        devices=${first.totalDevices} dau=${first.dau} mau=${first.mau}`,
);

// ── counting a device ────────────────────────────────────────────────────
console.log("\nCounting a device");
const device = randomUUID();
const ping = () =>
  post("/api/ping", { deviceId: device, platform: "android", appVersion: "verify" });

check("first report accepted", (await ping()).status === 200);
const afterFirst = await stats();
check(
  "install count rose by one",
  afterFirst.totalDevices === first.totalDevices + 1,
  `${first.totalDevices} -> ${afterFirst.totalDevices}`,
);
check("counted as active today", afterFirst.dau === first.dau + 1,
  `dau ${first.dau} -> ${afterFirst.dau}`);

// The rule that keeps this a count of people rather than of requests.
await ping();
await ping();
const afterRepeat = await stats();
check(
  "same device three times still counts once",
  afterRepeat.dau === afterFirst.dau &&
    afterRepeat.totalDevices === afterFirst.totalDevices,
  `dau=${afterRepeat.dau} devices=${afterRepeat.totalDevices}`,
);

// ── counting taps ────────────────────────────────────────────────────────
console.log("\nCounting taps");
const noKey = await fetch(`${BASE}/api/track`, { method: "POST" });
check("rejects a missing client key", noKey.status === 403, `HTTP ${noKey.status}`);
const badKind = await post("/api/track", { kind: "nonsense", id: randomUUID() });
check("rejects an unknown kind", badKind.status === 400, `HTTP ${badKind.status}`);
const badId = await post("/api/track", { kind: "banner", id: "nope" });
check("rejects a junk id", badId.status === 400, `HTTP ${badId.status}`);

// A real shop, so the dashboard can show a name rather than a bare id.
const created = await fetch(`${BASE}/api/shops`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({
    name: "__verify_shop",
    sells: "যাচাই",
    phone: "01700000000",
  }),
});
const shopId = (await created.json())?.shop?.id;
check("test shop created", !!shopId);

if (shopId) {
  for (let i = 0; i < 3; i++) {
    const r = await post("/api/track", { kind: "shop_call", id: shopId });
    if (r.status !== 200) check(`tap ${i + 1} recorded`, false, `HTTP ${r.status}`);
  }

  const withClicks = await stats();
  const row = (withClicks.shopCalls ?? []).find((r) => r.name === "__verify_shop");
  check("three taps counted as three", row?.clicks === 3, `clicks=${row?.clicks}`);
  check("shown by shop name, not id", !!row?.name, row?.name ?? "");

  // The reason app_clicks has no foreign key: a shop removed mid-month
  // must keep the clicks it earned, because that is the month you bill.
  await fetch(`${BASE}/api/shops/${shopId}`, {
    method: "DELETE",
    headers: { cookie },
  });
  const afterDelete = await stats();
  const survivor = (afterDelete.shopCalls ?? []).find((r) => r.clicks === 3);
  check(
    "a deleted shop keeps the clicks it earned",
    !!survivor,
    survivor ? `shown as "${survivor.name}"` : "history was lost",
  );
}

console.log(
  failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
