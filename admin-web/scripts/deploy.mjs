/**
 * One-shot Vercel deploy: links the project, pushes every env var to
 * Production, then deploys.
 *
 *   VERCEL_TOKEN=xxx node scripts/deploy.mjs
 *
 * Values are read from .env.local, so whatever you verified locally is
 * exactly what goes live. Nothing is printed in full — secrets stay masked.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const token = process.env.VERCEL_TOKEN;
if (!token) {
  console.error("VERCEL_TOKEN is not set.");
  process.exit(1);
}

const PROJECT = process.env.PROJECT_NAME ?? "freelynk";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const REQUIRED = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
  "SESSION_SECRET",
  "SYNC_SECRET",
  "SYNC_CLIENT_KEY",
];

const missing = REQUIRED.filter((k) => !env[k]);
if (missing.length) {
  console.error(`.env.local is missing: ${missing.join(", ")}`);
  process.exit(1);
}

const mask = (v) => (v.length <= 8 ? "***" : `${v.slice(0, 4)}…${v.slice(-4)}`);
const vercel = (args, input) =>
  execFileSync("npx", ["--yes", "vercel@latest", ...args, "--token", token], {
    cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    input,
    encoding: "utf8",
    stdio: input === undefined ? ["ignore", "pipe", "inherit"] : ["pipe", "pipe", "inherit"],
    shell: process.platform === "win32",
  });

console.log(`Linking project "${PROJECT}"…`);
vercel(["link", "--yes", "--project", PROJECT]);

console.log("\nPushing environment variables to Production:");
for (const key of REQUIRED) {
  try {
    vercel(["env", "rm", key, "production", "--yes"]);
  } catch {
    // not there yet — fine
  }
  vercel(["env", "add", key, "production"], `${env[key]}\n`);
  console.log(`  ${key} = ${mask(env[key])}`);
}

console.log("\nDeploying to production…");
const out = vercel(["deploy", "--prod", "--yes"]);
const url = out.trim().split(/\s+/).pop();
console.log(`\nLive at: ${url}`);
console.log(`Admin panel: ${url}/login`);
console.log(`\nNow rebuild the APK with:\n  --dart-define=SYNC_BASE_URL=${url}`);
