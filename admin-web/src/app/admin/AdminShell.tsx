"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Banner, Shop, WifiNetwork } from "@/lib/db";
import NetworkManager from "./NetworkManager";
import BannerManager from "./BannerManager";
import ShopManager from "./ShopManager";

type Tab = "networks" | "banners" | "shops";

const TABS: { key: Tab; label: string }[] = [
  { key: "networks", label: "WiFi নেটওয়ার্ক" },
  { key: "banners", label: "ব্যানার" },
  { key: "shops", label: "পার্টনার দোকান" },
];

export default function AdminShell({
  admin,
  networks,
  banners,
  shops,
  loadError,
}: {
  admin: string;
  networks: WifiNetwork[];
  banners: Banner[];
  shops: Shop[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("networks");
  const [flash, setFlash] = useState<string | null>(null);

  function notify(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2600);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">FreeLynk Admin</h1>
          <p className="mt-1 text-sm text-sky-200/50">
            সাইন-ইন: <span className="text-sky-200/80">{admin}</span>
          </p>
        </div>
        <button onClick={logout} className="btn-ghost">
          লগআউট
        </button>
      </header>

      <nav className="mb-6 flex flex-wrap gap-1.5 rounded-2xl border border-sky-300/15 bg-sky-400/5 p-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              tab === t.key
                ? "bg-sky-400/20 text-sky-100 shadow-sm"
                : "text-sky-200/55 hover:bg-white/5 hover:text-sky-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loadError && (
        <p className="mb-6 rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          ডেটাবেস সংযোগ সমস্যা: {loadError}
        </p>
      )}

      {tab === "networks" && (
        <NetworkManager initial={networks} onFlash={notify} />
      )}
      {tab === "banners" && (
        <BannerManager initial={banners} onFlash={notify} />
      )}
      {tab === "shops" && <ShopManager initial={shops} onFlash={notify} />}

      {flash && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-emerald-300/25 bg-emerald-500/15 px-5 py-2.5 text-sm text-emerald-100 shadow-lg backdrop-blur">
          {flash}
        </div>
      )}
    </main>
  );
}
