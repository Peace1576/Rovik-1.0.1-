/* eslint-disable @typescript-eslint/no-require-imports */
const { EventEmitter } = require("node:events");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const {
  BuiltinKeyword,
  Porcupine,
  getBuiltinKeywordPath,
} = require("@picovoice/porcupine-node");
const { PvRecorder } = require("@picovoice/pvrecorder-node");
const { Cobra } = require("@picovoice/cobra-node");

const OPENWAKEWORD_FRAME_LENGTH = 1280;
const OPENWAKEWORD_THRESHOLD = Number.parseFloat(
  process.env.OPENWAKEWORD_THRESHOLD || "0.5",
);
const OPENWAKEWORD_VAD_THRESHOLD = Number.parseFloat(
  process.env.OPENWAKEWORD_VAD_THRESHOLD || "0.45",
);

function trimEnv(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function keywordLabelFromPath(keywordPath) {
  return path.basename(keywordPath, path.extname(keywordPath));
}

function wakeLabelFromModelName(modelName) {
  return modelName
    .replace(/_v\d+(\.\d+)?$/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

class DesktopVoiceEngine extends EventEmitter {
  constructor({ appRoot }) {
    super();
    this.appRoot = appRoot;
    this.recorder = null;
    this.porcupine = null;
    this.cobra = null;
    this.sidecar = null;
    this.sidecarReady = false;
    this.running = false;
    this.loopToken = 0;
    this.lastProbabilityAt = 0;
    this.state = {
      available: true,
      backend: "openwakeword",
      configured: false,
      accessKeyPresent: false,
      keywordModelPresent: false,
      pythonRuntimePresent: false,
      configurationIssue: "missing_openwakeword_model",
      keywordLabel: "Eve",
      wakeModelSource: "none",
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
        this.state.selectedDeviceIndex < -1
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

  resolvePicovoiceConfiguration() {
    const accessKey = trimEnv("PICOVOICE_ACCESS_KEY");
    const configuredKeywordPath = trimEnv("PICOVOICE_KEYWORD_PATH");
    const builtinKeywordName = trimEnv("PICOVOICE_BUILTIN_KEYWORD")
      .replace(/[-\s]+/g, "_")
      .toUpperCase();

    if (configuredKeywordPath && fs.existsSync(configuredKeywordPath)) {
      return {
        configured: !!accessKey,
        accessKey,
        keywordPath: configuredKeywordPath,
        keywordLabel: keywordLabelFromPath(configuredKeywordPath),
        wakeModelSource: "custom",
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
          configured: !!accessKey,
          accessKey,
          keywordPath: candidate,
          keywordLabel: keywordLabelFromPath(candidate),
          wakeModelSource: "custom",
          usingBuiltinKeyword: false,
        };
      }
    }

    if (builtinKeywordName && BuiltinKeyword[builtinKeywordName]) {
      const builtinKeyword = BuiltinKeyword[builtinKeywordName];
      return {
        configured: !!accessKey,
        accessKey,
        keywordPath: getBuiltinKeywordPath(builtinKeyword),
        keywordLabel: builtinKeyword,
        wakeModelSource: "builtin",
        usingBuiltinKeyword: true,
      };
    }

    return {
      configured: false,
      accessKey,
      keywordPath: null,
      keywordLabel: "Eve",
      wakeModelSource: "none",
      usingBuiltinKeyword: false,
    };
  }

  resolveOpenWakeWordConfiguration() {
    const pythonPath = trimEnv("ROVIK_PYTHON_PATH") || "python";
    const explicitModelPath = trimEnv("OPENWAKEWORD_MODEL_PATH");
    const builtinModelName = trimEnv("OPENWAKEWORD_MODEL_NAME");
    const customCandidates = [
      explicitModelPath,
      path.join(this.appRoot, "voice-models", "eve_oww.onnx"),
      path.join(this.appRoot, "voice-models", "eve_oww.tflite"),
      path.join(this.appRoot, "voice-models", "eve.onnx"),
      path.join(this.appRoot, "voice-models", "eve.tflite"),
      path.join(process.cwd(), "voice-models", "eve_oww.onnx"),
      path.join(process.cwd(), "voice-models", "eve_oww.tflite"),
      path.join(process.cwd(), "voice-models", "eve.onnx"),
      path.join(process.cwd(), "voice-models", "eve.tflite"),
    ].filter(Boolean);

    const pythonCheck = spawnSync(pythonPath, ["--version"], {
      stdio: "pipe",
      timeout: 4000,
      windowsHide: true,
    });
    const pythonRuntimePresent = pythonCheck.status === 0;

    for (const candidate of customCandidates) {
      if (candidate && fs.existsSync(candidate)) {
        return {
          configured: pythonRuntimePresent,
          pythonRuntimePresent,
          pythonPath,
          modelPath: candidate,
          modelName: null,
          keywordLabel: keywordLabelFromPath(candidate),
          wakeModelSource: "custom",
        };
      }
    }

    if (builtinModelName) {
      return {
        configured: pythonRuntimePresent,
        pythonRuntimePresent,
        pythonPath,
        modelPath: null,
        modelName: builtinModelName,
        keywordLabel: wakeLabelFromModelName(builtinModelName),
        wakeModelSource: "builtin",
      };
    }

    return {
      configured: false,
      pythonRuntimePresent,
      pythonPath,
      modelPath: null,
      modelName: null,
      keywordLabel: "Eve",
      wakeModelSource: "none",
    };
  }

  refreshConfiguration() {
    this.refreshDevices();
    const preferredBackend = trimEnv("ROVIK_WAKE_BACKEND").toLowerCase();
    const picovoiceConfig = this.resolvePicovoiceConfiguration();
    const openWakeWordConfig = this.resolveOpenWakeWordConfiguration();

    let activeBackend = "openwakeword";
    if (preferredBackend === "picovoice") {
      activeBackend = "picovoice";
    } else if (preferredBackend === "openwakeword") {
      activeBackend = "openwakeword";
    } else if (picovoiceConfig.configured) {
      activeBackend = "picovoice";
    }

    this.backendConfig =
      activeBackend === "picovoice" ? picovoiceConfig : openWakeWordConfig;
    this.state.backend = activeBackend;
    this.state.accessKeyPresent = !!picovoiceConfig.accessKey;
    this.state.keywordModelPresent = Boolean(
      picovoiceConfig.keywordPath ||
        openWakeWordConfig.modelPath ||
        openWakeWordConfig.modelName,
    );
    this.state.pythonRuntimePresent = !!openWakeWordConfig.pythonRuntimePresent;
    this.state.keywordLabel = this.backendConfig.keywordLabel;
    this.state.wakeModelSource = this.backendConfig.wakeModelSource;
    this.state.usingBuiltinKeyword =
      this.backendConfig.wakeModelSource === "builtin";
    this.state.configured =
      this.state.available && !!this.backendConfig.configured;

    if (!this.state.available) {
      this.state.status = "error";
      this.state.configurationIssue = "recorder_unavailable";
      return;
    }

    if (activeBackend === "picovoice") {
      if (!picovoiceConfig.accessKey) {
        this.state.status = "error";
        this.state.configurationIssue = "missing_picovoice_access_key";
        this.state.lastError = "PICOVOICE_ACCESS_KEY missing";
        this.state.lastEvent = "Picovoice access key missing";
        return;
      }

      if (!picovoiceConfig.keywordPath) {
        this.state.status = "error";
        this.state.configurationIssue = "missing_picovoice_model";
        this.state.lastError = "Eve keyword model missing";
        this.state.lastEvent = "Custom Eve wake-word model missing";
        return;
      }
    } else {
      if (!openWakeWordConfig.pythonRuntimePresent) {
        this.state.status = "error";
        this.state.configurationIssue = "missing_python_runtime";
        this.state.lastError = "Python runtime missing";
        this.state.lastEvent =
          "Python is required for the openWakeWord desktop backend";
        return;
      }

      if (!openWakeWordConfig.modelPath && !openWakeWordConfig.modelName) {
        this.state.status = "error";
        this.state.configurationIssue = "missing_openwakeword_model";
        this.state.lastError = "openWakeWord model missing";
        this.state.lastEvent =
          "Provide an Eve openWakeWord model or a temporary built-in model name";
        return;
      }
    }

    this.state.configurationIssue = null;
    if (!this.running) {
      this.state.status = "idle";
      this.state.lastError = null;
      this.state.lastEvent =
        activeBackend === "picovoice"
          ? `Ready to listen for "${this.state.keywordLabel}"`
          : `Ready to listen for "${this.state.keywordLabel}" with openWakeWord`;
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

  initializePicovoice() {
    this.porcupine = new Porcupine(
      this.backendConfig.accessKey,
      [this.backendConfig.keywordPath],
      [0.58],
    );

    try {
      this.cobra = new Cobra(this.backendConfig.accessKey);
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
  }

  initializeOpenWakeWord() {
    this.recorder = new PvRecorder(
      OPENWAKEWORD_FRAME_LENGTH,
      this.state.selectedDeviceIndex,
      128,
    );
    this.recorder.start();
    this.state.selectedDeviceName = this.recorder.getSelectedDevice() ?? null;

    const sidecarPath = path.join(__dirname, "openwakeword_sidecar.py");
    const args = [
      "-u",
      sidecarPath,
      "--threshold",
      String(Number.isFinite(OPENWAKEWORD_THRESHOLD) ? OPENWAKEWORD_THRESHOLD : 0.5),
      "--vad-threshold",
      String(
        Number.isFinite(OPENWAKEWORD_VAD_THRESHOLD)
          ? OPENWAKEWORD_VAD_THRESHOLD
          : 0.45,
      ),
      "--label",
      this.backendConfig.keywordLabel,
      "--frame-length",
      String(OPENWAKEWORD_FRAME_LENGTH),
    ];

    if (this.backendConfig.modelPath) {
      args.push("--model-path", this.backendConfig.modelPath);
    }
    if (this.backendConfig.modelName) {
      args.push("--model-name", this.backendConfig.modelName);
    }

    this.sidecar = spawn(this.backendConfig.pythonPath, args, {
      cwd: this.appRoot,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.sidecarReady = false;

    const lineReader = readline.createInterface({
      input: this.sidecar.stdout,
      crlfDelay: Infinity,
    });
    lineReader.on("line", (line) => this.handleOpenWakeWordLine(line));
    this.sidecar.stderr.on("data", (chunk) => {
      const text = String(chunk || "").trim();
      if (!text) return;
      this.state.lastError = text;
      this.state.lastEvent = "openWakeWord sidecar logged an error";
      this.emitState("state");
    });
    this.sidecar.on("exit", (code, signal) => {
      if (!this.running) return;
      this.running = false;
      this.releaseResources();
      this.state.status = "error";
      this.state.voiceProbability = 0;
      this.state.lastError =
        this.state.lastError ||
        `openWakeWord sidecar exited (${code ?? "null"}${signal ? `/${signal}` : ""})`;
      this.state.lastEvent = "openWakeWord sidecar stopped";
      this.emitState("state");
    });
  }

  handleOpenWakeWordLine(line) {
    let payload = null;
    try {
      payload = JSON.parse(line);
    } catch {
      return;
    }

    if (!payload || typeof payload !== "object") return;

    if (payload.type === "ready") {
      this.sidecarReady = true;
      this.state.status = "armed";
      this.state.lastError = null;
      this.state.lastEvent =
        payload.message ||
        `Listening for "${this.state.keywordLabel}" with openWakeWord`;
      this.emitState("state");
      return;
    }

    if (payload.type === "prediction") {
      this.state.voiceProbability = Number(payload.score) || 0;
      this.lastProbabilityAt = Date.now();
      this.emitState("state");
      return;
    }

    if (payload.type === "wake-word-detected") {
      this.running = false;
      this.releaseResources();
      this.state.status = "triggered";
      this.state.voiceProbability = 0;
      this.state.lastError = null;
      this.state.lastEvent =
        payload.message ||
        `Wake word "${this.state.keywordLabel}" detected`;
      this.emitState("wake-word-detected");
      return;
    }

    if (payload.type === "error") {
      this.running = false;
      this.releaseResources();
      this.state.status = "error";
      this.state.voiceProbability = 0;
      this.state.lastError = payload.message || "openWakeWord sidecar failed";
      this.state.lastEvent = "openWakeWord sidecar failed";
      this.emitState("state");
    }
  }

  async initializeEngines() {
    this.refreshConfiguration();
    if (!this.state.configured) {
      this.emitState("state");
      return false;
    }

    if (this.state.backend === "picovoice") {
      this.initializePicovoice();
    } else {
      this.initializeOpenWakeWord();
    }
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
      this.state.status = this.state.backend === "openwakeword" ? "idle" : "armed";
      this.state.lastError = null;
      this.state.lastEvent =
        this.state.backend === "picovoice"
          ? `Listening for "${this.state.keywordLabel}" locally`
          : `Starting openWakeWord for "${this.state.keywordLabel}"`;
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
    this.refreshConfiguration();
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
    this.state.selectedDeviceIndex = numericIndex >= 0 ? numericIndex : -1;
    this.state.selectedDeviceName =
      this.state.selectedDeviceIndex >= 0
        ? this.state.devices.find((device) => device.index === this.state.selectedDeviceIndex)?.name ??
          null
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
    if (this.sidecar && !this.sidecar.killed) {
      try {
        this.sidecar.kill();
      } catch {
        /* ignore */
      }
    }

    this.recorder = null;
    this.porcupine = null;
    this.cobra = null;
    this.sidecar = null;
    this.sidecarReady = false;
  }

  async runLoop(loopToken) {
    while (this.running && loopToken === this.loopToken && this.recorder) {
      try {
        const frame = await this.recorder.read();
        if (!this.running || loopToken !== this.loopToken) return;

        if (this.state.backend === "picovoice" && this.porcupine) {
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
          continue;
        }

        if (this.state.backend === "openwakeword" && this.sidecar?.stdin?.writable) {
          const pcm = Buffer.from(
            frame.buffer,
            frame.byteOffset,
            frame.byteLength,
          );
          this.sidecar.stdin.write(pcm);
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
