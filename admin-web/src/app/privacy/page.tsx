import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "গোপনীয়তা নীতি — FreeLynk",
  description:
    "FreeLynk কী তথ্য নেয় এবং কী নেয় না। কোনো নাম, নম্বর বা অবস্থান সংগ্রহ করা হয় না।",
};

/**
 * The privacy policy, in Bengali for users and English for Play reviewers.
 *
 * Written from what the code actually does rather than from a template.
 * Every claim below was checked against the source: the ping sends a random
 * id, the platform and the version; a tap sends only which advert was
 * tapped; location is requested but never read or transmitted.
 *
 * Two disclosures here are easy to leave out and dishonest to omit —
 * advert images are fetched straight from whoever hosts them, so that host
 * sees the reader's IP address, and the hosting providers keep ordinary
 * server logs. Both are true of almost every app; neither is usually
 * admitted.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="text-3xl font-bold tracking-tight">গোপনীয়তা নীতি</h1>
      <p className="mt-2 text-sm text-sky-200/50">
        FreeLynk · সর্বশেষ হালনাগাদ: ৩০ আগস্ট ২০২৬
      </p>

      <Section title="সংক্ষেপে">
        <p>
          FreeLynk-এ কোনো অ্যাকাউন্ট নেই, লগইন নেই। আপনার নাম, ফোন নম্বর,
          ইমেইল বা অবস্থান — কোনোটাই আমরা নিই না, রাখি না, কাউকে দিই না।
          অ্যাপটি শুধু গোনে যে কতগুলো ফোনে এটি চলছে, তাও একটি এলোমেলো
          নম্বরের মাধ্যমে যা অ্যাপ নিজেই তৈরি করে।
        </p>
      </Section>

      <Section title="যা সংগ্রহ করা হয়">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <b>একটি এলোমেলো ডিভাইস নম্বর।</b> অ্যাপ প্রথমবার চালু হলে নিজে
            একটি এলোমেলো সংখ্যা তৈরি করে ফোনেই রাখে। দিনে সর্বোচ্চ একবার এটি
            সার্ভারে যায়, শুধু গোনার জন্য — কতজন অ্যাপটি ব্যবহার করছে।
            এটি আপনার ফোন, সিম বা Google অ্যাকাউন্টের সাথে কোনোভাবে যুক্ত নয়।
            অ্যাপ মুছে দিলে নম্বরটিও চলে যায়।
          </li>
          <li>
            <b>ফোনের ধরন ও অ্যাপের সংস্করণ</b> — যেমন &ldquo;android&rdquo;,
            &ldquo;2.0.0&rdquo;। কোন সংস্করণে সমস্যা হচ্ছে বোঝার জন্য।
          </li>
          <li>
            <b>বিজ্ঞাপনে ট্যাপের সংখ্যা।</b> কোনো দোকানের নম্বরে বা ব্যানারে
            ট্যাপ করলে সেই বিজ্ঞাপনের হিসাব এক বাড়ে। <b>কে ট্যাপ করল তা
            পাঠানো হয় না</b> — শুধু কোন বিজ্ঞাপনে হয়েছে।
          </li>
        </ul>
      </Section>

      <Section title="যা সংগ্রহ করা হয় না">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <b>আপনার অবস্থান।</b> অ্যান্ড্রয়েড ১২ ও তার আগের সংস্করণে
            আশেপাশের ওয়াইফাই খুঁজতে গেলে ফোনের নিয়ম অনুযায়ী লোকেশন অনুমতি
            লাগে। অ্যাপটি সেই অনুমতি <i>শুধু ওয়াইফাই খোঁজার জন্যই</i> ব্যবহার
            করে। আপনার অবস্থান কোথাও পাঠানো হয় না, কোথাও জমা হয় না।
          </li>
          <li>নাম, ফোন নম্বর, ইমেইল বা যোগাযোগের তালিকা।</li>
          <li>Google-এর বিজ্ঞাপন আইডি (Advertising ID)।</li>
          <li>আপনি কোন ওয়াইফাইয়ে যুক্ত হলেন — এই তথ্য সার্ভারে যায় না।</li>
          <li>কোনো তৃতীয় পক্ষের বিজ্ঞাপন বা ট্র্যাকিং SDK অ্যাপে নেই।</li>
        </ul>
      </Section>

      <Section title="ওয়াইফাই পাসওয়ার্ড কোথায় থাকে">
        <p>
          তালিকাটি সার্ভার থেকে <b>এনক্রিপ্ট করা অবস্থায়</b> আসে এবং সেভাবেই
          ফোনে জমা থাকে — সাধারণ লেখায় কখনো নয়। এর ফলে ইন্টারনেট ছাড়াও
          অ্যাপটি কাজ করে। ফোন হারালে বা অন্য অ্যাপ ফাইলটি পড়লেও পাসওয়ার্ড
          পড়া যাবে না।
        </p>
        <p className="mt-3">
          তালিকায় থাকা প্রতিটি নেটওয়ার্ক মালিকের অনুমতি নিয়ে যুক্ত করা হয়।
          আপনার নেটওয়ার্ক সরাতে চাইলে নিচের ঠিকানায় জানালে সরিয়ে দেওয়া হবে।
        </p>
      </Section>

      <Section title="যা আমাদের নিয়ন্ত্রণের বাইরে">
        <p>
          সৎ থাকার জন্য দুটি কথা বলা দরকার, যদিও এগুলো প্রায় সব অ্যাপেই ঘটে:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            <b>বিজ্ঞাপনের ছবি।</b> ব্যানার ও দোকানের ছবি যেখানে রাখা আছে
            সেখান থেকেই সরাসরি আপনার ফোনে আসে। ফলে সেই হোস্ট আপনার ফোনের
            IP ঠিকানা দেখতে পায়। আমরা ছবিগুলো নিজেরা জমা রাখি না।
          </li>
          <li>
            <b>সার্ভারের সাধারণ লগ।</b> আমাদের হোস্টিং (Vercel) ও ডেটাবেস
            (Supabase) স্বাভাবিক নিয়মে অনুরোধের লগ রাখে, যাতে IP ঠিকানা
            থাকতে পারে। আমরা সেই লগ ব্যবহার করে কাউকে চিহ্নিত করি না।
          </li>
        </ul>
      </Section>

      <Section title="তথ্য কতদিন থাকে">
        <p>
          দৈনিক ব্যবহারের হিসাব ৩০ দিনের জন্য দেখানো হয়। এক বছর ধরে যে
          ডিভাইসে অ্যাপ চালু হয়নি, তার নম্বরটি মুছে ফেলা হয়। অ্যাপটি আনইনস্টল
          করলে ফোনে থাকা সবকিছু — এলোমেলো নম্বর ও এনক্রিপ্ট করা তালিকা —
          সাথে সাথেই মুছে যায়।
        </p>
      </Section>

      <Section title="শিশুদের ব্যবহার">
        <p>
          অ্যাপটি বিশেষভাবে শিশুদের জন্য নয় এবং কারো বয়স জানার চেষ্টা করে না,
          কারণ কোনো ব্যক্তিগত তথ্যই সংগ্রহ করা হয় না।
        </p>
      </Section>

      <Section title="যোগাযোগ">
        <p>
          প্রশ্ন, অভিযোগ, অথবা কোনো তথ্য মুছে ফেলার অনুরোধ —{" "}
          <a
            href="mailto:falconsecintelligence@gmail.com"
            className="font-semibold text-emerald-300 underline decoration-emerald-300/40 underline-offset-4"
          >
            falconsecintelligence@gmail.com
          </a>
        </p>
      </Section>

      {/* Play reviewers do not read Bengali. The same policy, briefly. */}
      <hr className="my-12 border-sky-300/15" />

      <Section title="English summary">
        <p>
          FreeLynk has no accounts and no login. It collects no name, phone
          number, email, contacts, advertising ID, or location.
        </p>
        <p className="mt-3">
          It sends three things: a random identifier the app generates for
          itself on first launch, the platform, and the app version —
          transmitted at most once per calendar day, solely to count how many
          devices use the app. Tapping an advert increments a counter for
          that advert; no device identifier is attached to it.
        </p>
        <p className="mt-3">
          Location permission is requested because Android 12 and below
          require it before returning WiFi scan results. Location is never
          read, stored, or transmitted; the permission is used only to let the
          radio report nearby networks.
        </p>
        <p className="mt-3">
          WiFi credentials are delivered encrypted and stored encrypted on the
          device, never in plaintext. Networks are listed with the owner&apos;s
          permission; removal requests go to the address above.
        </p>
        <p className="mt-3">
          Advert images load directly from whoever hosts them, so that host
          can see the device&apos;s IP address. Our hosting and database
          providers keep ordinary request logs which may contain IP addresses;
          these are not used to identify anyone.
        </p>
        <p className="mt-3">
          Uninstalling removes everything held on the device. Device records
          inactive for a year are deleted.
        </p>
      </Section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-sky-100">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-sky-200/75">
        {children}
      </div>
    </section>
  );
}
