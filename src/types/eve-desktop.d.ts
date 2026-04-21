export {};

type DesktopActionResult = {
  ok: boolean;
  error?: string;
};

type DesktopRuntimeInfo = {
  isDesktop: boolean;
  platform: string;
  appVersion: string;
};

type DesktopVoiceDevice = {
  index: number;
  name: string;
};

type DesktopVoiceState = {
  available: boolean;
  backend: "picovoice" | "openwakeword";
  configured: boolean;
  accessKeyPresent: boolean;
  keywordModelPresent: boolean;
  pythonRuntimePresent: boolean;
  configurationIssue:
    | "missing_picovoice_access_key"
    | "missing_picovoice_model"
    | "missing_python_runtime"
    | "missing_openwakeword_model"
    | "recorder_unavailable"
    | null;
  keywordLabel: string;
  wakeModelSource: "custom" | "builtin" | "none";
  usingBuiltinKeyword: boolean;
  devices: DesktopVoiceDevice[];
  selectedDeviceIndex: number;
  selectedDeviceName: string | null;
  status: "idle" | "armed" | "triggered" | "error";
  lastEvent: string;
  lastError: string | null;
  voiceProbability: number;
};

type DesktopVoiceEvent = {
  type: "state" | "wake-word-detected";
  state: DesktopVoiceState;
};

declare global {
  interface Window {
    eveDesktop?: {
      getRuntimeInfo: () => Promise<DesktopRuntimeInfo>;
      openExternal: (url: string) => Promise<DesktopActionResult>;
      openApp: (appName: string) => Promise<DesktopActionResult>;
      openPath: (targetPath: string) => Promise<DesktopActionResult>;
      runSystemAction: (
        action:
          | "open_settings"
          | "open_microphone_privacy_settings"
          | "open_wifi_settings"
          | "open_bluetooth_settings"
          | "open_display_settings"
          | "open_sound_settings"
          | "lock_device",
      ) => Promise<DesktopActionResult>;
      writeClipboard: (text: string) => Promise<DesktopActionResult>;
      getVoiceState: () => Promise<DesktopVoiceState>;
      startVoiceEngine: () => Promise<DesktopVoiceState>;
      stopVoiceEngine: () => Promise<DesktopVoiceState>;
      retryVoiceEngine: () => Promise<DesktopVoiceState>;
      setVoiceDeviceIndex: (deviceIndex: number) => Promise<DesktopVoiceState>;
      onVoiceEvent: (
        callback: (event: DesktopVoiceEvent) => void,
      ) => () => void;
    };
  }
}
