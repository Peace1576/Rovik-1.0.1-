import { NextResponse } from "next/server";

import {
  GITHUB_RELEASES_PAGE_URL,
  getLatestDesktopReleaseDownloadUrl,
} from "@/lib/github-releases";

export const dynamic = "force-dynamic";

export async function GET() {
  const downloadUrl = await getLatestDesktopReleaseDownloadUrl();
  return NextResponse.redirect(downloadUrl || GITHUB_RELEASES_PAGE_URL);
}
