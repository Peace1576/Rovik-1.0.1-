type DirectActionIntent =
  | {
      toolName: "open_url";
      args: { url: string; description: string };
      reply: string;
    }
  | {
      toolName: "open_application";
      args: { app_name: string };
      reply: string;
    }
  | {
      toolName: "open_folder";
      args: { path: string };
      reply: string;
    }
  | {
      toolName: "windows_system_action";
      args: {
        action:
          | "open_settings"
          | "open_wifi_settings"
          | "open_bluetooth_settings"
          | "open_display_settings"
          | "open_sound_settings"
          | "lock_device";
      };
      reply: string;
    };

type WindowsSystemAction =
  | "open_settings"
  | "open_wifi_settings"
  | "open_bluetooth_settings"
  | "open_display_settings"
  | "open_sound_settings"
  | "lock_device";

const DIRECT_SITES: Array<[string, string]> = [
  ["youtube", "https://www.youtube.com/"],
  ["google", "https://www.google.com/"],
  ["gmail", "https://mail.google.com/"],
  ["google calendar", "https://calendar.google.com/"],
  ["calendar", "https://calendar.google.com/"],
  ["spotify web", "https://open.spotify.com/"],
  ["amazon", "https://www.amazon.com/"],
  ["netflix", "https://www.netflix.com/"],
  ["reddit", "https://www.reddit.com/"],
  ["github", "https://github.com/"],
];

const APP_ALIASES = new Map<string, string>([
  ["calculator", "Calculator"],
  ["calc", "Calculator"],
  ["notepad", "Notepad"],
  ["file explorer", "File Explorer"],
  ["explorer", "File Explorer"],
  ["windows settings", "Windows Settings"],
  ["settings", "Windows Settings"],
  ["task manager", "Task Manager"],
  ["paint", "Paint"],
  ["snipping tool", "Snipping Tool"],
  ["command prompt", "Command Prompt"],
  ["cmd", "Command Prompt"],
  ["powershell", "PowerShell"],
  ["power shell", "PowerShell"],
  ["spotify", "Spotify"],
  ["chrome", "Google Chrome"],
  ["google chrome", "Google Chrome"],
  ["edge", "Microsoft Edge"],
  ["microsoft edge", "Microsoft Edge"],
  ["vscode", "VS Code"],
  ["vs code", "VS Code"],
  ["visual studio code", "VS Code"],
  ["discord", "Discord"],
  ["slack", "Slack"],
  ["outlook", "Outlook"],
]);

const FOLDER_ALIASES = new Map<string, string>([
  ["downloads", "Downloads"],
  ["downloads folder", "Downloads"],
  ["documents", "Documents"],
  ["documents folder", "Documents"],
  ["desktop", "Desktop"],
  ["desktop folder", "Desktop"],
  ["pictures", "Pictures"],
  ["pictures folder", "Pictures"],
  ["music", "Music"],
  ["music folder", "Music"],
  ["videos", "Videos"],
  ["videos folder", "Videos"],
]);

const SYSTEM_ALIASES = new Map<string, WindowsSystemAction>([
  ["wifi settings", "open_wifi_settings"],
  ["wi-fi settings", "open_wifi_settings"],
  ["bluetooth settings", "open_bluetooth_settings"],
  ["display settings", "open_display_settings"],
  ["sound settings", "open_sound_settings"],
  ["settings", "open_settings"],
  ["windows settings", "open_settings"],
  ["lock device", "lock_device"],
  ["lock computer", "lock_device"],
  ["lock pc", "lock_device"],
]);

function normalizeTarget(raw: string) {
  return raw
    .trim()
    .replace(/[.!?]+$/g, "")
    .replace(/^the\s+/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function extractOpenTarget(input: string) {
  const match = input.match(
    /^(?:can you\s+|could you\s+|please\s+)?(?:open(?:\s+up)?|go to|launch|start|run|navigate to)\s+(.+?)\s*(?:for me|please)?[.!?]*$/i,
  );
  return match?.[1]?.trim() ?? "";
}

function looksLikeUrlOrDomain(target: string) {
  return (
    /^(?:https?:\/\/|www\.)/i.test(target) ||
    /^[a-z0-9-]+\.[a-z]{2,}(?:\/.*)?$/i.test(target)
  );
}

export function resolveDirectActionIntent(
  input: string,
): DirectActionIntent | null {
  const target = extractOpenTarget(input);
  if (!target) return null;

  const normalized = normalizeTarget(target);

  const systemAction = SYSTEM_ALIASES.get(normalized);
  if (systemAction) {
    const label = normalized.replace(/\b\w/g, (char) => char.toUpperCase());
    return {
      toolName: "windows_system_action",
      args: { action: systemAction },
      reply:
        systemAction === "lock_device"
          ? "Locking this Windows device."
          : `Opening ${label}.`,
    };
  }

  const folder = FOLDER_ALIASES.get(normalized);
  if (folder) {
    return {
      toolName: "open_folder",
      args: { path: folder },
      reply: `Opening your ${folder} folder.`,
    };
  }

  const app = APP_ALIASES.get(normalized);
  if (app) {
    return {
      toolName: "open_application",
      args: { app_name: app },
      reply: `Opening ${app}.`,
    };
  }

  if (normalized.startsWith("youtube ")) {
    const query = target.slice(target.toLowerCase().indexOf("youtube") + "youtube".length).trim();
    if (!query) return null;
    return {
      toolName: "open_url",
      args: {
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
        description: `Search YouTube for ${query}`,
      },
      reply: `Opening YouTube results for ${query}.`,
    };
  }

  if (normalized.startsWith("google ")) {
    const query = target.slice(target.toLowerCase().indexOf("google") + "google".length).trim();
    if (!query) return null;
    return {
      toolName: "open_url",
      args: {
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        description: `Search Google for ${query}`,
      },
      reply: `Opening Google results for ${query}.`,
    };
  }

  for (const [label, url] of DIRECT_SITES) {
    if (normalized === label) {
      return {
        toolName: "open_url",
        args: { url, description: `Open ${target}` },
        reply: `Opening ${target}.`,
      };
    }
  }

  if (looksLikeUrlOrDomain(target)) {
    const url = /^https?:\/\//i.test(target) ? target : `https://${target}`;
    return {
      toolName: "open_url",
      args: { url, description: `Open ${target}` },
      reply: `Opening ${target}.`,
    };
  }

  if (/^[A-Za-z]:\\/.test(target) || /\.(exe|lnk)$/i.test(target)) {
    return {
      toolName: "open_application",
      args: { app_name: target },
      reply: `Opening ${target}.`,
    };
  }

  return null;
}
