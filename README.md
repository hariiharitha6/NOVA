# NOVA — Desktop Command Launcher

A privacy-first floating desktop launcher for Windows built with **Electron + React + TypeScript** (Vite + TailwindCSS + Framer Motion + Zustand).

NOVA is controlled from a small floating dot above the Windows taskbar: type a command, or just say it.

---

## Capabilities (v0.2.0)

- **Windows desktop launcher** — launch applications, websites, files and folders by name (built-in aliases for common apps like Chrome, YouTube, ChatGPT, VS Code, File Explorer, Downloads, Documents, Desktop, plus custom entries, favorites and recents).
- **Local / offline voice control** — push-to-talk and wake-word input are processed entirely on-device with **sherpa-onnx** STT and KWS. No cloud speech services; audio never leaves the machine.
- **Ctrl+J** — open the launcher overlay.
- **Ctrl+Shift+J** — push-to-talk voice input.
- **"Hey NOVA"** wake word — a real, bundled local KWS model detects the default phrase while NOVA is idle and hands off into a fresh STT session.
- **Custom wake phrase configuration** — the phrase is configurable in Settings, but detection is **model-gated**: an arbitrary phrase (e.g. "Hey AJ") is stored in configuration truthfully as unsupported/unenrolled until a matching local KWS model exists. No fake wake-word support.

## Privacy

All processing is local-first by design. STT/KWS model binaries are kept locally and excluded from git (the STT encoder exceeds GitHub's 100 MB per-file limit). Download/extract them into `resources/models/` before packaging.

> **Release gate:** final live-microphone acceptance (say "Hey NOVA" → command capture → app launch) is still awaiting human verification. The automated test suite (wake lifecycle, hand-off, KWS model load, STT model validation) passes.

## Commands

```bash
# Development mode (hot-reload Electron)
npm run dev

# Production build
npm run build

# Tests + typecheck
npm test
npx tsc --noEmit

# Package Windows installer (.exe)
npm run package:win
```