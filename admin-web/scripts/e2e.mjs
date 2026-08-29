/**
 * End-to-end check against a running dev server + the real Supabase project.
 *
 *   node scripts/e2e.mjs
 *
 * Walks the exact path the product takes:
 *   admin logs in -> adds a network -> phone pulls /api/sync -> decrypts it.
 *
 * Creates a throwaway network and deletes it again at the end.
 */
import { createHash, createDecipheriv } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";

// Read .env.local ourselves so this script needs no extra deps.
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

let pass = 0;
let fail = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

/** Mirror of the Dart decryptor in mobile/lib/core/crypto_service.dart. */
function decrypt(b64, secret) {
  const raw = Buffer.from(b64, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(raw.length - 16);
  const ct = raw.subarray(12, raw.length - 16);
  const key = createHash("sha256").update(secret, "utf8").digest();
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

const SSID = `__e2e_${Date.now().toString(36)}`;
const PASSWORD = "e2e-secret-password";
let cookie = "";
let createdId = null;

try {
  // ---------------------------------------------------------------- 1. auth
  console.log("\n1. Admin login");

  const bad = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: env.ADMIN_USERNAME, password: "wrong" }),
  });
  check("wrong password rejected", bad.status === 401, `got ${bad.status}`);

  const good = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: env.ADMIN_USERNAME,
      password: env.ADMIN_PASSWORD,
    }),
  });
  cookie = (good.headers.get("set-cookie") ?? "").split(";")[0];
  check("correct password accepted", good.status === 200, `got ${good.status}`);
  check("session cookie issued", cookie.startsWith("sl_session="));

  const noAuth = await fetch(`${BASE}/api/networks`);
  check("network list needs auth", noAuth.status === 401, `got ${noAuth.status}`);

  // ------------------------------------------------------------- 2. create
  console.log("\n2. Add a network from the panel");

  const weak = await fetch(`${BASE}/api/networks`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ ssid: `${SSID}_weak`, password: "123" }),
  });
  check("short WPA password rejected", weak.status === 400, `got ${weak.status}`);

  const created = await fetch(`${BASE}/api/networks`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      name: "E2E Test Cafe",
      ssid: `"${SSID}"`, // deliberately quoted — server must strip them
      password: PASSWORD,
      security: "WPA",
      area: "Mirpur",
      note: "temporary row from e2e.mjs",
    }),
  });
  const createdBody = await created.json();
  createdId = createdBody?.network?.id ?? null;
  check("network created", created.status === 201, `got ${created.status}`);
  check(
    "quotes stripped from SSID",
    createdBody?.network?.ssid === SSID,
    `stored "${createdBody?.network?.ssid}"`,
  );

  const dup = await fetch(`${BASE}/api/networks`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ ssid: SSID, password: PASSWORD }),
  });
  check("duplicate SSID rejected", dup.status === 400, `got ${dup.status}`);

  // --------------------------------------------------------------- 3. sync
  console.log("\n3. Phone pulls /api/sync");

  const noKey = await fetch(`${BASE}/api/sync`);
  check("sync blocked without client key", noKey.status === 403, `got ${noKey.status}`);

  const wrongKey = await fetch(`${BASE}/api/sync`, {
    headers: { "x-client-key": "nope" },
  });
  check("sync blocked with wrong key", wrongKey.status === 403, `got ${wrongKey.status}`);

  const res = await fetch(`${BASE}/api/sync`, {
    headers: { "x-client-key": env.SYNC_CLIENT_KEY },
  });
  const payload = await res.json();
  check("sync returns 200", res.status === 200, `got ${res.status}`);
  check("payload is AES-256-GCM", payload.alg === "AES-256-GCM");

  const body = JSON.stringify(payload);
  check(
    "plaintext password NOT in response body",
    !body.includes(PASSWORD),
    "password leaked in cleartext!",
  );

  // ------------------------------------------------------------ 4. decrypt
  console.log("\n4. Decrypt exactly like the Flutter app does");

  const plain = JSON.parse(decrypt(payload.data, env.SYNC_SECRET));
  const mine = plain.networks.find((n) => n.ssid === SSID);
  check("decrypts with correct secret", Array.isArray(plain.networks));
  check("our network is present", !!mine, `${plain.networks.length} network(s) total`);
  check("password survives round trip", mine?.password === PASSWORD);

  let tampered = false;
  try {
    decrypt(payload.data, "the-wrong-secret");
  } catch {
    tampered = true;
  }
  check("wrong secret fails to decrypt", tampered);

  // ---------------------------------------------------------------- 5. etag
  console.log("\n5. ETag revalidation");

  const etag = res.headers.get("etag");
  const again = await fetch(`${BASE}/api/sync`, {
    headers: { "x-client-key": env.SYNC_CLIENT_KEY, "if-none-match": etag ?? "" },
  });
  check("unchanged data returns 304", again.status === 304, `got ${again.status}`);
} catch (err) {
  console.error("\nUNEXPECTED ERROR:", err.message);
  fail++;
} finally {
  if (createdId && cookie) {
    const del = await fetch(`${BASE}/api/networks/${createdId}`, {
      method: "DELETE",
      headers: { cookie },
    });
    console.log(`\n6. Cleanup — test row deleted: ${del.ok}`);
  }
}

console.log(`\n${"=".repeat(46)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(46)}`);
process.exit(fail === 0 ? 0 : 1);
