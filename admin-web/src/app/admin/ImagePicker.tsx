"use client";

import { useEffect, useState } from "react";

/**
 * Takes a public image address rather than a file.
 *
 * Nothing is uploaded or stored: the picture stays wherever it already
 * lives, so the project never pays to serve it and the storage bucket never
 * fills up. The cost of that is trusting a link, which is why the preview
 * exists — press it and you see exactly what a phone would see before the
 * row is ever saved.
 *
 * https only. Android blocks cleartext traffic at this app's target SDK, so
 * an http:// image would preview fine in this browser and then be broken on
 * every handset. Better to refuse it here than to ship it.
 */
export default function ImagePicker({
  value,
  onChange,
  label = "ছবির লিংক",
  aspect = "aspect-[16/9]",
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  aspect?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  const [state, setState] = useState<"idle" | "loading" | "ok" | "bad">(
    value ? "ok" : "idle",
  );
  const [error, setError] = useState<string | null>(null);

  // Keep up when the parent swaps rows (editing a different banner).
  useEffect(() => {
    setDraft(value);
    setShown(value);
    setState(value ? "ok" : "idle");
    setError(null);
  }, [value]);

  function preview() {
    const raw = draft.trim();
    if (!raw) {
      setError("লিংকটি দিন।");
      return;
    }

    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      setError("এটি একটি সম্পূর্ণ লিংক নয়। https:// দিয়ে শুরু করুন।");
      setState("bad");
      return;
    }

    if (url.protocol !== "https:") {
      setError(
        "https:// লিংক দিতে হবে। http:// ছবি ফোনে দেখা যাবে না, " +
          "যদিও এই পাতায় দেখা যেতে পারে।",
      );
      setState("bad");
      return;
    }

    setError(null);
    setState("loading");
    setShown(url.toString());
  }

  /**
   * A picture that loaded is a picture the phone can show, so there is
   * nothing left to confirm — it is committed the moment it appears.
   *
   * There used to be a "keep this image" button here, and it could never
   * be pressed: it enabled on `draft !== shown`, which pressing প্রিভিউ
   * made false in the same breath. The button greyed itself out, the page
   * said the image was saved, and the field behind it was still empty, so
   * saving failed on "ব্যানারের ছবি দিতে হবে" with the picture in plain
   * sight. One step fewer, and that whole class of mismatch is gone.
   */
  function commit(url: string) {
    setState("ok");
    if (url !== value) onChange(url);
  }

  return (
    <div>
      <label className="label">{label}</label>

      <div className="flex gap-2">
        <input
          className="field flex-1"
          value={draft}
          placeholder="https://example.com/banner.jpg"
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              preview();
            }
          }}
        />
        <button
          type="button"
          onClick={preview}
          className="btn-ghost !px-3 !py-1.5 !text-xs whitespace-nowrap"
        >
          প্রিভিউ
        </button>
      </div>

      <div
        className={`${aspect} relative mt-2 overflow-hidden rounded-xl border border-dashed border-sky-300/25 bg-sky-400/5`}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={shown}
            src={shown}
            alt=""
            className="h-full w-full object-cover"
            onLoad={() => commit(shown)}
            onError={() => {
              setState("bad");
              // A link that fails here is not saved, so a broken picture
              // cannot reach a phone.
              if (value) onChange("");
              setError(
                "ছবিটি লোড হয়নি। লিংকটি সবার জন্য খোলা কিনা দেখুন — " +
                  "কিছু সাইট (যেমন Google Drive) সরাসরি ছবি দেখায় না।",
              );
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-sky-200/40">
            লিংক দিয়ে প্রিভিউ চাপুন
          </div>
        )}

        {state === "loading" && (
          <div className="absolute inset-0 grid place-items-center bg-slate-950/70 text-xs text-sky-200">
            দেখা হচ্ছে…
          </div>
        )}
      </div>

      {shown && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => {
              setDraft("");
              setShown("");
              setState("idle");
              setError(null);
              onChange("");
            }}
            className="btn-ghost !border-rose-400/25 !px-3 !py-1.5 !text-xs !text-rose-200 hover:!bg-rose-500/10"
          >
            সরান
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}

      {state === "ok" && shown && (
        <p className="mt-2 text-xs text-emerald-300">
          ছবিটি বসানো হয়েছে — ফোনেও এভাবেই আসবে। এবার সেভ করুন।
        </p>
      )}

      <p className="mt-1 text-[11px] text-sky-200/35">
        ছবি এখানে জমা হয় না, লিংক থেকেই দেখানো হয় · https:// হতে হবে
      </p>
    </div>
  );
}
