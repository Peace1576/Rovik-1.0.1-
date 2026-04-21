/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { clipboard, shell } = require("electron");

const SYSTEM_ROOT = process.env.WINDIR || "C:\\Windows";
const HOME_DIR = os.homedir();

const KNOWN_APPS = new Map([
  ["calculator", { kind: "command", file: "calc.exe" }],
  ["calc", { kind: "command", file: "calc.exe" }],
  ["notepad", { kind: "path", target: path.join(SYSTEM_ROOT, "System32", "notepad.exe") }],
  ["file explorer", { kind: "command", file: "explorer.exe" }],
  ["explorer", { kind: "command", file: "explorer.exe" }],
  ["windows settings", { kind: "protocol", target: "ms-settings:" }],
  ["settings", { kind: "protocol", target: "ms-settings:" }],
  ["task manager", { kind: "command", file: "taskmgr.exe" }],
  ["paint", { kind: "command", file: "mspaint.exe" }],
  ["snipping tool", { kind: "command", file: "SnippingTool.exe" }],
  ["command prompt", { kind: "command", file: "cmd.exe" }],
  ["cmd", { kind: "command", file: "cmd.exe" }],
  ["powershell", { kind: "command", file: "powershell.exe" }],
  ["power shell", { kind: "command", file: "powershell.exe" }],
  ["spotify", { kind: "command", file: "spotify.exe" }],
  ["google chrome", { kind: "command", file: "chrome.exe" }],
  ["chrome", { kind: "command", file: "chrome.exe" }],
  ["microsoft edge", { kind: "command", file: "msedge.exe" }],
  ["edge", { kind: "command", file: "msedge.exe" }],
  ["vs code", { kind: "command", file: "code.exe" }],
  ["vscode", { kind: "command", file: "code.exe" }],
  ["visual studio code", { kind: "command", file: "code.exe" }],
  ["discord", { kind: "command", file: "discord.exe" }],
  ["slack", { kind: "command", file: "slack.exe" }],
  ["outlook", { kind: "command", file: "outlook.exe" }],
]);

const KNOWN_FOLDERS = new Map([
  ["downloads", path.join(HOME_DIR, "Downloads")],
  ["documents", path.join(HOME_DIR, "Documents")],
  ["desktop", path.join(HOME_DIR, "Desktop")],
  ["pictures", path.join(HOME_DIR, "Pictures")],
  ["music", path.join(HOME_DIR, "Music")],
  ["videos", path.join(HOME_DIR, "Videos")],
]);

const SYSTEM_ACTIONS = {
  open_settings: { kind: "protocol", target: "ms-settings:" },
  open_microphone_privacy_settings: {
    kind: "protocol",
    target: "ms-settings:privacy-microphone",
  },
  open_wifi_settings: { kind: "protocol", target: "ms-settings:network-wifi" },
  open_bluetooth_settings: { kind: "protocol", target: "ms-settings:bluetooth" },
  open_display_settings: { kind: "protocol", target: "ms-settings:display" },
  open_sound_settings: { kind: "protocol", target: "ms-settings:sound" },
  lock_device: { kind: "command", file: "rundll32.exe", args: ["user32.dll,LockWorkStation"] },
};

function normalize(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function launchDetached(file, args = []) {
  return new Promise((resolve) => {
    let settled = false;

    try {
      const child = spawn(file, args, {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      });

      child.once("error", (error) => {
        if (!settled) {
          settled = true;
          resolve({ ok: false, error: error.message });
        }
      });

      child.unref();
      setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve({ ok: true });
        }
      }, 150);
    } catch (error) {
      resolve({
        ok: false,
        error: error instanceof Error ? error.message : "Failed to launch process.",
      });
    }
  });
}

async function openExternal(url) {
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to open external URL.",
    };
  }
}

async function openApp(appName) {
  const raw = String(appName || "").trim();
  if (!raw) {
    return { ok: false, error: "App name is required." };
  }

  if ((/^[A-Za-z]:\\/).test(raw) || /\.(exe|lnk)$/i.test(raw)) {
    const candidate = path.normalize(raw);
    if (!fs.existsSync(candidate)) {
      return { ok: false, error: `Path not found: ${candidate}` };
    }
    const shellError = await shell.openPath(candidate);
    return shellError ? { ok: false, error: shellError } : { ok: true };
  }

  const known = KNOWN_APPS.get(normalize(raw));
  if (known?.kind === "protocol") {
    return openExternal(known.target);
  }
  if (known?.kind === "path") {
    const shellError = await shell.openPath(known.target);
    return shellError ? { ok: false, error: shellError } : { ok: true };
  }
  if (known?.kind === "command") {
    return launchDetached(known.file, known.args || []);
  }

  return launchDetached("cmd.exe", ["/c", "start", "", raw]);
}

async function openFolder(targetPath) {
  const raw = String(targetPath || "").trim();
  if (!raw) {
    return { ok: false, error: "Folder path is required." };
  }

  const normalized = normalize(raw.replace(/\s+folder$/i, ""));
  const knownFolder = KNOWN_FOLDERS.get(normalized);
  const resolved = knownFolder || path.normalize(raw);

  if (!path.isAbsolute(resolved) && !knownFolder) {
    return { ok: false, error: "Use an absolute Windows folder path or a common folder name." };
  }
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: `Folder not found: ${resolved}` };
  }

  const shellError = await shell.openPath(resolved);
  return shellError ? { ok: false, error: shellError } : { ok: true };
}

async function runSystemAction(action) {
  const resolved = SYSTEM_ACTIONS[action];
  if (!resolved) {
    return { ok: false, error: `Unsupported Windows system action: ${action}` };
  }

  if (resolved.kind === "protocol") {
    return openExternal(resolved.target);
  }

  return launchDetached(resolved.file, resolved.args || []);
}

async function writeClipboard(text) {
  try {
    clipboard.writeText(String(text || ""));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to write to clipboard.",
    };
  }
}

module.exports = {
  openApp,
  openExternal,
  openFolder,
  runSystemAction,
  writeClipboard,
};
