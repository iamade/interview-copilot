# Interview Copilot

A discreet, overlay-based AI interview assistant for macOS. Captures the
interviewer's voice (system audio) and/or your screen (LeetCode,
Google Docs, your IDE), feeds both into a vision-capable LLM, and shows
you a clean suggested answer in a small floating window you can
glance at during a live interview.

> **Status:** active development. The Coding mode (screen + audio) was
> hardened on 2026-08-17 to fix a silent failure where macOS Screen
> Recording permission was being denied without any error to the user.

---

## Table of contents

- [What it does](#what-it-does)
- [Features](#features)
- [Modes](#modes)
- [System requirements](#system-requirements)
- [macOS permissions (CRITICAL — read first)](#macos-permissions-critical--read-first)
- [Clone the repo](#clone-the-repo)
- [Install](#install)
- [Configure environment variables](#configure-environment-variables)
- [Run in development](#run-in-development)
- [Build a production app](#build-a-production-app)
- [How to use the app](#how-to-use-the-app)
- [Coding mode: screen + audio (the 2026-08-17 fix)](#coding-mode-screen--audio-the-2026-08-17-fix)
- [Troubleshooting](#troubleshooting)
- [Deploying to another PC](#deploying-to-another-pc)
- [Project structure](#project-structure)
- [License](#license)

---

## What it does

1. **Hears** what the interviewer is saying (system-audio loopback on
   macOS — no microphone needed, no separate setup for the candidate).
2. **Sees** the on-screen problem (LeetCode, Google Docs, your editor,
   etc.) via a single screenshot or a window you pick.
3. **Transcribes** the audio using on-device Whisper (no API key needed)
   or a remote Whisper endpoint.
4. **Asks** a vision-capable LLM (Anthropic Claude Sonnet 5 by default,
   with a long fallback chain through other providers) for a clean,
   interview-ready answer.
5. **Streams** the answer into a small floating overlay you can glance
   at without staring.

The app is designed to be a copilot, not an autopilot. You read the
answer, paraphrase, and answer with your own voice.

---

## Features

- **Two modes:** Interview (audio-only) and Coding (screen + optional
  audio).
- **System-audio capture** via `getDisplayMedia` — picks up the
  interviewer's voice from a Zoom/Meet/Teams call without recording you.
- **On-device Whisper transcription** (faster-whisper running locally
  on `localhost:18799`) — no API key needed, no audio leaves your
  machine.
- **Multimodal LLM** with a 12-step fallback chain (Anthropic →
  OpenClaw Gateway → Ollama cloud → ZAI GLM → Kimi → Gemini → etc.)
  so a single provider outage doesn't break the interview.
- **Stealth overlay** that you can minimize to a pulsing dot, hide
  entirely with `Cmd+Shift+I`, and reposition anywhere on screen.
- **Resume + job-description aware**: the LLM gets your resume, the
  job description, and any prep docs you upload so answers are
  tailored.
- **Encrypted local store** for your prep docs (electron-store).

---

## Modes

### Interview mode (`🎤 Interview`)

- Click **Start Listening** → the app captures system audio
  (interviewer's voice).
- Whisper transcribes chunks every ~10 s.
- When the interviewer finishes a question, click **Answer This** →
  the LLM streams a suggested answer into the overlay.
- Click **Copy** or just read off the overlay.

### Coding mode (`💻 Coding`)

- Click **🎤 Audio** to start capturing the interviewer's voice
  (recommended for LeetCode rounds — they often clarify constraints
  out loud).
- Click **Capture Screen & Solve** to take a screenshot of your
  whole screen, or use the **🪟** window picker to capture just the
  LeetCode / VS Code window.
- The LLM reads the screenshot AND any audio transcript, then streams
  a solution in your selected language.
- Alternatively, paste the problem text and click **Solve Pasted
  Problem** (still splices the live audio in).

---

## System requirements

- **macOS 12+** (Monterey or later). The app uses macOS-specific APIs
  for screen recording and system-audio loopback. It will *run* on
  Windows/Linux but the screen + audio capture paths are not
  tested there.
- **Node.js 24+** (24.15 recommended). The app uses `systemPreferences
  .getMediaAccessStatus` and `desktopCapturer` from Electron 42.
- **npm 10+** (ships with Node 24).
- **Python 3.9+** (only for the on-device Whisper transcription
  server). Optional — if you only use the cloud Whisper endpoint or
  browser speech recognition, Python is not required.
- **~300 MB** disk for `node_modules` + the Whisper model.
- **A working microphone OR system audio device** for the interview
  audio path (most interview setups already have both).

---

## macOS permissions (CRITICAL — read first)

The single most common failure mode on macOS is the system denying
permissions silently. If you skip this section the app will *appear*
to work but capture nothing, and the LLM will say "I can't see any
problem" / "I can't hear anything".

You need to grant **three** permissions to Interview Copilot. The
first time the app needs each one, macOS will pop up a dialog asking
you to allow it. **You must also manually verify in System Settings**
because the pop-up often disappears before you read it.

### 1. Screen Recording (for Coding mode)

1. Open **System Settings → Privacy & Security → Screen Recording**.
2. Click the **+** button and add **Interview Copilot** (or the
   Electron binary if you ran from source).
3. Toggle the switch **on**.
4. **Quit and reopen** the app. macOS only re-checks permissions on
   app launch.

If you skip this, the screenshot will silently come back as a 1x1
black PNG, the LLM will say "I can't see any coding question", and
the new permission banner at the top of Coding mode will tell you
exactly what to fix.

### 2. Microphone (for audio capture)

1. **System Settings → Privacy & Security → Microphone**.
2. Toggle **Interview Copilot** on.
3. **Quit and reopen** the app.

### 3. Accessibility (for the global hotkeys `Cmd+Shift+I` and
`Cmd+Shift+H`)

1. **System Settings → Privacy & Security → Accessibility**.
2. Toggle **Interview Copilot** on.

### Verify permissions are set

You can pre-flight Screen Recording from the Coding mode UI: as soon
as you switch to Coding mode, the app calls
`systemPreferences.getMediaAccessStatus('screen')` and shows an
amber banner at the top if permission is missing. The banner has the
exact menu path to fix it.

---

## Clone the repo

```bash
# Main branch (stable, has the 2026-08-17 fix on top via merge or new commit)
git clone https://github.com/iamade/interview-copilot.git
cd interview-copilot

# OR — fix branch specifically (if you want the exact commit I just shipped)
git clone -b fix/coding-mode-screen-audio https://github.com/iamade/interview-copilot.git
cd interview-copilot
```

> The fix branch (`fix/coding-mode-screen-audio`) was pushed on
> 2026-08-17 with the screen + audio capture P0 fixes. If you cloned
> `main` and need the fix, run:
> ```bash
> git fetch origin fix/coding-mode-screen-audio:fix-csam
> git checkout fix-csam
> ```
> …or just merge it: `git merge fix/coding-mode-screen-audio`.

---

## Install

```bash
# 1. Install Node deps
npm install

# 2. (Optional) Set up on-device Whisper
# The default Whisper endpoint is http://localhost:18799/v1/audio/transcriptions
# and the app ships a Python server in the repo. To run it:
python3 -m venv .venv
source .venv/bin/activate
pip install faster-whisper
python whisper_server.py   # listens on :18799
```

If you don't run the local Whisper server, the app falls back to a
remote Whisper endpoint (set via `OPENAI_API_KEY` in `.env`) or to
browser speech recognition (only works in non-Electron contexts).

---

## Configure environment variables

Create a `.env` file in the project root:

```bash
# ── LLM provider (pick one; the app uses the matching key) ──

# Anthropic Claude (DEFAULT — Sonnet 5 / Frontier)
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI (GPT-5.5, Whisper transcription)
OPENAI_API_KEY=sk-...

# Google Gemini
GEMINI_API_KEY=...

# OpenRouter (auto-routes to any model)
OPENROUTER_API_KEY=sk-or-...

# ZAI / Zhipu GLM
ZAI_API_KEY=...

# Kimi / Moonshot
KIMI_API_KEY=...

# Ollama cloud (uses OLLAMA_API_KEY — NOT OLLAMA_CLOUD_API_KEY)
OLLAMA_API_KEY=...
OLLAMA_ENDPOINT=https://api.ollama.com

# OpenClaw Gateway (local relay; usually http://localhost:18789)
OPENCLAW_GATEWAY_ENDPOINT=http://localhost:18789/v1/chat/completions

# PiAPI (last-resort fallback for gpt-4o-mini)
PIAPI_API_KEY=...

# ── Whisper (optional — only if not running local server) ──
# Set this if you want to use OpenAI's hosted Whisper instead of the
# on-device faster-whisper server.
# OPENAI_API_KEY above is reused for Whisper.
```

**Important:** Each app's `.env` is **self-sufficient**. Do NOT map it
to Tobi's `.env` or another agent's `.env` — copy the keys you need
into this project's `.env` directly.

The app loads the provider list at startup. If a key is missing, the
provider is hidden from the model picker. If all providers fail, the
fallback chain in `llmService.ts` is walked until one succeeds.

---

## Run in development

```bash
npm run dev
```

This starts the Vite dev server (port 5173) for the renderer and
re-compiles the main process on every save. The Electron window
opens automatically with hot-reload.

**Useful dev URLs / shortcuts:**

- `Cmd+Shift+I` — toggle overlay visibility (from anywhere on
  macOS, even when the app is not focused).
- `Cmd+Shift+H` — dim the overlay (make it 30% opacity for 2s).
- `Cmd+R` (inside the overlay) — reload the renderer.
- `Cmd+Option+I` (inside the overlay) — open DevTools.

---

## Build a production app

```bash
npm run build         # builds both renderer (Vite) and main (tsc)
npm start              # runs the built app from dist/
npm run pack           # creates an unpacked Electron app dir
npm run dist           # creates a distributable (.dmg on macOS, .exe
                       # on Windows, .AppImage on Linux)
```

The macOS `.dmg` lands in `dist/`. It is signed with the dev
certificate — for actual distribution you'll need to swap in your
own Apple Developer ID.

**Build artifacts:**

```
dist/
├── main/main.js               # main process bundle
├── renderer/                  # static renderer build (Vite output)
│   ├── index.html
│   └── assets/
└── whisper_server.py          # copied for convenience
```

---

## How to use the app

### First-run setup

1. Launch the app.
2. Go to **⚙ Setup** and fill in:
   - Resume (paste plain text or upload `.txt`/`.md`/`.pdf`).
   - Job description.
   - Stories (STAR-format experiences you'd reference).
   - Programming language for coding mode.
   - Company + role (helps the LLM calibrate).
3. Go to **Settings** and pick your LLM provider + model. The default
   is Anthropic Claude Sonnet 5; switch to a cheaper model for
   practice rounds. There are two engines:
   - **OAuth / Token Plan** — plan-based providers where you buy a
     plan and receive a token (Qwen Token Plan, Ollama Cloud,
     OpenRouter, Featherless).
   - **Direct API** — BYO API key from the provider's dashboard, or
     talk to a local Ollama daemon (Anthropic, OpenAI, Gemini, GLM,
     Kimi, MiniMax, PiAPI, Custom, Ollama Local).

### During an interview

1. Open Zoom/Meet/Teams and the interviewer's call.
2. Open Interview Copilot.
3. **🎤 Interview mode**:
   - Click **Start Listening**.
   - The app captures system audio (you'll see a level meter).
   - When the interviewer finishes a question, click **Answer
     This** (or hit the keyboard shortcut).
   - The LLM streams an answer into the overlay.
   - Click **📋 Copy** if you want to paste it elsewhere.
4. **💻 Coding mode** (for LeetCode rounds):
   - Click **🎤 Audio** to also start capturing the interviewer's
     voice.
   - Click **🪟** to pick the LeetCode window, or just click
     **Capture Screen & Solve** to grab the whole screen.
   - The LLM reads the question + audio and writes a solution.
5. Press `Cmd+Shift+I` to hide the overlay if the interviewer
   glances at your screen; press it again to bring it back.

---

## Coding mode: screen + audio (the 2026-08-17 fix)

This is the P0 fix for the silent failure Ade hit on 2026-08-17.

### What changed

- **Pre-flight permission check.** Switching to Coding mode
  immediately calls
  `systemPreferences.getMediaAccessStatus('screen')`. If macOS
  Screen Recording is not granted, an **amber banner at the top of
  Coding mode** tells you exactly which menu to open. The app
  *no longer* silently sends a 1x1 black PNG to the LLM.
- **Typed capture results.** `takeScreenshot()` and `captureWindow()`
  return a discriminated `CaptureResult` union with a typed error
  (e.g. `permission-denied`) and a user-actionable message. The
  old `ScreenCapture | null` silently returned `null` on the exact
  failure path that broke the LeetCode interview.
- **Interviewer audio capture.** A new **🎤 Audio** toggle starts
  system-audio capture (same path as Interview mode). The audio
  transcript is automatically spliced into the LLM prompt
  alongside the screenshot, so the LLM sees **both** what the
  interviewer *said* and what is *on screen*.
- **Live audio meter + silence warning.** A level meter and a
  5-second silence warning tell you whether the loopback is
  actually picking up sound — so you can fix the wrong-output-device
  or denied-permission problem *before* clicking Capture.
- **Last-transcript preview.** The latest 300 characters of the
  interviewer's voice are shown while you listen, so you can
  confirm audio is working.
- **Manual "Solve Pasted Problem"** also splices the live audio in,
  so a LeetCode problem that didn't OCR cleanly still benefits
  from the spoken context.

### Why this matters

Without the audio, the LLM only sees the static on-screen problem.
The interviewer often clarifies constraints out loud ("ignore
duplicate edges", "your solution should be O(n log n)", "use the
two-pointer approach"). Without capturing those spoken
clarifications, the LLM solves the *literal* problem, not the
*intended* problem. With this fix, the LLM prompt contains:

```
[SCREENSHOT of the LeetCode question]
[TRANSCRIPT of the interviewer's spoken framing / clarifications]
```

…which is what the LLM needs to write a usable solution.

---

## Troubleshooting

### "I can't see any coding question" from the LLM

This is the exact bug the 2026-08-17 fix addresses. Cause:
macOS Screen Recording permission is not granted.

Fix:
1. Open **System Settings → Privacy & Security → Screen
   Recording**.
2. Add **Interview Copilot** and toggle on.
3. **Quit and reopen** the app.
4. Switch to Coding mode — the amber permission banner should
   disappear. If it doesn't, click the `Cmd+Option+I` DevTools
   shortcut and check the console for the permission status.

### "I can't hear anything" / audio level meter is flat

1. Make sure you clicked **🎤 Audio** (not just **Start
   Listening** in Interview mode — that uses a different code
   path).
2. Check **System Settings → Sound → Output** — it should be your
   speakers or headset, not "Display Audio" or a virtual device.
3. Make sure **System Settings → Privacy & Security →
   Microphone** has Interview Copilot toggled on.
4. If the level meter is flat for more than 5 seconds, the app
   shows a "⚠ silent Ns" warning. Click **Stop**, then **🎤
   Audio** again, and re-grant the permission when macOS prompts.

### LLM says "I don't have a key for that provider"

1. Open the project's `.env` and make sure the matching key is
   set (e.g. `ANTHROPIC_API_KEY` for Anthropic).
2. Restart the app — env vars are only loaded at startup.
3. Open **Settings** in the app — if the model picker doesn't
   list the provider, the key is missing or malformed.

### All providers fail and the LLM doesn't answer

Check the DevTools console (`Cmd+Option+I` inside the overlay) —
the fallback chain logs which provider it tried and why each one
failed. Common causes:

- API key expired or revoked (rotate in the provider's console).
- Provider rate-limited (wait 60s or switch provider).
- No internet (the app uses on-device Whisper, but LLM calls
  need network).

### Whisper transcription is empty / garbled

- Make sure the on-device Whisper server is running
  (`python whisper_server.py` in a separate terminal).
- If using the cloud Whisper endpoint, double-check `OPENAI_API_KEY`
  in `.env`.
- The first transcription after switching providers is always
  slower (model warmup). Give it 15 seconds.

### Build fails with "Cannot find module 'electron'"

```bash
rm -rf node_modules package-lock.json
npm install
```

If it still fails, check your Node version (`node -v` must be
24+).

### `electron-rebuild` failures on `better-sqlite3`

```bash
npm install --save-dev @electron/rebuild
npx electron-rebuild -f -w better-sqlite3
```

---

## Deploying to another PC

This is the workflow Ade needs for the 2026-08-17 interview on a
different machine.

### One-time setup on the new PC

1. **Install prerequisites:**
   ```bash
   # macOS
   brew install node@24 python@3.11 git

   # Linux (Debian/Ubuntu)
   sudo apt install -y nodejs npm python3 python3-venv git

   # Windows — install Node 24 LTS from https://nodejs.org/ and
   # Python 3.11+ from https://python.org/, then git from
   # https://git-scm.com/
   ```

2. **Clone the repo** (use the `fix/coding-mode-screen-audio` branch
   so you get the latest screen + audio capture fix):
   ```bash
   git clone -b fix/coding-mode-screen-audio https://github.com/iamade/interview-copilot.git
   cd interview-copilot
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Copy your `.env`** from the original PC into the project root.
   If you don't have a `.env` yet, see
   [Configure environment variables](#configure-environment-variables).

5. **(Optional) Start the on-device Whisper server** in a separate
   terminal:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install faster-whisper
   python whisper_server.py
   ```

6. **Grant the three macOS permissions** BEFORE the first launch —
   see [macOS permissions](#macos-permissions-critical--read-first).
   macOS does not let you grant permissions to a not-yet-running
   app, so the order is: install → grant permissions → launch.

7. **Launch:**
   ```bash
   npm start          # production build + launch
   # OR
   npm run dev        # hot-reload dev mode
   ```

### Daily workflow on the new PC

```bash
cd interview-copilot
git pull                  # pick up any new fixes
npm install               # if package.json changed
npm start                 # launch
```

### Pushing fixes from the new PC back to GH

```bash
git add -A
git commit -m "describe what you changed"
git push origin fix/coding-mode-screen-audio
```

### If you're moving the app between machines frequently

Consider building a signed `.dmg` (`npm run dist`) and copying
that instead of the source. The `.dmg` is self-contained — you
just drag it to Applications and run it. The catch is that each
`.dmg` build re-bundles the local Whisper server, so the
resulting `.dmg` is ~250 MB.

---

## Project structure

```
interview-copilot/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── main.ts              # IPC handlers, window management
│   │   ├── preload.ts           # contextBridge surface
│   │   ├── whisper_server.py    # local faster-whisper server
│   │   └── services/            # main-side services
│   └── renderer/                # React UI (Vite)
│       ├── App.tsx              # root, mode switching
│       ├── components/
│       │   ├── CodingMode.tsx   # screen + audio capture UI
│       │   ├── InterviewMode.tsx
│       │   ├── OverlayHeader.tsx
│       │   ├── SetupPanel.tsx
│       │   └── SettingsPanel.tsx
│       └── services/
│           ├── llmService.ts    # provider ladder + fallback chain
│           ├── audioService.ts  # system-audio capture + Whisper
│           └── screenCaptureService.ts  # screenshot + window picker
├── tsconfig.json                # renderer typecheck
├── tsconfig.main.json           # main process typecheck
├── vite.config.ts
├── package.json
└── README.md
```

---

## License

UNLICENSED — internal People Protocol Inc tool. Do not redistribute.
