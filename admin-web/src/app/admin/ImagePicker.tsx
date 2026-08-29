"use client";

import { useRef, useState } from "react";

/**
 * Uploads straight to /api/upload and hands back the public URL.
 *
 * Upload happens on pick rather than on form submit, so a slow upload
 * never blocks saving and the admin sees the real image before saving.
 */
export default function ImagePicker({
  value,
  folder,
  onChange,
  label = "ছবি",
  aspect = "aspect-[16/9]",
}: {
  value: string;
  folder: "banners" | "shops";
  onChange: (url: string) => void;
  label?: string;
  aspect?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", folder);

      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "আপলোড ব্যর্থ হয়েছে।");

      onChange(json.url as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "আপলোড ব্যর্থ হয়েছে।");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <label className="label">{label}</label>

      <div
        className={`${aspect} relative overflow-hidden rounded-xl border border-dashed border-sky-300/25 bg-sky-400/5`}
      >
        {value ? (
          // Supabase storage host is not in next.config images, and these are
          // small adverts — a plain <img> avoids the optimiser round-trip.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-sky-200/40">
            কোনো ছবি নেই
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-slate-950/70 text-xs text-sky-200">
            আপলোড হচ্ছে…
          </div>
        )}
      </div>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="btn-ghost !px-3 !py-1.5 !text-xs"
        >
          {value ? "ছবি বদলান" : "ছবি বাছুন"}
        </button>
        {value && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onChange("")}
            className="btn-ghost !border-rose-400/25 !px-3 !py-1.5 !text-xs !text-rose-200 hover:!bg-rose-500/10"
          >
            সরান
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pick(f);
        }}
      />

      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
      <p className="mt-1 text-[11px] text-sky-200/35">
        JPG / PNG / WEBP / GIF · সর্বোচ্চ ৫ MB
      </p>
    </div>
  );
}
