import Link from "next/link";

import { LegalPageShell } from "@/components/legal-page-shell";
import { LEGAL_EFFECTIVE_DATE, LEGAL_LINKS } from "@/lib/legal";

const legalContactEmail =
  process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL || "support@rovik.ai";

export default function LegalHubPage() {
  return (
    <LegalPageShell
      eyebrow="Rovik / Legal"
      title="Legal documents"
      summary="These documents govern Rovik’s website, hosted assistant, and Windows desktop application."
    >
      <div className="rounded-[1.5rem] border border-white/55 bg-white/70 px-5 py-4">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-[#657891]">
          Coverage
        </p>
        <p className="mt-2">
          Effective date: {LEGAL_EFFECTIVE_DATE}. These documents are intended to
          cover Rovik’s web product, Eve assistant experience, account system,
          integrations, and the downloadable Windows desktop build.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {LEGAL_LINKS.map((doc) => (
          <Link
            key={doc.href}
            href={doc.href}
            className="rounded-[1.5rem] border border-white/55 bg-white/74 px-5 py-5 transition hover:-translate-y-0.5 hover:bg-white"
          >
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-[#657891]">
              Legal document
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#09101d]">
              {doc.label}
            </h2>
            <p className="mt-2 text-[#5a6d88]">
              Open the full {doc.label.toLowerCase()} for rights, restrictions,
              obligations, and disclosures.
            </p>
          </Link>
        ))}
      </div>

      <div className="rounded-[1.5rem] border border-[#0b74ff]/18 bg-[rgba(11,116,255,0.07)] px-5 py-4">
        <h2 className="text-xl font-semibold tracking-[-0.04em] text-[#09101d]">
          Legal contact
        </h2>
        <p className="mt-2">
          For privacy, data, or legal requests, contact{" "}
          <a className="text-[#0b74ff] hover:underline" href={`mailto:${legalContactEmail}`}>
            {legalContactEmail}
          </a>
          .
        </p>
      </div>
    </LegalPageShell>
  );
}
