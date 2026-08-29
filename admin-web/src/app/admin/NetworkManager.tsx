"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { WifiNetwork } from "@/lib/db";

type Draft = {
  name: string;
  ssid: string;
  password: string;
  security: "WPA" | "WEP" | "OPEN";
  area: string;
  note: string;
  priority: number;
  is_active: boolean;
};

const EMPTY: Draft = {
  name: "",
  ssid: "",
  password: "",
  security: "WPA",
  area: "",
  note: "",
  priority: 0,
  is_active: true,
};

export default function NetworkManager({
  admin,
  initial,
  loadError,
}: {
  admin: string;
  initial: WifiNetwork[];
  loadError: string | null;
}) {
  const router = useRouter();

  const [rows, setRows] = useState<WifiNetwork[]>(initial);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.ssid, r.area, r.note].some((f) =>
        (f ?? "").toLowerCase().includes(q),
      ),
    );
  }, [rows, query]);

  const activeCount = rows.filter((r) => r.is_active).length;

  function notify(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2600);
  }

  async function refresh() {
    const res = await fetch("/api/networks");
    if (res.ok) {
      const json = await res.json();
      setRows(json.networks as WifiNetwork[]);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const url = editingId ? `/api/networks/${editingId}` : "/api/networks";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "সেভ করা যায়নি।");

      await refresh();
      notify(editingId ? "আপডেট হয়েছে।" : "নতুন নেটওয়ার্ক যোগ হয়েছে।");
      setDraft(EMPTY);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "সেভ করা যায়নি।");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: WifiNetwork) {
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)),
    );
    const res = await fetch(`/api/networks/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !row.is_active }),
    });
    if (!res.ok) await refresh();
  }

  async function remove(row: WifiNetwork) {
    if (!confirm(`"${row.name}" (${row.ssid}) মুছে ফেলবেন?`)) return;
    const res = await fetch(`/api/networks/${row.id}`, { method: "DELETE" });
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      notify("মুছে ফেলা হয়েছে।");
    } else {
      setError("মুছতে ব্যর্থ।");
    }
  }

  function startEdit(row: WifiNetwork) {
    setEditingId(row.id);
    setDraft({
      name: row.name,
      ssid: row.ssid,
      password: row.password,
      security: row.security,
      area: row.area,
      note: row.note,
      priority: row.priority,
      is_active: row.is_active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleReveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      {/* Header */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">FreeLynk Admin</h1>
          <p className="mt-1 text-sm text-sky-200/50">
            {rows.length} টি নেটওয়ার্ক · {activeCount} টি সক্রিয় · সাইন-ইন:{" "}
            <span className="text-sky-200/80">{admin}</span>
          </p>
        </div>
        <button onClick={logout} className="btn-ghost">
          লগআউট
        </button>
      </header>

      {loadError && (
        <p className="mb-6 rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          ডেটাবেস সংযোগ সমস্যা: {loadError}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* ---------------- Form ---------------- */}
        <form onSubmit={save} className="glass h-fit rounded-2xl p-6">
          <h2 className="mb-5 text-lg font-semibold">
            {editingId ? "নেটওয়ার্ক এডিট" : "নতুন WiFi যোগ করুন"}
          </h2>

          <div className="space-y-4">
            <div>
              <label className="label">নাম</label>
              <input
                className="field"
                placeholder="যেমন: রহিম ভাইয়ের চায়ের দোকান"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>

            <div>
              <label className="label">SSID (WiFi নাম) *</label>
              <input
                className="field font-mono"
                placeholder="Cafe_5G"
                value={draft.ssid}
                onChange={(e) => setDraft({ ...draft, ssid: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="label">পাসওয়ার্ড</label>
              <input
                className="field font-mono"
                placeholder={draft.security === "OPEN" ? "প্রয়োজন নেই" : "কমপক্ষে ৮ অক্ষর"}
                value={draft.password}
                disabled={draft.security === "OPEN"}
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">সিকিউরিটি</label>
                <select
                  className="field"
                  value={draft.security}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      security: e.target.value as Draft["security"],
                      password: e.target.value === "OPEN" ? "" : draft.password,
                    })
                  }
                >
                  <option value="WPA">WPA / WPA2</option>
                  <option value="WEP">WEP</option>
                  <option value="OPEN">Open</option>
                </select>
              </div>
              <div>
                <label className="label">প্রায়োরিটি</label>
                <input
                  type="number"
                  className="field"
                  value={draft.priority}
                  onChange={(e) =>
                    setDraft({ ...draft, priority: Number(e.target.value) || 0 })
                  }
                />
              </div>
            </div>

            <div>
              <label className="label">এলাকা</label>
              <input
                className="field"
                placeholder="মিরপুর ১০"
                value={draft.area}
                onChange={(e) => setDraft({ ...draft, area: e.target.value })}
              />
            </div>

            <div>
              <label className="label">নোট</label>
              <input
                className="field"
                placeholder="২য় তলা, দুপুরে সিগন্যাল দুর্বল"
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-sky-100/80">
              <input
                type="checkbox"
                className="h-4 w-4 accent-sky-400"
                checked={draft.is_active}
                onChange={(e) =>
                  setDraft({ ...draft, is_active: e.target.checked })
                }
              />
              অ্যাপে দেখানো হবে
            </label>
          </div>

          {error && (
            <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          )}

          <div className="mt-6 flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary flex-1">
              {busy ? "সেভ হচ্ছে…" : editingId ? "আপডেট করুন" : "যোগ করুন"}
            </button>
            {editingId && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setEditingId(null);
                  setDraft(EMPTY);
                  setError(null);
                }}
              >
                বাতিল
              </button>
            )}
          </div>
        </form>

        {/* ---------------- List ---------------- */}
        <section>
          <input
            className="field mb-4"
            placeholder="নাম, SSID বা এলাকা দিয়ে খুঁজুন…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {filtered.length === 0 ? (
            <div className="glass rounded-2xl px-6 py-16 text-center text-sky-200/45">
              {rows.length === 0
                ? "এখনো কোনো নেটওয়ার্ক যোগ করা হয়নি। বাঁ পাশের ফর্ম থেকে শুরু করুন।"
                : "এই খোঁজে কিছু মেলেনি।"}
            </div>
          ) : (
            <ul className="space-y-3">
              {filtered.map((row) => (
                <li
                  key={row.id}
                  className={`glass rounded-2xl p-5 transition ${
                    row.is_active ? "" : "opacity-55"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold">{row.name}</h3>
                        <span className="rounded-md border border-sky-300/20 bg-sky-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-200/80">
                          {row.security}
                        </span>
                        {row.priority !== 0 && (
                          <span className="rounded-md border border-amber-300/20 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200/85">
                            P{row.priority}
                          </span>
                        )}
                        {!row.is_active && (
                          <span className="rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-white/55">
                            লুকানো
                          </span>
                        )}
                      </div>

                      <p className="mt-1.5 font-mono text-sm text-sky-300/90">
                        {row.ssid}
                      </p>

                      {row.security !== "OPEN" && (
                        <p className="mt-1 flex items-center gap-2 font-mono text-xs text-sky-100/55">
                          {revealed.has(row.id)
                            ? row.password
                            : "•".repeat(Math.min(row.password.length, 14))}
                          <button
                            type="button"
                            onClick={() => toggleReveal(row.id)}
                            className="text-sky-400/70 underline-offset-2 hover:text-sky-300 hover:underline"
                          >
                            {revealed.has(row.id) ? "লুকান" : "দেখুন"}
                          </button>
                        </p>
                      )}

                      {(row.area || row.note) && (
                        <p className="mt-2 text-xs text-sky-200/45">
                          {[row.area, row.note].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={() => toggleActive(row)}
                        title={row.is_active ? "অ্যাপ থেকে লুকান" : "অ্যাপে দেখান"}
                        className="btn-ghost !px-2.5 !py-1.5 !text-xs"
                      >
                        {row.is_active ? "লুকান" : "দেখান"}
                      </button>
                      <button
                        onClick={() => startEdit(row)}
                        className="btn-ghost !px-2.5 !py-1.5 !text-xs"
                      >
                        এডিট
                      </button>
                      <button
                        onClick={() => remove(row)}
                        className="btn-ghost !border-rose-400/25 !px-2.5 !py-1.5 !text-xs !text-rose-200 hover:!bg-rose-500/10"
                      >
                        মুছুন
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {flash && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-emerald-300/25 bg-emerald-500/15 px-5 py-2.5 text-sm text-emerald-100 shadow-lg backdrop-blur">
          {flash}
        </div>
      )}
    </main>
  );
}
