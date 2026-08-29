/**
 * End-to-end check for banners + partner shops.
 *
 *   node scripts/e2e-content.mjs      (dev server must be running)
 *
 * Proves two things that matter:
 *   1. Every write path demands an admin session — the phone cannot reach them.
 *   2. What the admin saves is what /api/content hands the app.
 *
 * Creates throwaway rows and images, then deletes them.
 */
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";

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

// Smallest valid PNG (1x1, transparent).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let cookie = "";
let bannerId = null;
let shopId = null;

try {
  // ------------------------------------------------------- 0. preflight
  const login = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: env.ADMIN_USERNAME,
      password: env.ADMIN_PASSWORD,
    }),
  });
  cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

  const probe = await fetch(`${BASE}/api/banners`, { headers: { cookie } });
  if (probe.status === 500) {
    const body = await probe.json().catch(() => ({}));
    console.error(
      `\nThe banners/shops tables are not there yet.\n` +
        `Run admin-web/schema-content.sql in the Supabase SQL editor first.\n` +
        `Server said: ${body.error}\n`,
    );
    // Setting exitCode and returning lets Node close its sockets on its own.
    // Calling process.exit() here trips a libuv assertion on Windows while
    // keep-alive handles are still open, which looks like a real crash.
    process.exitCode = 2;
    throw new Error("SCHEMA_MISSING");
  }

  // ------------------------------------------------- 1. locked to admins
  console.log("\n1. Write paths refuse anonymous callers");

  for (const [label, path, init] of [
    ["list banners", "/api/banners", {}],
    ["create banner", "/api/banners", { method: "POST", body: "{}" }],
    ["list shops", "/api/shops", {}],
    ["create shop", "/api/shops", { method: "POST", body: "{}" }],
    ["upload image", "/api/upload", { method: "POST", body: new FormData() }],
  ]) {
    const res = await fetch(`${BASE}${path}`, init);
    check(`${label} → 401`, res.status === 401, `got ${res.status}`);
  }

  const noKey = await fetch(`${BASE}/api/content`);
  check("content without client key → 403", noKey.status === 403, `got ${noKey.status}`);

  // ------------------------------------------------------- 2. uploading
  console.log("\n2. Image upload");

  const badForm = new FormData();
  badForm.append("file", new Blob([Buffer.from("not an image")], { type: "text/plain" }), "x.txt");
  badForm.append("folder", "banners");
  const badUpload = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { cookie },
    body: badForm,
  });
  check("non-image rejected", badUpload.status === 400, `got ${badUpload.status}`);

  const form = new FormData();
  form.append("file", new Blob([PNG], { type: "image/png" }), "dot.png");
  form.append("folder", "banners");
  const up = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { cookie },
    body: form,
  });
  const upJson = await up.json();
  check("png uploaded", up.status === 201, `got ${up.status}`);
  check("public url returned", typeof upJson.url === "string" && upJson.url.startsWith("http"));

  const reachable = await fetch(upJson.url);
  check("uploaded image is publicly readable", reachable.ok, `got ${reachable.status}`);

  // --------------------------------------------------------- 3. banners
  console.log("\n3. Banners");

  const noImage = await fetch(`${BASE}/api/banners`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "no image" }),
  });
  check("banner without image rejected", noImage.status === 400, `got ${noImage.status}`);

  const evil = await fetch(`${BASE}/api/banners`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ image_url: upJson.url, link_url: "javascript:alert(1)" }),
  });
  check("javascript: link rejected", evil.status === 400, `got ${evil.status}`);

  const banner = await fetch(`${BASE}/api/banners`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      title: "E2E Banner",
      image_url: upJson.url,
      link_url: "https://example.com/offer",
      is_active: true,
    }),
  });
  bannerId = (await banner.json())?.banner?.id ?? null;
  check("banner created", banner.status === 201, `got ${banner.status}`);

  // ----------------------------------------------------------- 4. shops
  console.log("\n4. Partner shops");

  const noName = await fetch(`${BASE}/api/shops`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ sells: "tea" }),
  });
  check("shop without name rejected", noName.status === 400, `got ${noName.status}`);

  const badPhone = await fetch(`${BASE}/api/shops`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Bad Phone", phone: "call-me" }),
  });
  check("malformed phone rejected", badPhone.status === 400, `got ${badPhone.status}`);

  const shop = await fetch(`${BASE}/api/shops`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      name: "E2E Tea Stall",
      sells: "চা, বিস্কুট",
      address: "মিরপুর ১০",
      phone: "01712345678",
      image_url: upJson.url,
    }),
  });
  shopId = (await shop.json())?.shop?.id ?? null;
  check("shop created", shop.status === 201, `got ${shop.status}`);

  // ------------------------------------------- 5. what the app receives
  console.log("\n5. What the app receives from /api/content");

  const res = await fetch(`${BASE}/api/content`, {
    headers: { "x-client-key": env.SYNC_CLIENT_KEY },
  });
  const content = await res.json();
  check("content returns 200", res.status === 200, `got ${res.status}`);

  const myBanner = content.banners?.find((b) => b.id === bannerId);
  const myShop = content.shops?.find((s) => s.id === shopId);
  check("banner reaches the app", !!myBanner);
  check("banner link preserved", myBanner?.linkUrl === "https://example.com/offer");
  check("shop reaches the app", !!myShop);
  check("shop phone preserved", myShop?.phone === "01712345678");
  check("bengali text survives", myShop?.sells === "চা, বিস্কুট");

  check(
    "no wifi passwords leaked into content",
    !JSON.stringify(content).toLowerCase().includes("password"),
  );

  // --------------------------------------------- 6. switching banner off
  console.log("\n6. Turning a banner off hides it");

  await fetch(`${BASE}/api/banners/${bannerId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ is_active: false }),
  });

  const after = await (
    await fetch(`${BASE}/api/content`, {
      headers: { "x-client-key": env.SYNC_CLIENT_KEY },
    })
  ).json();

  check(
    "inactive banner disappears from the app payload",
    !after.banners?.some((b) => b.id === bannerId),
  );
} catch (err) {
  if (err.message !== "SCHEMA_MISSING") {
    console.error("\nUNEXPECTED ERROR:", err.message);
    fail++;
  }
} finally {
  if (cookie) {
    if (bannerId) {
      await fetch(`${BASE}/api/banners/${bannerId}`, { method: "DELETE", headers: { cookie } });
    }
    if (shopId) {
      await fetch(`${BASE}/api/shops/${shopId}`, { method: "DELETE", headers: { cookie } });
    }
    console.log("\n7. Cleanup — test rows and images removed.");
  }
}

if (process.exitCode !== 2) {
  console.log(`\n${"=".repeat(46)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(46)}`);
  process.exitCode = fail === 0 ? 0 : 1;
}
