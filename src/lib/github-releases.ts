export const GITHUB_RELEASE_REPOSITORY = {
  owner: "Peace1576",
  name: "Rovik-1.0.1-",
} as const;

export const GITHUB_RELEASES_PAGE_URL = `https://github.com/${GITHUB_RELEASE_REPOSITORY.owner}/${GITHUB_RELEASE_REPOSITORY.name}/releases`;

const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_RELEASE_REPOSITORY.owner}/${GITHUB_RELEASE_REPOSITORY.name}/releases/latest`;

type GitHubReleaseAsset = {
  name?: string;
  browser_download_url?: string;
};

type GitHubLatestRelease = {
  html_url?: string;
  tag_name?: string;
  published_at?: string;
  assets?: GitHubReleaseAsset[];
};

export type LatestDesktopRelease = {
  assetName: string | null;
  assetUrl: string | null;
  publishedAt: string | null;
  releaseUrl: string;
  version: string | null;
};

function isWindowsDesktopAsset(assetName: string) {
  const normalized = assetName.toLowerCase();
  return (
    normalized.endsWith(".zip") &&
    normalized.includes("rovik") &&
    normalized.includes("win32-x64")
  );
}

export async function getLatestDesktopRelease(): Promise<LatestDesktopRelease | null> {
  try {
    const response = await fetch(LATEST_RELEASE_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Rovik-Desktop-Release-Resolver",
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      return null;
    }

    const release = (await response.json()) as GitHubLatestRelease;
    const asset =
      release.assets?.find(
        (entry) =>
          entry.name &&
          entry.browser_download_url &&
          isWindowsDesktopAsset(entry.name),
      ) ?? null;

    return {
      assetName: asset?.name ?? null,
      assetUrl: asset?.browser_download_url ?? null,
      publishedAt: release.published_at ?? null,
      releaseUrl: release.html_url || GITHUB_RELEASES_PAGE_URL,
      version: release.tag_name ?? null,
    };
  } catch {
    return null;
  }
}
