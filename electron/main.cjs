/* eslint-disable @typescript-eslint/no-require-imports */
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
