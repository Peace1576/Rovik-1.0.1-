import Link from "next/link";
import { ReactNode } from "react";

import { LegalLinks } from "@/components/legal-links";
import { LEGAL_EFFECTIVE_DATE } from "@/lib/legal";

type LegalPageShellProps = {
  eyebrow: string;
  title: string;
  summary: string;
  children: ReactNode;
};

export function LegalPageShell({
  eyebrow,
  title,
  summary,
  children,
}: LegalPageShellProps) {
  return (
    <main className="min-h-screen px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="glass-panel rounded-[2rem] px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.34em] text-[#5c718d]">
                {eyebrow}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[#09101d] sm:text-4xl">
                {title}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[#586983] sm:text-base">
                {summary}
              </p>
            </div>

            <div className="rounded-[1.2rem] border border-white/55 bg-white/70 px-4 py-3 text-sm text-[#5c718d]">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.22em] text-[#70839d]">
                Effective
              </p>
              <p className="mt-1 font-medium text-[#0b1321]">{LEGAL_EFFECTIVE_DATE}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/45 pt-4">
            <LegalLinks />
            <Link
              href="/"
              className="rounded-full border border-white/65 bg-white/75 px-4 py-2 text-sm font-medium text-[#47627f] transition hover:bg-white"
            >
              Back to Rovik
            </Link>
          </div>
        </header>

        <section className="glass-panel rounded-[2rem] px-5 py-6 sm:px-6">
          <div className="space-y-6 text-sm leading-7 text-[#22344d] sm:text-[0.96rem]">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
