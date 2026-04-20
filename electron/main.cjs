/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { app, BrowserWindow, ipcMain, shell } = require("electron");

const { startEmbeddedNext } = require("./next-server.cjs");
const {
  openApp,
  openExternal,
  openFolder,
  runSystemAction,
  writeClipboard,
} = require("./windows-actions.cjs");

let mainWindow = null;
let embeddedServer = null;
const desktopSessionToken = crypto.randomUUID();

function loadBundledDesktopEnv() {
  const candidates = [
    path.join(path.resolve(__dirname, ".."), "desktop-env.json"),
    path.join(process.cwd(), "desktop-env.json"),
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
      if (!parsed || typeof parsed !== "object") continue;

      for (const [key, rawValue] of Object.entries(parsed)) {
        if (typeof rawValue !== "string") continue;
        const value = rawValue.trim();
        if (!value || process.env[key]) continue;
        process.env[key] = value;
      }

      break;
    } catch {
      /* ignore invalid packaged env */
    }
  }

  if (!process.env.GOOGLE_API_KEY && process.env.GEMINI_API_KEY) {
    process.env.GOOGLE_API_KEY = process.env.GEMINI_API_KEY;
  }
}

function isTrustedDesktopOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return (
      parsed.protocol === "http:" &&
      (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost")
    );
  } catch {
    return false;
  }
}

function registerMediaPermissionHandlers(session) {
  session.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin, details) => {
      const requestOrigin =
        details?.requestingUrl ?? details?.securityOrigin ?? requestingOrigin;

      if (
        (permission === "media" || permission === "audioCapture") &&
        isTrustedDesktopOrigin(requestOrigin)
      ) {
        return true;
      }

      return false;
    },
  );

  session.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      const requestOrigin =
        details?.requestingUrl ?? details?.securityOrigin ?? "";
      const mediaTypes = Array.isArray(details?.mediaTypes)
        ? details.mediaTypes
        : [];

      const allowMedia =
        permission === "media" &&
        isTrustedDesktopOrigin(requestOrigin) &&
        (mediaTypes.length === 0 || mediaTypes.includes("audio"));
      const allowAudioCapture =
        permission === "audioCapture" &&
        isTrustedDesktopOrigin(requestOrigin);

      callback(allowMedia || allowAudioCapture);
    },
  );
}

loadBundledDesktopEnv();

if (!process.env.ROVIK_DESKTOP_SESSION_TOKEN) {
  process.env.ROVIK_DESKTOP_SESSION_TOKEN = desktopSessionToken;
}

function isDevelopment() {
  return !app.isPackaged;
}

function getAppRoot() {
  return app.isPackaged ? app.getAppPath() : path.resolve(__dirname, "..");
}

function getDevUrl() {
  return process.env.ELECTRON_START_URL || "http://127.0.0.1:3000";
}

async function getRendererUrl() {
  if (isDevelopment()) {
    return getDevUrl();
  }

  if (!embeddedServer) {
    embeddedServer = await startEmbeddedNext(getAppRoot());
  }

  return embeddedServer.url;
}

function registerDesktopHandlers() {
  ipcMain.handle("desktop:get-runtime-info", () => ({
    isDesktop: true,
    platform: process.platform,
    appVersion: app.getVersion(),
  }));

  ipcMain.handle("desktop:open-external", (_event, url) => openExternal(url));
  ipcMain.handle("desktop:open-app", (_event, appName) => openApp(appName));
  ipcMain.handle("desktop:open-path", (_event, targetPath) =>
    openFolder(targetPath),
  );
  ipcMain.handle("desktop:run-system-action", (_event, action) =>
    runSystemAction(action),
  );
  ipcMain.handle("desktop:write-clipboard", (_event, text) =>
    writeClipboard(text),
  );
}

async function createWindow() {
  const startUrl = await getRendererUrl();
  const startOrigin = new URL(startUrl).origin;

  mainWindow = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 1280,
    minHeight: 820,
    title: "Rovik",
    backgroundColor: "#eff6ff",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  registerMediaPermissionHandlers(mainWindow.webContents.session);

  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: [`${startOrigin}/*`] },
    (details, callback) => {
      details.requestHeaders["x-rovik-desktop-token"] =
        process.env.ROVIK_DESKTOP_SESSION_TOKEN;
      callback({ requestHeaders: details.requestHeaders });
    },
  );

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(startUrl);

  if (isDevelopment()) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

async function stopEmbeddedServer() {
  if (!embeddedServer) return;

  try {
    await embeddedServer.close();
  } catch {
    /* ignore shutdown errors */
  } finally {
    embeddedServer = null;
  }
}

app.whenReady().then(async () => {
  app.setAppUserModelId("com.rovik.desktop");
  registerDesktopHandlers();
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", async () => {
  await stopEmbeddedServer();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  await stopEmbeddedServer();
});
