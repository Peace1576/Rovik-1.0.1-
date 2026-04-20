"use client";

import { useState } from "react";
import Link from "next/link";

import { LegalLinks } from "@/components/legal-links";
import { LEGAL_VERSION } from "@/lib/legal";
import { createOptionalClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const supabase = createOptionalClient();
  const authUnavailable = !supabase;
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [acceptedAiRisk, setAcceptedAiRisk] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!acceptedLegal) {
      setError("You must agree to the legal terms before creating an account.");
      return;
    }
    if (!acceptedAiRisk) {
      setError("You must acknowledge your responsibility for reviewing Rovik's outputs and actions.");
      return;
    }

    setLoading(true);
    if (!supabase) {
      setError(
        "Account creation is unavailable in this desktop build right now. Download the latest installer or use the web app.",
      );
      setLoading(false);
      return;
    }

    const acceptedAt = new Date().toISOString();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          legal_version: LEGAL_VERSION,
          legal_accepted_at: acceptedAt,
          terms_accepted_at: acceptedAt,
          privacy_accepted_at: acceptedAt,
          acceptable_use_accepted_at: acceptedAt,
          eula_accepted_at: acceptedAt,
          ai_risk_acknowledged_at: acceptedAt,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setDone(true);
    }
  }

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center glass-panel rounded-[2rem] px-6 py-10">
          <div className="text-4xl mb-4">📬</div>
          <h2 className="text-xl font-semibold tracking-[-0.03em]">Check your email</h2>
          <p className="mt-3 text-sm text-[#5c718d] leading-7">
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then{" "}
            <Link href="/auth/login" className="text-[#0b74ff] hover:underline">sign in</Link>.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.34em] text-[#5c718d]">
            Rovik / Embodied Assistant
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
            Create your account
          </h1>
        </div>

        <div className="glass-panel rounded-[2rem] px-6 py-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[#5c718d]">
                Display name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                placeholder="Your name"
                className="rounded-[1.2rem] border border-white/70 bg-white/82 px-4 py-3 text-sm text-[#10213a] outline-none transition placeholder:text-[#7b8da4] focus:border-[#72ceff] focus:ring-4 focus:ring-[#72ceff]/18"
              />
            </div>

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
                placeholder="Min. 8 characters"
                className="rounded-[1.2rem] border border-white/70 bg-white/82 px-4 py-3 text-sm text-[#10213a] outline-none transition placeholder:text-[#7b8da4] focus:border-[#72ceff] focus:ring-4 focus:ring-[#72ceff]/18"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[#5c718d]">
                Confirm password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
                Account creation is not configured in this build yet. Use the latest desktop release or the web app.
              </p>
            )}

            <label className="flex items-start gap-3 rounded-[1.2rem] border border-white/60 bg-white/74 px-4 py-3 text-sm leading-6 text-[#22344d]">
              <input
                type="checkbox"
                checked={acceptedLegal}
                onChange={(e) => setAcceptedLegal(e.target.checked)}
                required
                className="mt-1 h-4 w-4 rounded border-[#90a4bd] text-[#0b74ff] focus:ring-[#72ceff]"
              />
              <span>
                I agree to Rovik&apos;s{" "}
                <Link href="/legal/terms" className="text-[#0b74ff] hover:underline">
                  Terms of Use
                </Link>
                ,{" "}
                <Link href="/legal/privacy" className="text-[#0b74ff] hover:underline">
                  Privacy Policy
                </Link>
                ,{" "}
                <Link
                  href="/legal/acceptable-use"
                  className="text-[#0b74ff] hover:underline"
                >
                  Acceptable Use Policy
                </Link>
                , and{" "}
                <Link href="/legal/eula" className="text-[#0b74ff] hover:underline">
                  Desktop App EULA
                </Link>
                .
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-[1.2rem] border border-white/60 bg-white/74 px-4 py-3 text-sm leading-6 text-[#22344d]">
              <input
                type="checkbox"
                checked={acceptedAiRisk}
                onChange={(e) => setAcceptedAiRisk(e.target.checked)}
                required
                className="mt-1 h-4 w-4 rounded border-[#90a4bd] text-[#0b74ff] focus:ring-[#72ceff]"
              />
              <span>
                I understand Rovik can be wrong, incomplete, or unsafe for some uses,
                and I remain responsible for reviewing outputs, approvals, and actions.
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !acceptedLegal || !acceptedAiRisk || authUnavailable}
              className="mt-2 rounded-[1.4rem] bg-[linear-gradient(135deg,#0b74ff_0%,#30c2ff_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(19,112,255,0.3)] transition hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[#5c718d]">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-[#0b74ff] hover:underline font-medium">
              Sign in
            </Link>
          </p>
          <div className="mt-5 border-t border-white/45 pt-4">
            <LegalLinks compact showHub className="justify-center" />
          </div>
        </div>
      </div>
    </main>
  );
}
