export const GITHUB_RELEASE_REPOSITORY = {
  owner: "Peace1576",
  name: "Rovik-1.0.1-",
} as const;

export const GITHUB_RELEASES_PAGE_URL = `https://github.com/${GITHUB_RELEASE_REPOSITORY.owner}/${GITHUB_RELEASE_REPOSITORY.name}/releases`;

const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_RELEASE_REPOSITORY.owner}/${GITHUB_RELEASE_REPOSITORY.name}/releases/latest`;

type GitHubReleaseAsset = {
  name?: string;
  url?: string;
  browser_download_url?: string;
};

type GitHubLatestRelease = {
  html_url?: string;
  tag_name?: string;
  published_at?: string;
  assets?: GitHubReleaseAsset[];
};

export type LatestDesktopRelease = {
  assetApiUrl: string | null;
  assetName: string | null;
  assetUrl: string | null;
  publishedAt: string | null;
  releaseUrl: string;
  version: string | null;
};

type LatestDesktopReleaseOptions = {
  fresh?: boolean;
};

function getGitHubReleasesToken() {
  return (
    process.env.GITHUB_RELEASES_TOKEN ||
    process.env.GITHUB_TOKEN ||
    null
  );
}

function getGitHubHeaders(accept = "application/vnd.github+json") {
  const token = getGitHubReleasesToken();

  return {
    Accept: accept,
    "User-Agent": "Rovik-Desktop-Release-Resolver",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function getWindowsDesktopAssetRank(assetName: string) {
  const normalized = assetName.toLowerCase();
  if (
    normalized.endsWith(".exe") &&
    normalized.includes("rovik") &&
    normalized.includes("setup")
  ) {
    return 3;
  }

  if (
    normalized.endsWith(".msi") &&
    normalized.includes("rovik")
  ) {
    return 2;
  }

  if (
    normalized.endsWith(".zip") &&
    normalized.includes("rovik") &&
    normalized.includes("win32-x64")
  ) {
    return 1;
  }

  return 0;
}

export async function getLatestDesktopRelease(
  options?: LatestDesktopReleaseOptions,
): Promise<LatestDesktopRelease | null> {
  try {
    const response = await fetch(LATEST_RELEASE_API_URL, {
      headers: getGitHubHeaders(),
      ...(options?.fresh ? { cache: "no-store" as const } : { next: { revalidate: 300 } }),
    });

    if (!response.ok) {
      return null;
    }

    const release = (await response.json()) as GitHubLatestRelease;
    const asset =
      release.assets
        ?.filter(
          (entry) =>
            entry.name &&
            entry.browser_download_url &&
            getWindowsDesktopAssetRank(entry.name) > 0,
        )
        .sort((left, right) => {
          const leftName = left.name ?? "";
          const rightName = right.name ?? "";
          return (
            getWindowsDesktopAssetRank(rightName) -
            getWindowsDesktopAssetRank(leftName)
          );
        })[0] ?? null;

    return {
      assetApiUrl: asset?.url ?? null,
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

export async function getLatestDesktopReleaseDownloadUrl(): Promise<string | null> {
  const latestRelease = await getLatestDesktopRelease({ fresh: true });
  if (!latestRelease) return null;

  const token = getGitHubReleasesToken();
  if (!token || !latestRelease.assetApiUrl) {
    return latestRelease.assetUrl;
  }

  try {
    const assetResponse = await fetch(latestRelease.assetApiUrl, {
      headers: getGitHubHeaders("application/octet-stream"),
      cache: "no-store",
      redirect: "manual",
    });

    const location = assetResponse.headers.get("location");
    if (location) {
      return location;
    }
  } catch {
    return latestRelease.assetUrl;
  }

  return latestRelease.assetUrl;
}
