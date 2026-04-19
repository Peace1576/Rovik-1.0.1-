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
          | "open_wifi_settings"
          | "open_bluetooth_settings"
          | "open_display_settings"
          | "open_sound_settings"
          | "lock_device",
      ) => Promise<DesktopActionResult>;
      writeClipboard: (text: string) => Promise<DesktopActionResult>;
    };
  }
}
