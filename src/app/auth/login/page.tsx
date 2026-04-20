"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { LegalLinks } from "@/components/legal-links";
import { createOptionalClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const supabase = createOptionalClient();
  const authUnavailable = !supabase;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!supabase) {
      setError(
        "Sign-in is unavailable in this desktop build right now. Download the latest installer or use the web app.",
      );
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push(next);
      router.refresh();
    }
  }

  return (
    <div className="glass-panel rounded-[2rem] px-6 py-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[#5c718d]">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="rounded-[1.2rem] border border-white/70 bg-white/82 px-4 py-3 text-sm text-[#10213a] outline-none transition placeholder:text-[#7b8da4] focus:border-[#72ceff] focus:ring-4 focus:ring-[#72ceff]/18"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[#5c718d]">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            className="rounded-[1.2rem] border border-white/70 bg-white/82 px-4 py-3 text-sm text-[#10213a] outline-none transition placeholder:text-[#7b8da4] focus:border-[#72ceff] focus:ring-4 focus:ring-[#72ceff]/18"
          />
        </div>

        {error && (
          <p className="rounded-[1rem] bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">
            {error}
          </p>
        )}

        {authUnavailable && !error && (
          <p className="rounded-[1rem] border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
            Account sign-in is not configured in this build yet. Use the latest desktop release or the web app.
          </p>
        )}

        <button
          type="submit"
          disabled={loading || authUnavailable}
          className="mt-2 rounded-[1.4rem] bg-[linear-gradient(135deg,#0b74ff_0%,#30c2ff_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(19,112,255,0.3)] transition hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[#5c718d]">
        No account?{" "}
        <Link href="/auth/signup" className="text-[#0b74ff] hover:underline font-medium">
          Create one
        </Link>
      </p>
      <div className="mt-5 border-t border-white/45 pt-4">
        <LegalLinks compact showHub className="justify-center" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.34em] text-[#5c718d]">
            Rovik / Embodied Assistant
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
            Sign in to Eve
          </h1>
        </div>
        <Suspense fallback={<div className="glass-panel rounded-[2rem] px-6 py-8 text-center text-sm text-[#5c718d]">Loading…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
