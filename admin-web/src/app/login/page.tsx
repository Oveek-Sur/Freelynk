"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "লগইন ব্যর্থ হয়েছে।");
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "লগইন ব্যর্থ হয়েছে।");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="glass w-full max-w-sm rounded-3xl p-8"
      >
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-cyan-300 text-2xl shadow-lg shadow-sky-500/25">
            <svg
              viewBox="0 0 24 24"
              className="h-7 w-7 text-[#00131f]"
              fill="currentColor"
            >
              <path d="M12 18.5a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Zm0-4.6c1.5 0 2.9.6 3.9 1.6l-1.6 1.6a3.3 3.3 0 0 0-4.6 0L8.1 15.5a5.5 5.5 0 0 1 3.9-1.6Zm0-4.5c2.7 0 5.2 1.1 7 2.9l-1.6 1.6a7.6 7.6 0 0 0-10.8 0L5 12.3a9.9 9.9 0 0 1 7-2.9Zm0-4.5c4 0 7.6 1.6 10.2 4.2l-1.6 1.6a12.2 12.2 0 0 0-17.2 0L1.8 5.1A14.4 14.4 0 0 1 12 4.9Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">ShareLynk</h1>
          <p className="mt-1 text-sm text-sky-200/50">অ্যাডমিন প্যানেল</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="u">
              ইউজারনেম
            </label>
            <input
              id="u"
              className="field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="p">
              পাসওয়ার্ড
            </label>
            <input
              id="p"
              type="password"
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-primary mt-6 w-full">
          {busy ? "যাচাই করা হচ্ছে…" : "লগইন"}
        </button>
      </form>
    </main>
  );
}
