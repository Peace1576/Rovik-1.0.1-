import { LegalLinks } from "@/components/legal-links";

export function LegalFooter() {
  return (
    <footer className="border-t border-white/45 bg-white/35 px-4 py-4 backdrop-blur-md sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-6 text-[#61748f]">
          Rovik provides AI assistance and automation support. Users remain responsible
          for reviewing outputs, approvals, and actions.
        </p>
        <LegalLinks compact showHub className="shrink-0" />
      </div>
    </footer>
  );
}
