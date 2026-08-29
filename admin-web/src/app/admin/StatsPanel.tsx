"use client";

import { useEffect, useState } from "react";

type Daily = { day: string; active: number };

type Stats = {
  totalDevices: number;
  newToday: number;
  newThisMonth: number;
  dau: number;
  wau: number;
  mau: number;
  daily: Daily[];
};

const bn = (n: number) => n.toLocaleString("bn-BD");

export default function StatsPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stats");
      const json = await res.json();
      if (!res.ok) {
        setHint(json.hint ?? null);
        throw new Error(json.error ?? "পরিসংখ্যান আনা যায়নি।");
      }
      setStats(json.stats as Stats);
      setHint(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "পরিসংখ্যান আনা যায়নি।");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (busy && !stats) {
    return <p className="text-sm text-sky-200/50">লোড হচ্ছে…</p>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3">
        <p className="text-sm text-amber-200">{error}</p>
        {hint && <p className="mt-1 text-xs text-amber-200/70">{hint}</p>}
        <button onClick={load} className="btn-ghost mt-3 !px-3 !py-1.5 !text-xs">
          আবার চেষ্টা করুন
        </button>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label="মোট ব্যবহারকারী"
          value={stats.totalDevices}
          note="যত ডিভাইসে অ্যাপটি অন্তত একবার চলেছে"
        />
        <Card
          label="আজ সক্রিয়"
          value={stats.dau}
          note={`নতুন যোগ হয়েছে ${bn(stats.newToday)} জন`}
        />
        <Card label="৭ দিনে সক্রিয়" value={stats.wau} />
        <Card
          label="৩০ দিনে সক্রিয়"
          value={stats.mau}
          note={`নতুন যোগ হয়েছে ${bn(stats.newThisMonth)} জন`}
        />
      </div>

      <Chart daily={stats.daily} />

      <div className="rounded-xl border border-sky-300/12 bg-sky-400/5 px-4 py-3">
        <p className="text-xs leading-relaxed text-sky-200/45">
          এই সংখ্যাগুলো সেই ডিভাইসের, যেগুলোতে অ্যাপ <em>খোলা</em> হয়েছে।
          Play Store-এর ডাউনলোড সংখ্যা এর চেয়ে বেশি হবে — কেউ ইনস্টল করে
          একবারও না খুললে এখানে গোনা হয় না, আর ফোন রিসেট করলে সে নতুন
          ডিভাইস হিসেবে ধরা পড়ে। ডাউনলোডের প্রকৃত হিসাব Play Console-এ।
          <br />
          কোনো নাম, নম্বর বা লোকেশন রাখা হয় না — শুধু অ্যাপের নিজের বানানো
          একটা এলোমেলো নম্বর।
        </p>
      </div>

      <button onClick={load} disabled={busy} className="btn-ghost !text-xs">
        {busy ? "আপডেট হচ্ছে…" : "রিফ্রেশ"}
      </button>
    </div>
  );
}

function Card({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-sky-300/15 bg-sky-400/5 px-4 py-4">
      <p className="text-xs text-sky-200/50">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-sky-100">
        {bn(value)}
      </p>
      {note && <p className="mt-1 text-[11px] text-sky-200/35">{note}</p>}
    </div>
  );
}

/**
 * Last 30 days.
 *
 * Days nobody opened the app are absent from the data rather than stored
 * as zero rows, so the gaps are filled here — a missing bar and a zero
 * bar mean the same thing and the axis should stay even.
 */
function Chart({ daily }: { daily: Daily[] }) {
  const byDay = new Map(daily.map((d) => [d.day, d.active]));

  const days: Daily[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ day: key, active: byDay.get(key) ?? 0 });
  }

  const peak = Math.max(1, ...days.map((d) => d.active));

  return (
    <div className="rounded-2xl border border-sky-300/15 bg-sky-400/5 px-4 py-4">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-xs text-sky-200/50">গত ৩০ দিনে প্রতিদিন সক্রিয়</p>
        <p className="text-[11px] text-sky-200/35">সর্বোচ্চ {bn(peak)}</p>
      </div>

      <div className="flex h-28 items-end gap-[3px]">
        {days.map((d) => (
          <div
            key={d.day}
            title={`${d.day} — ${bn(d.active)} জন`}
            className="flex-1 rounded-t bg-sky-400/45 transition hover:bg-sky-300/70"
            style={{
              // A used day never renders as nothing, or it reads as idle.
              height: d.active === 0 ? "2px" : `${(d.active / peak) * 100}%`,
              opacity: d.active === 0 ? 0.25 : 1,
            }}
          />
        ))}
      </div>

      <div className="mt-2 flex justify-between text-[10px] text-sky-200/30">
        <span>৩০ দিন আগে</span>
        <span>আজ</span>
      </div>
    </div>
  );
}
