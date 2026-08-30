/**
 * Adds a banner through the real admin panel, in a real browser.
 *
 *   node scripts/ui-add-banner.mjs
 *
 * The API was already proven; this exercises the part that was not — the
 * page a person actually clicks. It types a link, presses প্রিভিউ, keeps
 * the image and saves, screenshotting each step, so a broken preview or a
 * disabled button shows up here rather than on the day it is needed.
 *
 * Drives Chrome over the DevTools Protocol with Node's built-in WebSocket,
 * so nothing has to be installed. The browser profile is kept on D: to
 * leave the system drive alone.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { readFileSync } from "node:fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PROFILE = "D:/freelynk-app/.chrome-profile";
const SHOTS = "D:/freelynk-app/.uishots";
const PORT = 9222;
const BASE = "https://freelynk.vercel.app";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── launch ───────────────────────────────────────────────────────────────
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-gpu",
  "--window-size=1280,1200",
  "about:blank",
], { stdio: "ignore" });

let ws;
const pending = new Map();
let nextId = 1;

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error("Chrome did not expose a debugging port");
}

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`${method} timed out`));
    }, 30_000);
  });
}

/** Runs JS in the page and returns the value. */
async function evaluate(expression) {
  const res = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description ?? "page error");
  }
  return res.result?.value;
}

async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, "base64"));
  console.log(`  screenshot: ${name}.png`);
}

async function goto(url) {
  await send("Page.navigate", { url });
  await sleep(3500);
}

const wsUrl = await connect();
ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
};

await send("Page.enable");
await send("Runtime.enable");

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(44)} ${detail}`);
  if (!ok) failures++;
};

try {
  // ── sign in ────────────────────────────────────────────────────────────
  console.log("\nSigning in through the form");
  await goto(`${BASE}/login`);

  await evaluate(`
    (() => {
      const set = (el, v) => {
        const proto = Object.getPrototypeOf(el);
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const inputs = [...document.querySelectorAll('input')];
      const user = inputs.find(i => i.type !== 'password');
      const pass = inputs.find(i => i.type === 'password');
      set(user, ${JSON.stringify(env.ADMIN_USERNAME)});
      set(pass, ${JSON.stringify(env.ADMIN_PASSWORD)});
      document.querySelector('form').requestSubmit();
      return true;
    })()
  `);
  await sleep(5000);

  const url = await evaluate("location.pathname");
  check("reached the admin page", url === "/admin", url);
  await shot("01-admin");

  // ── open the banner tab ────────────────────────────────────────────────
  console.log("\nOpening the banner tab");
  const opened = await evaluate(`
    (() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => x.textContent.trim() === 'ব্যানার');
      if (!b) return false;
      b.click();
      return true;
    })()
  `);
  check("banner tab found and clicked", opened === true);
  await sleep(1500);

  // ── type the link and press preview ────────────────────────────────────
  console.log("\nUsing the image link + preview");
  const IMG = "https://freelynk.vercel.app/promo/freelynk-ad.png";

  await evaluate(`
    (() => {
      const set = (el, v) => {
        const proto = Object.getPrototypeOf(el);
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const link = document.querySelector('input[placeholder^="https://example.com/banner"]');
      set(link, ${JSON.stringify(IMG)});
      return true;
    })()
  `);

  await evaluate(`
    (() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => x.textContent.trim() === 'প্রিভিউ');
      b.click();
      return true;
    })()
  `);
  await sleep(5000);
  await shot("02-preview");

  // A picture that loads is committed on the spot, so the confirmation
  // message is the evidence that the field behind it was actually filled —
  // which is exactly what used to be missing.
  const previewOk = await evaluate(`
    (() => {
      const img = [...document.querySelectorAll('img')]
        .find(i => i.src === ${JSON.stringify(IMG)});
      return {
        loaded: !!img && img.complete && img.naturalWidth > 0,
        confirmed: document.body.innerText.includes('ছবিটি বসানো হয়েছে'),
      };
    })()
  `);
  check("the image actually rendered", previewOk.loaded === true);
  check("the form accepted it", previewOk.confirmed === true);

  // ── fill the rest and save ─────────────────────────────────────────────
  console.log("\nSaving the banner");
  const TITLE = "FreeLynk — বিজ্ঞাপন দিন";

  await evaluate(`
    (() => {
      const set = (el, v) => {
        const proto = Object.getPrototypeOf(el);
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const title = document.querySelector('input[placeholder="ঈদ অফার"]');
      const link  = document.querySelector('input[placeholder="https://example.com"]');
      set(title, ${JSON.stringify(TITLE)});
      if (link) set(link, "mailto:falconsecintelligence@gmail.com");
      return true;
    })()
  `);
  await sleep(500);
  await shot("03-filled");

  await evaluate(`
    (() => {
      const form = document.querySelector('form');
      form.requestSubmit();
      return true;
    })()
  `);
  await sleep(6000);
  await shot("04-saved");

  const listed = await evaluate(
    `document.body.innerText.includes(${JSON.stringify(TITLE)})`,
  );
  check("the new banner appears in the list", listed === true);

  console.log(`\n  title used: ${TITLE}`);
} finally {
  try { ws?.close(); } catch { /* already gone */ }
  chrome.kill();
  await sleep(1200);
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch { /* locked */ }
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} failed.\n`);
process.exit(failures === 0 ? 0 : 1);
