export const LEGAL_EFFECTIVE_DATE = "April 19, 2026";
export const LEGAL_VERSION = "2026-04-19";

export const LEGAL_ROUTES = {
  hub: "/legal",
  terms: "/legal/terms",
  privacy: "/legal/privacy",
  acceptableUse: "/legal/acceptable-use",
  eula: "/legal/eula",
} as const;

export const LEGAL_LINKS = [
  { href: LEGAL_ROUTES.terms, label: "Terms of Use" },
  { href: LEGAL_ROUTES.privacy, label: "Privacy Policy" },
  { href: LEGAL_ROUTES.acceptableUse, label: "Acceptable Use Policy" },
  { href: LEGAL_ROUTES.eula, label: "Desktop App EULA" },
] as const;
