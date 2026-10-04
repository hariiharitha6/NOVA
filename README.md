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
- **Deterministic risk classification + confirmation (v0.3)** — every command is classified `LOW` / `MEDIUM` / `HIGH` by one policy module before anything runs. `MEDIUM`/`HIGH` actions (starting an app, opening a site NOVA never vetted) are held at a single, token-bound confirmation prompt. Approval is a one-shot opaque token for the exact command shown; there is deliberately no "always allow".
- **Optional local AI interpretation (v0.3, off by default)** — if a command is *not* recognised by the deterministic parser, NOVA can ask a **local** model to name what you meant. The model may only return an intent plus a name; NOVA resolves that name against your own apps, websites and files, classifies it with the same risk policy, and confirms it exactly like a typed command.

### How the optional local AI is bounded

- **Deterministic first.** A command NOVA already understands is *never* sent to a model. Only unrecognised input reaches the interpreter.
- **The AI proposes, NOVA decides.** A model can name an app, site, file, folder or search query. It cannot supply a file path, an executable, a shell command, a URL origin, a protocol, or a risk level — those are not part of the format it is allowed to answer in, and an answer containing them is rejected.
- **Local only, structurally.** The provider must be a loopback address (`127.0.0.1` / `localhost` / `::1`); remote addresses are refused both when saving settings and when building the client, so there is no code path that can send your command text off the machine. No cloud provider, no API key, no telemetry.
- **You provide the model.** NOVA never downloads model weights and never starts a local runtime for you. Point it at a runtime you already run (Ollama-compatible `/api/chat`) and name a model you have installed.
- **Bounded and fail-safe.** Each request is capped (8s by default). If the service is missing, slow, or answers with something unusable, NOVA simply asks for clarification — it never guesses and never executes.

Enable it in **Settings → Local AI interpretation**.

## Privacy

All processing is local-first by design. STT/KWS model binaries are kept locally and excluded from git (the STT encoder exceeds GitHub's 100 MB per-file limit). Download/extract them into `resources/models/` before packaging.

Optional AI interpretation is **off by default** and, when enabled, talks only to a loopback address you configure. The model receives your command text plus a **name-only** listing of your apps, sites and files — never their paths or URLs — and nothing is stored or transmitted anywhere else.

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