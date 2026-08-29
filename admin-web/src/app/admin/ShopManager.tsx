"use client";

import { useMemo, useState } from "react";
import type { Shop } from "@/lib/db";
import ImagePicker from "./ImagePicker";

type Draft = {
  name: string;
  image_url: string;
  sells: string;
  address: string;
  phone: string;
  sort_order: number;
  is_active: boolean;
};

const EMPTY: Draft = {
  name: "",
  image_url: "",
  sells: "",
  address: "",
  phone: "",
  sort_order: 0,
  is_active: true,
};

export default function ShopManager({
  initial,
  onFlash,
}: {
  initial: Shop[];
  onFlash: (msg: string) => void;
}) {
  const [rows, setRows] = useState<Shop[]>(initial);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.sells, r.address, r.phone].some((f) =>
        (f ?? "").toLowerCase().includes(q),
      ),
    );
  }, [rows, query]);

  const activeCount = rows.filter((r) => r.is_active).length;

  async function refresh() {
    const res = await fetch("/api/shops");
    if (res.ok) setRows((await res.json()).shops as Shop[]);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        editingId ? `/api/shops/${editingId}` : "/api/shops",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "সেভ করা যায়নি।");

      await refresh();
      onFlash(editingId ? "দোকান আপডেট হয়েছে।" : "দোকান যোগ হয়েছে।");
      setDraft(EMPTY);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "সেভ করা যায়নি।");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: Shop) {
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)),
    );
    const res = await fetch(`/api/shops/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !row.is_active }),
    });
    if (!res.ok) await refresh();
  }

  async function remove(row: Shop) {
    if (!confirm(`"${row.name}" মুছে ফেলবেন? ছবিটিও মুছে যাবে।`)) return;
    const res = await fetch(`/api/shops/${row.id}`, { method: "DELETE" });
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      onFlash("দোকান মুছে ফেলা হয়েছে।");
    } else {
      setError("মুছতে ব্যর্থ।");
    }
  }

  function startEdit(row: Shop) {
    setEditingId(row.id);
    setDraft({
      name: row.name,
      image_url: row.image_url,
      sells: row.sells,
      address: row.address,
      phone: row.phone,
      sort_order: row.sort_order,
      is_active: row.is_active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <p className="mb-5 text-sm text-sky-200/50">
        {rows.length} টি দোকান · {activeCount} টি সক্রিয়
      </p>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <form onSubmit={save} className="glass h-fit rounded-2xl p-6">
          <h2 className="mb-5 text-lg font-semibold">
            {editingId ? "দোকান এডিট" : "নতুন পার্টনার দোকান"}
          </h2>

          <div className="space-y-4">
            <ImagePicker
              value={draft.image_url}
              onChange={(url) => setDraft({ ...draft, image_url: url })}
              label="দোকানের ছবির লিংক"
              aspect="aspect-[4/3]"
            />

            <div>
              <label className="label">দোকানের নাম *</label>
              <input
                className="field"
                placeholder="রহিম স্টোর"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="label">কী বিক্রি করে</label>
              <input
                className="field"
                placeholder="মুদি, চা-নাস্তা, রিচার্জ"
                value={draft.sells}
                onChange={(e) => setDraft({ ...draft, sells: e.target.value })}
              />
            </div>

            <div>
              <label className="label">ঠিকানা</label>
              <input
                className="field"
                placeholder="মিরপুর ১০, ঢাকা"
                value={draft.address}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              />
            </div>

            <div>
              <label className="label">ফোন নাম্বার</label>
              <input
                className="field font-mono"
                placeholder="01712345678"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
              <p className="mt-1 text-[11px] text-sky-200/35">
                ইউজার এতে ট্যাপ করলে সরাসরি কল দিতে পারবে।
              </p>
            </div>

            <div>
              <label className="label">ক্রম</label>
              <input
                type="number"
                className="field"
                value={draft.sort_order}
                onChange={(e) =>
                  setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })
                }
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

        <section>
          <input
            className="field mb-4"
            placeholder="নাম, পণ্য বা ঠিকানা দিয়ে খুঁজুন…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {filtered.length === 0 ? (
            <div className="glass rounded-2xl px-6 py-16 text-center text-sky-200/45">
              {rows.length === 0
                ? "এখনো কোনো পার্টনার দোকান যোগ করা হয়নি।"
                : "এই খোঁজে কিছু মেলেনি।"}
            </div>
          ) : (
            <ul className="space-y-3">
              {filtered.map((row) => (
                <li
                  key={row.id}
                  className={`glass flex gap-4 rounded-2xl p-4 transition ${
                    row.is_active ? "" : "opacity-55"
                  }`}
                >
                  {row.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.image_url}
                      alt=""
                      className="h-20 w-20 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl border border-dashed border-sky-300/20 text-[10px] text-sky-200/35">
                      ছবি নেই
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold">{row.name}</h3>
                      {!row.is_active && (
                        <span className="rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-white/55">
                          লুকানো
                        </span>
                      )}
                    </div>

                    {row.sells && (
                      <p className="mt-1 truncate text-sm text-sky-200/70">
                        {row.sells}
                      </p>
                    )}
                    <p className="mt-1 truncate text-xs text-sky-200/45">
                      {[row.address, row.phone].filter(Boolean).join(" · ") ||
                        "ঠিকানা/ফোন দেওয়া হয়নি"}
                    </p>

                    <div className="mt-2.5 flex gap-1.5">
                      <button
                        onClick={() => toggleActive(row)}
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
    </>
  );
}
