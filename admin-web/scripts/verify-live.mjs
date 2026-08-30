/**
 * End-to-end check against the deployed site.
 *
 *   BASE=https://freelynk.vercel.app node scripts/verify-live.mjs
 *
 * Compares production environment variables against .env.local by SHA-256
 * fingerprint (never by value), then exercises the real endpoints: admin
 * gating, /api/networks, /api/sync decryption, ETag revalidation and
 * /api/content. Nothing is created or deleted — the database is read only.
 */
import { readFileSync } from "node:fs";
import { createHash, createDecipheriv } from "node:crypto";

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

const fp = (v) => createHash("sha256").update(v, "utf8").digest("hex").slice(0, 12);
const pad = (s, n) => String(s).padEnd(n);

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${pad(label, 46)} ${detail}`);
  if (!ok) failures++;
};

// ── 1. the site is up ────────────────────────────────────────────────────
console.log(`\nTarget: ${BASE}\n`);
console.log("Reachability");
const home = await fetch(`${BASE}/login`, { redirect: "manual" });
check("/login responds", home.status === 200, `HTTP ${home.status}`);

// ── 2. locked down before login ──────────────────────────────────────────
console.log("\nAdmin gating (no session)");
{
  const r = await fetch(`${BASE}/admin`, { redirect: "manual" });
  check("/admin redirects to /login", r.status === 307 || r.status === 308, `HTTP ${r.status}`);
  for (const p of ["/api/networks", "/api/banners", "/api/shops", "/api/stats"]) {
    const g = await fetch(`${BASE}${p}`);
    check(`${p} rejects anonymous`, g.status === 401, `HTTP ${g.status}`);
  }

  // Image upload was removed in favour of pasting a public link, so there
  // is no longer an endpoint that accepts a file at all. Better than a
  // guarded one: an attack surface that does not exist cannot be got past.
  const upload = await fetch(`${BASE}/api/upload`, { method: "POST" });
  check("/api/upload no longer exists", upload.status === 404, `HTTP ${upload.status}`);
}

// ── 3. login ─────────────────────────────────────────────────────────────
console.log("\nLogin");
const login = await fetch(`${BASE}/api/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD }),
});
check("credentials accepted", login.status === 200, `HTTP ${login.status}`);
const rawCookie = login.headers.get("set-cookie") ?? "";
check("cookie is HttpOnly", /HttpOnly/i.test(rawCookie));
check("cookie is Secure", /Secure/i.test(rawCookie));
const cookie = rawCookie.split(";")[0];
if (login.status !== 200) {
  console.log("\nCannot continue without a session.\n");
  process.exit(1);
}

// ── 4. environment fingerprints ──────────────────────────────────────────
console.log("\nEnvironment variables (production vs .env.local)");
const dbg = await fetch(`${BASE}/api/debug/env`, { headers: { cookie } });
if (dbg.status === 200) {
  const { report } = await dbg.json();
  for (const row of report) {
    const local = env[row.name];
    if (!row.present) {
      check(row.name, false, "MISSING on Vercel");
      continue;
    }
    const same = local !== undefined && row.fingerprint === fp(local);
    const notes = [
      row.hasSurroundingWhitespace ? "whitespace" : null,
      row.hasCarriageReturn ? "CR" : null,
      row.hasQuotes ? "quoted" : null,
    ].filter(Boolean);
    check(
      row.name,
      same && notes.length === 0,
      `${row.length}/${local?.length ?? "-"} chars` + (notes.length ? ` — ${notes.join(", ")}` : ""),
    );
  }
} else {
  console.log(`  (diagnostic endpoint returned HTTP ${dbg.status} — already removed?)`);
}

// ── 5. admin data ────────────────────────────────────────────────────────
console.log("\nAdmin API");
const netRes = await fetch(`${BASE}/api/networks`, { headers: { cookie } });
check("/api/networks responds", netRes.status === 200, `HTTP ${netRes.status}`);
let networks = [];
if (netRes.status === 200) {
  networks = (await netRes.json()).networks ?? [];
  check("returns at least one network", networks.length > 0, `${networks.length} row(s)`);
  console.log(
    `        rows: ${networks.map((n) => `${n.ssid}${n.is_active ? "" : " (off)"}`).join(", ") || "(none)"}`,
  );
}

// ── 6. the sync payload the phone actually downloads ─────────────────────
console.log("\nSync payload");
const noKey = await fetch(`${BASE}/api/sync`);
check("rejects a missing client key", noKey.status === 403, `HTTP ${noKey.status}`);

const sync = await fetch(`${BASE}/api/sync`, { headers: { "x-client-key": env.SYNC_CLIENT_KEY } });
check("accepts the real client key", sync.status === 200, `HTTP ${sync.status}`);

if (sync.status === 200) {
  const body = await sync.json();
  const wire = JSON.stringify(body);

  const plainLeak = networks.some(
    (n) => wire.includes(n.password) || (n.ssid.length > 3 && wire.includes(n.ssid)),
  );
  check("no plaintext SSID or password on the wire", !plainLeak);

  const raw = Buffer.from(body.data, "base64");
  const key = createHash("sha256").update(env.SYNC_SECRET, "utf8").digest();
  const d = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(raw.length - 16));
  let list = null;
  try {
    const json = Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString("utf8");
    list = JSON.parse(json).networks;
    check("decrypts with SYNC_SECRET", Array.isArray(list), `${list?.length ?? 0} network(s)`);
    check("count header matches the payload", body.count === list?.length, `header ${body.count}`);
  } catch (e) {
    check("decrypts with SYNC_SECRET", false, e.message);
  }

  if (Array.isArray(list)) {
    for (const n of list) {
      const src = networks.find((r) => r.ssid === n.ssid);
      check(
        `"${n.ssid}" matches the database`,
        !!src && src.password === n.password && (src.note ?? "") === (n.note ?? ""),
        src ? `note: ${n.note || "(none)"}` : "not found in /api/networks",
      );
    }
  }

  // wrong secret must fail closed
  const badKey = createHash("sha256").update(`${env.SYNC_SECRET}x`, "utf8").digest();
  let rejected = false;
  try {
    const b = createDecipheriv("aes-256-gcm", badKey, raw.subarray(0, 12));
    b.setAuthTag(raw.subarray(raw.length - 16));
    Buffer.concat([b.update(raw.subarray(12, raw.length - 16)), b.final()]);
  } catch {
    rejected = true;
  }
  check("a wrong secret cannot decrypt", rejected);

  const etag = sync.headers.get("etag");
  check("sends an ETag", !!etag, etag ?? "");
  if (etag) {
    const again = await fetch(`${BASE}/api/sync`, {
      headers: { "x-client-key": env.SYNC_CLIENT_KEY, "if-none-match": etag },
    });
    check("revalidates to 304", again.status === 304, `HTTP ${again.status}`);
  }
}

// ── 7. banners and shops ─────────────────────────────────────────────────
console.log("\nContent payload");
const cNoKey = await fetch(`${BASE}/api/content`);
check("rejects a missing client key", cNoKey.status === 403, `HTTP ${cNoKey.status}`);
const content = await fetch(`${BASE}/api/content`, {
  headers: { "x-client-key": env.SYNC_CLIENT_KEY },
});
check("accepts the real client key", content.status === 200, `HTTP ${content.status}`);
if (content.status === 200) {
  // Plaintext by design — adverts and shop phone numbers are meant to be
  // read. Only /api/sync carries secrets, so only /api/sync is encrypted.
  const body = await content.json();
  check(
    "returns banners + shops",
    Array.isArray(body.banners) && Array.isArray(body.shops),
    `${body.banners?.length ?? 0} banner(s), ${body.shops?.length ?? 0} shop(s)`,
  );
  check(
    "carries no WiFi credentials",
    !networks.some((n) => JSON.stringify(body).includes(n.password)),
  );

  const etag = content.headers.get("etag");
  check("sends an ETag", !!etag, etag ?? "");
  if (etag) {
    const again = await fetch(`${BASE}/api/content`, {
      headers: { "x-client-key": env.SYNC_CLIENT_KEY, "if-none-match": etag },
    });
    check("revalidates to 304", again.status === 304, `HTTP ${again.status}`);
  }
}

console.log(
  failures === 0
    ? "\nAll checks passed. The deployment is healthy.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
