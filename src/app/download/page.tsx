import Link from "next/link";

import { WindowsDownloadCta } from "@/components/windows-download-cta";
import {
  desktopCapabilityCards,
  desktopExamplePrompts,
  desktopRequirements,
} from "@/lib/desktop-capabilities";
import {
  GITHUB_RELEASES_PAGE_URL,
  getLatestDesktopRelease,
} from "@/lib/github-releases";

export const revalidate = 3600;

export default async function DownloadPage() {
  const latestDesktopRelease = await getLatestDesktopRelease();
  const publicOverrideDownloadUrl =
    process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL ||
    process.env.ROVIK_DESKTOP_DOWNLOAD_URL;
  const hasHostedDownload = Boolean(publicOverrideDownloadUrl || latestDesktopRelease?.assetUrl);
  const desktopDownloadUrl = publicOverrideDownloadUrl || "/api/releases/windows-download";
  const releasesPageUrl = latestDesktopRelease?.releaseUrl || GITHUB_RELEASES_PAGE_URL;

  return (
    <main className="min-h-screen px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-[2rem] px-5 py-4 sm:px-6">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.34em] text-[#5c718d]">
              Rovik / Windows Desktop
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[#09101d] sm:text-2xl">
              Download Rovik for Windows
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="rounded-full border border-white/65 bg-white/70 px-4 py-2 text-sm font-medium text-[#47627f] transition hover:bg-white"
            >
              Back to Eve
            </Link>
            <span className="rounded-full border border-[#0b74ff]/20 bg-[rgba(11,116,255,0.08)] px-4 py-2 text-sm font-medium text-[#0b74ff]">
              Legal acknowledgment required
            </span>
          </div>
        </header>

        <section className="glass-panel-strong overflow-hidden rounded-[2.5rem] px-5 py-8 sm:px-8 lg:px-12">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="font-mono text-[0.7rem] uppercase tracking-[0.3em] text-[#5c718d]">
                Desktop edition
              </p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-[#09101d] sm:text-5xl">
                Rovik can take action on the same Windows machine you work from.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#566780] sm:text-base">
                The desktop build keeps Eve present while she opens apps, folders,
                settings, sites, and handoff surfaces for your next move. It turns
                Rovik from a browser assistant into a real Windows control layer for
                home admin, digital life, and day-to-day operations.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {desktopRequirements.map((item) => (
                  <span
                    key={item}
                    className="rounded-full bg-white/78 px-3 py-1 font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[#5a6d88]"
                  >
                    {item}
                  </span>
                ))}
                {latestDesktopRelease?.version && (
                  <span className="rounded-full bg-[rgba(11,116,255,0.1)] px-3 py-1 font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[#0b74ff]">
                    Latest release {latestDesktopRelease.version}
                  </span>
                )}
              </div>
            </div>

            <div className="glass-panel w-full max-w-md rounded-[2rem] px-5 py-5">
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-[#63758e]">
                What you can say
              </p>
              <ul className="mt-4 space-y-2">
                {desktopExamplePrompts.map((prompt) => (
                  <li
                    key={prompt}
                    className="rounded-[1.2rem] border border-white/60 bg-white/75 px-4 py-3 text-sm leading-6 text-[#22344d]"
                  >
                    {prompt}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {desktopCapabilityCards.map((capability) => (
            <article
              key={capability.title}
              className="glass-panel rounded-[2rem] px-5 py-5"
            >
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-[#63758e]">
                Desktop capability
              </p>
              <h3 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-[#09101d]">
                {capability.title}
              </h3>
              <p className="mt-2 text-sm leading-7 text-[#566780]">
                {capability.description}
              </p>
            </article>
          ))}
        </section>

        <section className="glass-panel rounded-[2rem] px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-[#63758e]">
                Release status
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">
                The Windows installer is the supported desktop download.
              </h3>
              <p className="mt-2 text-sm leading-7 text-[#566780]">
                Desktop builds are published through GitHub Releases as a Windows
                installer. Download `Rovik Setup`, run the installer, and then
                launch Rovik from the desktop shortcut or Start menu. Because the
                app is not code-signed yet, Windows SmartScreen may ask you to
                click `More info` and then `Run anyway`.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <a
                href={releasesPageUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-white/65 bg-white/70 px-4 py-2 text-sm font-medium text-[#47627f] transition hover:bg-white"
              >
                View Releases
              </a>
              <Link
                href="/settings"
                className="rounded-full border border-white/65 bg-white/70 px-4 py-2 text-sm font-medium text-[#47627f] transition hover:bg-white"
              >
                Open Settings
              </Link>
              <Link
                href="/"
                className="rounded-full bg-[linear-gradient(135deg,#0b74ff_0%,#30c2ff_100%)] px-5 py-2 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(19,112,255,0.28)] transition hover:-translate-y-0.5"
              >
                Try Eve
              </Link>
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-[2rem] px-5 py-5 sm:px-6">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-[#63758e]">
            Download acknowledgment
          </p>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">
            Users must accept the legal documents before downloading.
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[#566780]">
            This download gate links the core legal documents and requires a clear
            acknowledgment before the Windows package can be opened from this page.
          </p>
          <div className="mt-5">
            <WindowsDownloadCta
              downloadUrl={desktopDownloadUrl}
              hasHostedDownload={hasHostedDownload}
              releasesPageUrl={releasesPageUrl}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
