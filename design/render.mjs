/**
 * Renders an HTML file to a PNG at an exact size, using the Chrome that is
 * already on this machine.
 *
 *   node design/render.mjs design/logo.html out.png 1024 1024
 *
 * Chrome rather than an image library because the artwork carries Bengali,
 * and Pillow on this machine has no raqm — it would place the glyphs
 * without shaping them, so conjuncts and vowel signs would come out
 * mangled. A browser does the shaping properly.
 *
 * Nothing is installed: it drives Chrome over the DevTools Protocol with
 * Node's built-in WebSocket, and keeps its profile off the system drive.
 */
import { spawn } from "node:child_process";
import { writeFileSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [htmlPath, outPath, wArg, hArg] = process.argv.slice(2);
if (!htmlPath || !outPath) {
  console.error("usage: node design/render.mjs <html> <out.png> [w] [h]");
  process.exit(1);
}

const WIDTH = Number(wArg ?? 1024);
const HEIGHT = Number(hArg ?? 1024);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PROFILE = "D:/freelynk-app/.chrome-render";
const PORT = 9333;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  `--window-size=${WIDTH},${HEIGHT}`,
  "about:blank",
], { stdio: "ignore" });

let ws;
const pending = new Map();
let nextId = 1;

const send = (method, params = {}) => {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    setTimeout(() => {
      if (pending.delete(id)) rej(new Error(`${method} timed out`));
    }, 30_000);
  });
};

try {
  let wsUrl = null;
  for (let i = 0; i < 40 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? null;
    } catch { /* not up yet */ }
    if (!wsUrl) await sleep(400);
  }
  if (!wsUrl) throw new Error("Chrome did not open a debugging port");

  ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
  };

  await send("Page.enable");

  // Pin the viewport so the output is the size asked for regardless of what
  // the window manager felt like doing.
  await send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await send("Page.navigate", { url: pathToFileURL(resolve(htmlPath)).href });
  await sleep(2500); // fonts and layout

  const { data } = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(outPath, Buffer.from(data, "base64"));
  console.log(`wrote ${outPath} (${WIDTH}x${HEIGHT})`);
} finally {
  try { ws?.close(); } catch { /* gone */ }
  chrome.kill();
  await sleep(900);
  if (existsSync(PROFILE)) {
    try { rmSync(PROFILE, { recursive: true, force: true }); } catch { /* locked */ }
  }
}
