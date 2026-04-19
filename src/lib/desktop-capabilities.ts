export const desktopCapabilityCards = [
  {
    title: "Open apps and sites",
    description:
      "Launch YouTube, Google, Spotify, Chrome, Edge, VS Code, Outlook, and other common tools without losing Eve.",
  },
  {
    title: "Control Windows surfaces",
    description:
      "Open Downloads, Documents, Desktop, Wi-Fi settings, Bluetooth, Display, Sound, and other safe system surfaces.",
  },
  {
    title: "Stay in the loop",
    description:
      "Keep Eve running as your desktop command center while she opens destinations, drafts actions, and hands off the next step.",
  },
  {
    title: "Operate daily home admin",
    description:
      "Use one voice-first assistant for inbox triage, bill review, reminders, research, routines, and household follow-ups.",
  },
] as const;

export const desktopExamplePrompts = [
  'Open YouTube and search SpaceX launches.',
  "Open my Downloads folder.",
  "Open Wi-Fi settings.",
  "Open Spotify, then help me plan tonight's chores.",
  "Lock this Windows device.",
] as const;

export const desktopRequirements = [
  "Windows 10 or Windows 11",
  "Internet connection for live Gemini replies",
  "Microphone access for wake word and voice follow-ups",
] as const;
