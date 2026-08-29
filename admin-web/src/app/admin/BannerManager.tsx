"use client";

import { useState } from "react";
import type { Banner } from "@/lib/db";
import ImagePicker from "./ImagePicker";

type Draft = {
  title: string;
  image_url: string;
  link_url: string;
  sort_order: number;
  is_active: boolean;
};

const EMPTY: Draft = {
  title: "",
  image_url: "",
  link_url: "",
  sort_order: 0,
  is_active: true,
};

export default function BannerManager({
  initial,
  onFlash,
}: {
  initial: Banner[];
  onFlash: (msg: string) => void;
}) {
  const [rows, setRows] = useState<Banner[]>(initial);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCount = rows.filter((r) => r.is_active).length;

  async function refresh() {
    const res = await fetch("/api/banners");
    if (res.ok) setRows((await res.json()).banners as Banner[]);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!draft.image_url) throw new Error("ব্যানারের ছবি দিতে হবে।");

      const res = await fetch(
        editingId ? `/api/banners/${editingId}` : "/api/banners",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "সেভ করা যায়নি।");

      await refresh();
      onFlash(editingId ? "ব্যানার আপডেট হয়েছে।" : "ব্যানার যোগ হয়েছে।");
      setDraft(EMPTY);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "সেভ করা যায়নি।");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: Banner) {
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)),
    );
    const res = await fetch(`/api/banners/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !row.is_active }),
    });
    if (!res.ok) await refresh();
  }

  async function remove(row: Banner) {
    if (!confirm("এই ব্যানারটি মুছে ফেলবেন? ছবিটিও মুছে যাবে।")) return;
    const res = await fetch(`/api/banners/${row.id}`, { method: "DELETE" });
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      onFlash("ব্যানার মুছে ফেলা হয়েছে।");
    } else {
      setError("মুছতে ব্যর্থ।");
    }
  }

  function startEdit(row: Banner) {
    setEditingId(row.id);
    setDraft({
      title: row.title,
      image_url: row.image_url,
      link_url: row.link_url,
      sort_order: row.sort_order,
      is_active: row.is_active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <p className="mb-5 text-sm text-sky-200/50">
        {rows.length} টি ব্যানার · {activeCount} টি সক্রিয়
        {activeCount === 0 && rows.length > 0 && (
          <span className="ml-2 text-amber-200/80">
            — সব বন্ধ থাকায় অ্যাপে ব্যানার দেখাচ্ছে না
          </span>
        )}
      </p>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <form onSubmit={save} className="glass h-fit rounded-2xl p-6">
          <h2 className="mb-5 text-lg font-semibold">
            {editingId ? "ব্যানার এডিট" : "নতুন ব্যানার"}
          </h2>

          <div className="space-y-4">
            <ImagePicker
              value={draft.image_url}
              onChange={(url) => setDraft({ ...draft, image_url: url })}
              label="ব্যানার ছবির লিংক *"
            />

            <div>
              <label className="label">শিরোনাম (ঐচ্ছিক)</label>
              <input
                className="field"
                placeholder="ঈদ অফার"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>

            <div>
              <label className="label">লিংক (ঐচ্ছিক)</label>
              <input
                className="field"
                placeholder="https://example.com"
                value={draft.link_url}
                onChange={(e) => setDraft({ ...draft, link_url: e.target.value })}
              />
              <p className="mt-1 text-[11px] text-sky-200/35">
                দিলে ব্যানারে ট্যাপ করলে খুলবে। খালি রাখলে শুধু ছবি দেখাবে।
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
              <p className="mt-1 text-[11px] text-sky-200/35">
                ছোট সংখ্যা আগে দেখাবে।
              </p>
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
          {rows.length === 0 ? (
            <div className="glass rounded-2xl px-6 py-16 text-center text-sky-200/45">
              কোনো ব্যানার নেই। ব্যানার না থাকলে অ্যাপে ওই অংশটি একেবারেই দেখাবে না।
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className={`glass overflow-hidden rounded-2xl transition ${
                    row.is_active ? "" : "opacity-55"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={row.image_url}
                    alt=""
                    className="aspect-[16/9] w-full object-cover"
                  />
                  <div className="p-4">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold">
                        {row.title || "শিরোনামহীন"}
                      </h3>
                      {!row.is_active && (
                        <span className="rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-white/55">
                          বন্ধ
                        </span>
                      )}
                    </div>

                    {row.link_url && (
                      <p className="mt-1 truncate text-[11px] text-sky-300/70">
                        {row.link_url}
                      </p>
                    )}

                    <div className="mt-3 flex gap-1.5">
                      <button
                        onClick={() => toggleActive(row)}
                        className="btn-ghost !px-2.5 !py-1.5 !text-xs"
                      >
                        {row.is_active ? "বন্ধ করুন" : "চালু করুন"}
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
