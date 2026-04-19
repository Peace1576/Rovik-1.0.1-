# Eve for Rovik

Eve is a browser-based prototype for Rovik's home operations assistant. It pairs a centered robot head UI with a speech-synced face, Gemini-backed responses, and a responsive chat surface built for Vercel deployment.

## Stack

- Next.js 16 App Router
- React 19
- Tailwind CSS 4
- Google Gemini via `@google/genai`
- Browser Speech Synthesis for live voice playback and text-sync animation

## Local setup

Create `.env.local` with:

```bash
GEMINI_API_KEY=your_google_gemini_key
```

Then run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Windows desktop app

Rovik can now run as a Windows desktop application through Electron.

Development:

```bash
npm run desktop:dev
```

That starts the Next.js dev server and opens the Electron shell against it.

Package an unpacked Windows build:

```bash
npm run desktop:pack
```

The packaged app is written to:

```bash
dist-electron/Rovik-win32-x64
```

GitHub Releases:

- The repo includes `.github/workflows/windows-release.yml`.
- Push a tag like `v0.1.0`, or run the `Windows Release` workflow manually from GitHub Actions with a tag name.
- The workflow builds the Windows desktop app, zips `dist-electron/Rovik-win32-x64`, and uploads `Rovik-win32-x64.zip` to the GitHub Release.
- The in-app `/download` page automatically looks for the latest GitHub Release asset and uses it as the Windows download link.

The desktop app keeps Eve alive while opening external sites and adds native Windows actions for:

- opening apps like Calculator, Notepad, File Explorer, Settings, VS Code, Spotify, Chrome, Edge, Discord, Slack, and Outlook
- opening common folders like Downloads, Documents, Desktop, Pictures, Music, and Videos
- opening Windows settings pages like Wi-Fi, Bluetooth, Display, and Sound
- locking the Windows device

Desktop note:

- `GEMINI_API_KEY` is still required for live Gemini replies. Without it, the packaged app still launches but Eve falls back to offline demo mode.

## Deploying to Vercel

Add `GEMINI_API_KEY` to the Vercel project environment before production use. If the key is missing, Eve falls back to an offline demo reply so the interface still renders cleanly.

## Product notes

- Eve is now positioned around home admin, digital life management, and household money operations.
- Voice output currently uses the browser speech engine so the app works without committing a secret TTS provider key.
- The robot face changes mood between ready, thinking, speaking, and alert states to make the avatar feel embodied instead of static.
- OAuth, chat, and integrations routes are hardened with session checks, state validation, and payload allowlists.

## Strategy docs

- [Home assistant PRD](docs/rovik-home-assistant-prd.md)
- [12-week execution plan](docs/rovik-home-assistant-12-week-execution-plan.md)
- [Landing page copy](docs/rovik-home-assistant-landing-copy.md)

## Next product upgrades

- Swap browser TTS for a hosted voice model when you have a production voice key.
- Add household memory primitives for people, bills, subscriptions, vendors, devices, and routines.
- Add proactive workflows: morning brief, inbox triage, bills review, and subscription cleanup.
- Add approval states and action history before expanding financial and smart-home actions.
