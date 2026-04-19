/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("eveDesktop", {
  getRuntimeInfo: () => ipcRenderer.invoke("desktop:get-runtime-info"),
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
  openApp: (appName) => ipcRenderer.invoke("desktop:open-app", appName),
  openPath: (targetPath) => ipcRenderer.invoke("desktop:open-path", targetPath),
  runSystemAction: (action) =>
    ipcRenderer.invoke("desktop:run-system-action", action),
  writeClipboard: (text) => ipcRenderer.invoke("desktop:write-clipboard", text),
});
