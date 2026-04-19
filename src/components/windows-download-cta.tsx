"use client";

import { useMemo, useState } from "react";

import { LegalLinks } from "@/components/legal-links";

type WindowsDownloadCtaProps = {
  downloadUrl: string;
  hasHostedDownload: boolean;
  releasesPageUrl: string;
};

export function WindowsDownloadCta({
  downloadUrl,
  hasHostedDownload,
  releasesPageUrl,
}: WindowsDownloadCtaProps) {
  const [accepted, setAccepted] = useState(false);

  const buttonText = useMemo(() => {
    if (hasHostedDownload) return "Download for Windows";
    return "View GitHub releases";
  }, [hasHostedDownload]);

  const href = hasHostedDownload ? downloadUrl : releasesPageUrl;

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-start gap-3 rounded-[1.2rem] border border-white/55 bg-white/70 px-4 py-3 text-sm leading-6 text-[#22344d]">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          className="mt-1 h-4 w-4 rounded border-[#90a4bd] text-[#0b74ff] focus:ring-[#72ceff]"
        />
        <span>
          I agree to the Terms of Use, Privacy Policy, Acceptable Use Policy, and
          Desktop App EULA, and I understand I remain responsible for reviewing and
          approving what Rovik does.
        </span>
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <LegalLinks compact />
        <a
          href={accepted ? href : undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!accepted}
          className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
            accepted
              ? "bg-[linear-gradient(135deg,#0b74ff_0%,#30c2ff_100%)] text-white shadow-[0_18px_40px_rgba(19,112,255,0.28)] hover:-translate-y-0.5"
              : "cursor-not-allowed border border-[#0b74ff]/14 bg-[rgba(11,116,255,0.08)] text-[#7f96b2]"
          }`}
          onClick={(event) => {
            if (!accepted) {
              event.preventDefault();
            }
          }}
        >
          {buttonText}
        </a>
      </div>
    </div>
  );
}
