# Play Console — যা যা ভরতে হবে

এই ফাইলটা কোড দেখে লেখা, অনুমান করে নয়। প্রতিটা উত্তরের পাশে কোন ফাইলে
প্রমাণ আছে সেটাও দেওয়া — রিভিউয়ার প্রশ্ন করলে দেখাতে পারবেন।

Play Console-এ ভুল ঘোষণা দিলে অ্যাপ পরে সরিয়ে দেওয়া হয়, তাই এখানে যা
লেখা আছে তার বাইরে কিছু "নিরাপদ" ভেবে যোগ করবেন না — কম বলাও যেমন
সমস্যা, বেশি বলাও তেমন।

---

## ১. Data safety ফর্ম

### প্রথম প্রশ্নগুলো

| প্রশ্ন | উত্তর | কেন |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Yes** | ডিভাইস আইডি পাঠানো হয় |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | সব কল HTTPS |
| Do you provide a way for users to request that their data is deleted? | **Yes** | পলিসিতে ইমেইল ঠিকানা দেওয়া আছে |

### কোন কোন ডেটা টাইপ বাছবেন

**শুধু একটাই।** `Device or other IDs → Device or other IDs`

| উপ-প্রশ্ন | উত্তর |
|---|---|
| Collected or shared? | **Collected** (Shared নয় — কাউকে দেওয়া হয় না) |
| Processed ephemerally? | **No** — গোনার জন্য জমা থাকে |
| Required or optional? | **Required** |
| Purpose | **Analytics** — শুধু এটাই টিক দিন |

সঙ্গে "App activity → Other actions" যোগ করার দরকার নেই: বিজ্ঞাপনে ট্যাপ
পড়লে শুধু ওই বিজ্ঞাপনের সংখ্যা বাড়ে, কোন ডিভাইস ট্যাপ করল তা পাঠানোই
হয় না। প্রমাণ: `mobile/lib/data/usage_reporter.dart` → `recordClick()`
শুধু `{kind, id}` পাঠায়, আর `admin-web/src/app/api/track/route.ts` কোনো
ডিভাইস আইডি নেয়ই না।

### যেগুলো টিক দেবেন **না**

| | কেন নয় |
|---|---|
| Location | অনুমতি চাওয়া হয়, কিন্তু অবস্থান কখনো পড়া বা পাঠানো হয় না |
| Personal info | নাম, ইমেইল, ফোন নম্বর — কিছুই নেওয়া হয় না |
| Financial info | নেই |
| Contacts / Photos / Files | নেই |
| App activity | ট্যাপের হিসাবে ব্যক্তি চিহ্নিত হয় না |
| Advertising ID | অ্যাপে কোনো বিজ্ঞাপন SDK নেই |

---

## ২. লোকেশন অনুমতির ঘোষণা

Console জিজ্ঞেস করবে `ACCESS_FINE_LOCATION` কেন লাগে। উত্তরে এটা দিন:

> FreeLynk helps people find and join free WiFi networks that businesses
> have agreed to share. On Android 12 and below, the operating system will
> not return WiFi scan results unless the app holds location permission and
> the location service is switched on — this is an OS restriction, not a
> product choice. The permission is used solely to let the radio report
> nearby networks so they can be matched against the shared list.
>
> The app never reads, stores, or transmits the device's location. On
> Android 13 and above it declares NEARBY_WIFI_DEVICES with
> `usesPermissionFlags="neverForLocation"` and does not require the location
> grant at all.

প্রমাণ: `mobile/android/app/src/main/AndroidManifest.xml`-এ
`neverForLocation` ফ্ল্যাগ, আর `wifi_connector.dart` → `ensureReady()`
লোকেশন শুধু স্ক্যানের শর্ত হিসেবেই দেখে।

**অ্যাপের ভেতরে prominent disclosure** ইতিমধ্যেই আছে — প্রথমবার চালুর
সম্মতির স্ক্রিনে "লোকেশন অনুমতি কেন চাইবে" অংশে।

---

## ৩. Foreground service ঘোষণা

Android 14 থেকে প্রতিটা foreground service-এর ধরন আর যুক্তি দিতে হয়।

- **Type:** `connectedDevice` (ম্যানিফেস্টে ঘোষিত)
- **যুক্তি:**

> The service runs only while the app is holding a WiFi connection it
> established for the user. The network binding and the network suggestion
> both belong to the process, so if Android reclaims it the user is silently
> dropped from the network they just joined. The notification is also the
> off switch: it carries a stop action, and the service ends when the user
> presses it, presses Disconnect in the app, or uninstalls.

ভিডিও চাইলে: অ্যাপ খুলে কানেক্ট করে দেখান, নোটিফিকেশনে "বন্ধ করুন"
বোতামটা দেখান, চেপে দেখান সংযোগ শেষ হচ্ছে।

---

## ৪. অন্যান্য

| ঘর | কী দেবেন |
|---|---|
| Privacy policy URL | `https://freelynk.vercel.app/privacy` |
| Target audience | 18+ (শিশুদের জন্য নয়) |
| Ads | **Yes** — নিজেদের বিক্রি করা ব্যানার ও দোকানের তালিকা আছে |
| Content rating | প্রশ্নাবলিতে সব "না" — সহিংসতা, যৌনতা, জুয়া কিছুই নেই |
| App category | Tools |

---

## ৫. রিভিউয়ার এই প্রশ্নটা করতে পারে

> "এই ওয়াইফাই পাসওয়ার্ডগুলো কোথা থেকে এল?"

এটাই এই অ্যাপ বাতিল হওয়ার সবচেয়ে সম্ভাব্য কারণ। Play-র *Device and
Network Abuse* নীতি অননুমোদিত নেটওয়ার্ক অ্যাক্সেস নিষিদ্ধ করে। উত্তর
প্রস্তুত রাখুন:

> Every network in the list is added only after the owner — a shop, café,
> or business offering WiFi to customers — has agreed in writing to share
> it. Networks are curated by the operator, not crowd-sourced from users,
> and the app has no feature that captures or guesses a password. Owners
> can have their network removed at any time by writing to the address in
> the privacy policy.

কাগজে করা চুক্তিগুলো গুছিয়ে রাখুন — Google আপিলের সময় প্রমাণ চাইতে পারে।

---

## ৬. ছাড়ার আগে শেষ চেক

- [ ] `key.properties` জায়গামতো আছে (নইলে debug key-তে সাইন হয়ে যাবে)
- [ ] `flutter build appbundle --release` — Play `.aab` চায়, `.apk` নয়
- [ ] `.aab`-এ `--dart-define` তিনটেই দেওয়া হয়েছে
- [ ] কীস্টোর দুই জায়গায় ব্যাকআপ করা (হারালে অ্যাপ চিরতরে হারাবে)
- [ ] Supabase `service_role` key রোটেট করা
