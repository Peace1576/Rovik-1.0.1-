/* eslint-disable @typescript-eslint/no-require-imports */
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");

const {
  BuiltinKeyword,
  Porcupine,
  getBuiltinKeywordPath,
} = require("@picovoice/porcupine-node");
const { PvRecorder } = require("@picovoice/pvrecorder-node");
const { Cobra } = require("@picovoice/cobra-node");

function trimEnv(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function keywordLabelFromPath(keywordPath) {
  return path.basename(keywordPath, path.extname(keywordPath));
}

class DesktopVoiceEngine extends EventEmitter {
  constructor({ appRoot }) {
    super();
    this.appRoot = appRoot;
    this.recorder = null;
    this.porcupine = null;
    this.cobra = null;
    this.running = false;
    this.loopToken = 0;
    this.lastProbabilityAt = 0;
    this.state = {
      available: true,
      backend: "picovoice",
      configured: false,
      accessKeyPresent: false,
      keywordModelPresent: false,
      keywordLabel: "Eve",
      usingBuiltinKeyword: false,
      devices: [],
      selectedDeviceIndex: -1,
      selectedDeviceName: null,
      status: "idle",
      lastEvent: "Desktop voice engine idle",
      lastError: null,
      voiceProbability: 0,
    };

    this.refreshConfiguration();
  }

  refreshDevices() {
    try {
      const names = PvRecorder.getAvailableDevices();
      this.state.devices = names.map((name, index) => ({ index, name }));
      if (
        this.state.selectedDeviceIndex >= names.length ||
        (this.state.selectedDeviceIndex < -1)
      ) {
        this.state.selectedDeviceIndex = -1;
      }
      this.state.selectedDeviceName =
        this.state.selectedDeviceIndex >= 0
          ? names[this.state.selectedDeviceIndex] ?? null
          : null;
    } catch (error) {
      this.state.devices = [];
      this.state.selectedDeviceIndex = -1;
      this.state.selectedDeviceName = null;
      this.state.available = false;
      this.state.lastError =
        error instanceof Error ? error.message : "PvRecorder unavailable";
      this.state.lastEvent = "Desktop recorder unavailable";
    }
  }

  resolveKeywordConfiguration() {
    const accessKey = trimEnv("PICOVOICE_ACCESS_KEY");
    const configuredKeywordPath = trimEnv("PICOVOICE_KEYWORD_PATH");
    const builtinKeywordName = trimEnv("PICOVOICE_BUILTIN_KEYWORD")
      .replace(/[-\s]+/g, "_")
      .toUpperCase();

    if (configuredKeywordPath && fs.existsSync(configuredKeywordPath)) {
      return {
        accessKey,
        keywordPath: configuredKeywordPath,
        keywordLabel: keywordLabelFromPath(configuredKeywordPath),
        usingBuiltinKeyword: false,
      };
    }

    const localCandidates = [
      path.join(this.appRoot, "voice-models", "eve_windows.ppn"),
      path.join(this.appRoot, "voice-models", "eve.ppn"),
      path.join(process.cwd(), "voice-models", "eve_windows.ppn"),
      path.join(process.cwd(), "voice-models", "eve.ppn"),
    ];

    for (const candidate of localCandidates) {
      if (fs.existsSync(candidate)) {
        return {
          accessKey,
          keywordPath: candidate,
          keywordLabel: keywordLabelFromPath(candidate),
          usingBuiltinKeyword: false,
        };
      }
    }

    if (builtinKeywordName && BuiltinKeyword[builtinKeywordName]) {
      const builtinKeyword = BuiltinKeyword[builtinKeywordName];
      return {
        accessKey,
        keywordPath: getBuiltinKeywordPath(builtinKeyword),
        keywordLabel: builtinKeyword,
        usingBuiltinKeyword: true,
      };
    }

    return {
      accessKey,
      keywordPath: null,
      keywordLabel: "Eve",
      usingBuiltinKeyword: false,
    };
  }

  refreshConfiguration() {
    this.refreshDevices();
    const keywordConfig = this.resolveKeywordConfiguration();
    this.state.accessKeyPresent = !!keywordConfig.accessKey;
    this.state.keywordModelPresent = !!keywordConfig.keywordPath;
    this.state.configured =
      this.state.available &&
      this.state.accessKeyPresent &&
      this.state.keywordModelPresent;
    this.state.keywordLabel = keywordConfig.keywordLabel;
    this.state.usingBuiltinKeyword = keywordConfig.usingBuiltinKeyword;
    this.keywordAccessKey = keywordConfig.accessKey;
    this.keywordPath = keywordConfig.keywordPath;

    if (!this.state.available) {
      this.state.status = "error";
      return;
    }

    if (!this.state.accessKeyPresent) {
      this.state.status = "error";
      this.state.lastError = "PICOVOICE_ACCESS_KEY missing";
      this.state.lastEvent = "Picovoice access key missing";
      return;
    }

    if (!this.state.keywordModelPresent) {
      this.state.status = "error";
      this.state.lastError = "Eve keyword model missing";
      this.state.lastEvent = "Custom Eve wake-word model missing";
      return;
    }

    if (!this.running) {
      this.state.status = "idle";
      this.state.lastError = null;
      this.state.lastEvent = `Ready to listen for "${this.state.keywordLabel}"`;
    }
  }

  snapshot() {
    return {
      ...this.state,
      devices: this.state.devices.map((device) => ({ ...device })),
    };
  }

  emitState(type = "state") {
    this.emit("event", {
      type,
      state: this.snapshot(),
    });
  }

  async initializeEngines() {
    this.refreshConfiguration();
    if (!this.state.configured) {
      this.emitState("state");
      return false;
    }

    this.porcupine = new Porcupine(
      this.keywordAccessKey,
      [this.keywordPath],
      [0.58],
    );

    try {
      this.cobra = new Cobra(this.keywordAccessKey);
    } catch {
      this.cobra = null;
    }

    this.recorder = new PvRecorder(
      this.porcupine.frameLength,
      this.state.selectedDeviceIndex,
      128,
    );
    this.recorder.start();
    this.state.selectedDeviceName = this.recorder.getSelectedDevice() ?? null;
    return true;
  }

  async start() {
    if (this.running) {
      this.emitState("state");
      return this.snapshot();
    }

    try {
      const initialized = await this.initializeEngines();
      if (!initialized) return this.snapshot();

      this.running = true;
      const loopToken = ++this.loopToken;
      this.state.status = "armed";
      this.state.lastError = null;
      this.state.lastEvent = `Listening for "${this.state.keywordLabel}" locally`;
      this.emitState("state");
      void this.runLoop(loopToken);
      return this.snapshot();
    } catch (error) {
      this.running = false;
      this.releaseResources();
      this.state.status = "error";
      this.state.lastError =
        error instanceof Error ? error.message : "Voice engine failed to start";
      this.state.lastEvent = "Desktop voice engine failed to start";
      this.emitState("state");
      return this.snapshot();
    }
  }

  async stop(reason = "Desktop voice engine stopped") {
    this.running = false;
    this.loopToken += 1;
    this.releaseResources();
    this.state.status = "idle";
    this.state.voiceProbability = 0;
    this.state.lastEvent = reason;
    if (this.state.lastError === "Wake word detected") {
      this.state.lastError = null;
    }
    this.emitState("state");
    return this.snapshot();
  }

  async retry() {
    await this.stop("Restarting desktop voice engine");
    return this.start();
  }

  async setDeviceIndex(deviceIndex) {
    const numericIndex = Number.isInteger(deviceIndex) ? deviceIndex : -1;
    this.state.selectedDeviceIndex =
      numericIndex >= 0 ? numericIndex : -1;
    this.state.selectedDeviceName =
      this.state.selectedDeviceIndex >= 0
        ? this.state.devices.find((device) => device.index === this.state.selectedDeviceIndex)?.name ?? null
        : null;

    if (this.running) {
      return this.retry();
    }

    this.refreshConfiguration();
    this.emitState("state");
    return this.snapshot();
  }

  releaseResources() {
    try {
      this.recorder?.stop();
    } catch {
      /* ignore */
    }
    try {
      this.recorder?.release();
    } catch {
      /* ignore */
    }
    try {
      this.porcupine?.release();
    } catch {
      /* ignore */
    }
    try {
      this.cobra?.release();
    } catch {
      /* ignore */
    }

    this.recorder = null;
    this.porcupine = null;
    this.cobra = null;
  }

  async runLoop(loopToken) {
    while (this.running && loopToken === this.loopToken && this.recorder && this.porcupine) {
      try {
        const frame = await this.recorder.read();
        if (!this.running || loopToken !== this.loopToken) return;

        if (this.cobra && this.cobra.frameLength === frame.length) {
          const nextProbability = this.cobra.process(frame);
          const now = Date.now();
          if (
            Math.abs(nextProbability - this.state.voiceProbability) > 0.08 ||
            now - this.lastProbabilityAt > 500
          ) {
            this.state.voiceProbability = nextProbability;
            this.lastProbabilityAt = now;
            this.emitState("state");
          }
        }

        const keywordIndex = this.porcupine.process(frame);
        if (keywordIndex >= 0) {
          this.running = false;
          this.loopToken += 1;
          this.releaseResources();
          this.state.status = "triggered";
          this.state.voiceProbability = 0;
          this.state.lastError = null;
          this.state.lastEvent = `Wake word "${this.state.keywordLabel}" detected`;
          this.emitState("wake-word-detected");
          return;
        }
      } catch (error) {
        this.running = false;
        this.releaseResources();
        this.state.status = "error";
        this.state.voiceProbability = 0;
        this.state.lastError =
          error instanceof Error ? error.message : "Desktop wake loop failed";
        this.state.lastEvent = "Desktop wake loop failed";
        this.emitState("state");
        return;
      }
    }
  }
}

module.exports = {
  DesktopVoiceEngine,
};
