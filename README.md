# FreeLynk

Offline-first WiFi access app. **No login, no payments, no subscriptions.**

You add WiFi networks from a web admin panel. The phone app downloads them
as an encrypted blob, keeps that blob on disk, and connects — online or not.

```
┌──────────────┐    service_role     ┌──────────────┐
│  admin-web   │◄───────────────────►│   Supabase   │
│  (Vercel)    │                     │  networks    │
└──────┬───────┘                     └──────────────┘
       │
       │  GET /api/sync
       │  X-Client-Key: ...
       │  → AES-256-GCM encrypted blob
       ▼
┌──────────────┐
│    mobile    │  blob stored encrypted on disk
│  (Flutter)   │  decrypted in memory only
└──────────────┘
```

---

## What changed from the old app

| Old | New |
|---|---|
| Google login required | No login at all |
| ৳50/month PRO + bKash + admin approval | Free, no payment code anywhere |
| `shops` table readable with the anon key | RLS on, **zero** policies — only `service_role` can read |
| Passwords fetched in plaintext by the client | AES-256-GCM encrypted payload |
| Session metering, foreground service, `coin_orders` | All removed |
| `.env` bundled into the APK as an asset | No `.env` asset; build-time `--dart-define` |

---

## 1. Database

Supabase → SQL Editor → paste and run [`admin-web/schema.sql`](admin-web/schema.sql).

It creates the `networks` table, a unique index on lowercase SSID, an
`updated_at` trigger, and turns on RLS **with no policies** — which means
anon/authenticated can read nothing. Only the `service_role` key (living in
Vercel env vars) gets through.

## 2. Admin panel → Vercel

```bash
cd admin-web
npm install
cp .env.example .env.local     # fill it in
npm run dev                    # http://localhost:3000
```

Generate the three secrets:

```bash
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # SYNC_SECRET
openssl rand -hex 32   # SYNC_CLIENT_KEY
```

Deploy:

```bash
npx vercel --prod
```

Then add every variable from `.env.example` in
**Vercel → Project → Settings → Environment Variables**.

> `SUPABASE_SERVICE_ROLE_KEY` must **never** get a `NEXT_PUBLIC_` prefix.
> It bypasses RLS entirely.

## 2b. Verify the whole chain before touching a phone

With `admin-web/.env.local` filled in:

```bash
cd admin-web
npm run dev          # leave running in one terminal

# in another terminal
node scripts/e2e.mjs          # 18 checks: auth, CRUD, encryption, ETag
node scripts/make-fixture.mjs # capture a real /api/sync response

cd ../mobile
flutter test                  # Dart decrypts the bytes Node produced
```

`e2e.mjs` creates a throwaway network and deletes it again, so it is safe to
run against the live project.

The Dart test matters more than it looks: the Node and Dart AES-GCM
implementations have to agree on nonce placement, tag position and key
derivation. Verifying the Dart side against a second *Node* reimplementation
would prove nothing — so the fixture holds bytes the real server produced.
The fixture embeds the live `SYNC_SECRET` and is git-ignored; without it the
test skips instead of failing.

## 3. Mobile app

### Signing key (do this once, before you hand the APK to anyone)

```bash
keytool -genkey -v -keystore freelynk.jks -keyalg RSA \
        -keysize 2048 -validity 10000 -alias freelynk
```

Create `mobile/android/key.properties` — it is git-ignored:

```properties
storeFile=C:/keys/freelynk.jks
storePassword=...
keyAlias=freelynk
keyPassword=...
```

Without this file the build still succeeds but signs with the **debug** key and
prints a warning. A debug-signed APK can never be upgraded by a properly signed
one later — users would have to uninstall and lose their cache.

> Back the `.jks` up. Lose it and you can't ship updates to existing installs.

### Build

`SYNC_SECRET` and `SYNC_CLIENT_KEY` must match Vercel exactly.

```bash
cd mobile
flutter pub get

flutter build apk --release --split-per-abi \
  --dart-define=SYNC_BASE_URL=https://your-app.vercel.app \
  --dart-define=SYNC_CLIENT_KEY=<same as Vercel> \
  --dart-define=SYNC_SECRET=<same as Vercel>
```

Output: `build/app/outputs/flutter-apk/`

- `app-arm64-v8a-release.apk` — every phone from roughly 2016 on. **Ship this one.**
- `app-armeabi-v7a-release.apk` — old 32-bit devices
- `app-x86_64-release.apk` — emulators

Drop `--split-per-abi` to get one universal APK instead (bigger, works everywhere).

If the secrets don't match, the app shows a red "কনফিগার করা হয়নি" banner or
fails to decrypt — it never silently shows stale or garbage data.

---

## How the app behaves

**On open** — loads the cached encrypted blob, decrypts to memory, shows the
list instantly, then refreshes from the server in the background. No spinner
wall, no network required.

**Auto Connect** — scans, keeps only saved networks that are in range, sorts by
`priority` then signal, and tries them one by one until one actually reaches
the internet. Joining a network that has no internet is not treated as success.

**Manual Connect** — tap any in-range network in the list.

**Offline** — everything above works except the refresh. The blob on disk is
all the app needs.

---

## Security, stated honestly

What this design *does* fix: the old app let anyone with the anon key run
`select password from shops`. That is gone — the phone never talks to Supabase,
and RLS blocks the anon role outright.

What it *cannot* fix: an app with no login has no per-user secret, so
`SYNC_SECRET` and `SYNC_CLIENT_KEY` necessarily ship inside the APK. Someone
who decompiles it can pull them and call `/api/sync` themselves. This stops
casual scraping and network sniffing; it does not stop a determined attacker.

If you ever need to cut old builds off: rotate both values in Vercel, rebuild,
and redistribute. Old APKs immediately start getting 403.

---

## Layout

```
freelynk/
├── admin-web/                  Next.js 15 · deploy to Vercel
│   ├── schema.sql              run once in Supabase
│   └── src/
│       ├── lib/
│       │   ├── crypto.ts       AES-256-GCM encrypt  ◄─┐ these two
│       │   ├── auth.ts         JWT cookie session     │ must stay
│       │   └── db.ts           service_role client    │ in sync
│       └── app/
│           ├── login/          admin sign-in          │
│           ├── admin/          CRUD dashboard         │
│           └── api/                                   │
│               ├── networks/   admin CRUD             │
│               └── sync/       public, encrypted      │
└── mobile/                     Flutter · Android      │
    ├── lib/                                           │
    │   ├── core/                                      │
    │   │   ├── app_config.dart     dart-define config │
    │   │   ├── payload_cipher.dart AES-256-GCM decrypt ◄┘
    │   │   └── theme.dart
    │   ├── data/
    │   │   ├── wifi_network.dart
    │   │   └── network_repository.dart   offline-first cache
    │   ├── services/wifi_connector.dart  scan / join / bind
    │   ├── state/app_state.dart          Riverpod controllers
    │   └── ui/                           screens + widgets
    └── test/payload_cipher_test.dart     Node↔Dart interop test
```

The interop test decrypts a fixture generated by the actual Node code. Run it
after touching either crypto file:

```bash
cd mobile && flutter test
```
