/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

const voiceEventChannel = "desktop:voice-event";

contextBridge.exposeInMainWorld("eveDesktop", {
  getRuntimeInfo: () => ipcRenderer.invoke("desktop:get-runtime-info"),
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
  openApp: (appName) => ipcRenderer.invoke("desktop:open-app", appName),
  openPath: (targetPath) => ipcRenderer.invoke("desktop:open-path", targetPath),
  runSystemAction: (action) =>
    ipcRenderer.invoke("desktop:run-system-action", action),
  writeClipboard: (text) => ipcRenderer.invoke("desktop:write-clipboard", text),
  getVoiceState: () => ipcRenderer.invoke("desktop:voice-get-state"),
  startVoiceEngine: () => ipcRenderer.invoke("desktop:voice-start"),
  stopVoiceEngine: () => ipcRenderer.invoke("desktop:voice-stop"),
  retryVoiceEngine: () => ipcRenderer.invoke("desktop:voice-retry"),
  setVoiceDeviceIndex: (deviceIndex) =>
    ipcRenderer.invoke("desktop:voice-set-device-index", deviceIndex),
  onVoiceEvent: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on(voiceEventChannel, handler);
    return () => ipcRenderer.removeListener(voiceEventChannel, handler);
  },
});
