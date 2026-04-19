import Link from "next/link";

import { LEGAL_LINKS, LEGAL_ROUTES } from "@/lib/legal";

type LegalLinksProps = {
  className?: string;
  compact?: boolean;
  showHub?: boolean;
};

export function LegalLinks({
  className = "",
  compact = false,
  showHub = false,
}: LegalLinksProps) {
  const links = showHub
    ? [{ href: LEGAL_ROUTES.hub, label: "Legal" }, ...LEGAL_LINKS]
    : LEGAL_LINKS;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-[#5c718d] ${className}`.trim()}
    >
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={
            compact
              ? "text-xs hover:text-[#0b74ff] hover:underline"
              : "text-sm hover:text-[#0b74ff] hover:underline"
          }
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
