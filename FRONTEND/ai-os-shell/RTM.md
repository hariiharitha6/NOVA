# NOVA — Requirements Traceability Matrix (RTM)

Canonical in-repository RTM for **NOVA (Desktop Core + Voice)**.
Status values: `Planned` · `In Progress` · `Testing` · `Blocked` · `Completed`.

A requirement is marked **Completed** only after its acceptance criteria pass
(spec §22: "Never mark a requirement completed without its acceptance criteria
passing").

---

## Slice 1 — Desktop Shell & Core Launcher (validated)

| Requirement ID | Version | Epic | Requirement | Acceptance Criteria | Priority | Dependencies | Platform | Status |
|---|---|---|---|---|---|---|---|---|
| V01-S1-01 | v0.1 | Desktop Shell | Electron desktop shell with NOVA branding and single-instance handling | App runs as a background process; second launch focuses existing instance | High | None | Windows | Completed |
| V01-S1-02 | v0.1 | Desktop Shell | System tray with Open / Settings / Quit menu | Tray icon appears; menu items work | High | V01-S1-01 | Windows | Completed |
| V01-S1-03 | v0.1 | Desktop Shell | Floating dot window | Small dot visible on screen at startup | High | V01-S1-01 | Windows | Completed |
| V01-S1-04 | v0.1 | Desktop Shell | Drag/reposition the floating dot | Dot follows pointer during drag; click (no drag) toggles overlay | High | V01-S1-03 | Windows | Completed |
| V01-S1-05 | v0.1 | Desktop Shell | Persistent dot position | Dot position restored after restart; clamped to work area | High | V01-S1-04 | Windows | Completed |
| V01-S1-06 | v0.1 | Desktop Shell | Always-on-top dot | Dot stays above other windows | High | V01-S1-03 | Windows | Completed |
| V01-S1-07 | v0.1 | Trigger | Global hotkey default Ctrl+Space | Pressing Ctrl+Space toggles the command overlay | High | V01-S1-01 | Windows | Completed |
| V01-S1-08 | v0.1 | Overlay | Minimal command overlay | Overlay opens from dot/hotkey/tray; input autofocuses; Enter submits; Escape collapses | High | V01-S1-07 | Windows | Completed |
| V01-S1-09 | v0.1 | Command Engine | Deterministic command engine | Text input resolves to typed structured actions only | High | V01-S1-08 | Windows | Completed |
| V01-S1-10 | v0.1 | Apps | Windows application discovery | Installed apps discovered via App Paths + Start Menu without blocking startup | High | V01-S1-01 | Windows | Completed |
| V01-S1-11 | v0.1 | Apps | Launch applications | "Open Chrome" spawns Chrome; overlay collapses after launch | High | V01-S1-09, V01-S1-10 | Windows | Completed |
| V01-S1-12 | v0.1 | Quality | Automated tests pass | `npm test` passes for config, command engine, accelerator, URL | High | All Slice 1 | Windows | Completed |
| V01-S1-13 | v0.1 | Quality | Clean TypeScript | `npx tsc --noEmit` exits 0 | High | All Slice 1 | Windows | Completed |
| V01-S1-14 | v0.1 | Quality | Clean build | `npm run build` succeeds | High | All Slice 1 | Windows | Completed |

## Slice 2 — Settings, Shortcuts, Persistence

| Requirement ID | Version | Epic | Requirement | Acceptance Criteria | Priority | Dependencies | Platform | Status |
|---|---|---|---|---|---|---|---|---|
| V01-S2-01 | v0.1 | Settings | Settings overlay reachable from tray and overlay | Settings opens from tray menu and from the overlay gear button; Escape closes it | High | V01-S1-01 | Windows | Completed |
| V01-S2-02 | v0.1 | Settings | Configurable global hotkey with conflict handling | New hotkey validates, re-registers, persists; failed registration reverts to previous hotkey and notifies | High | V01-S1-07, V01-S1-12 | Windows | Completed |
| V01-S2-03 | v0.1 | Settings | Startup with Windows (optional) | Toggle registers/unregisters Windows login item; preference persists; OS state reflected | High | V01-S1-01 | Windows | Completed |
| V01-S2-04 | v0.1 | Settings | Always-on-top setting | Toggle raises/lowers the dot and persists | High | V01-S1-06 | Windows | Completed |
| V01-S2-05 | v0.1 | Settings | Display selection / floating dot positioning | Displays enumerated; dot moves to selected display; position persists; safe fallback when display removed | High | V01-S1-05 | Windows | Completed |
| V01-S2-06 | v0.1 | Settings | Favorites | Star/unstar apps; state persists; favorites shown in overlay and launch on click | High | V01-S1-11 | Windows | Completed |
| V01-S2-07 | v0.1 | Settings | Custom applications | Pick `.exe`; name shown; remove; persists; launches from overlay | High | V01-S1-11 | Windows | Completed |
| V01-S2-08 | v0.1 | Settings | Website shortcuts | Add name+URL; URL validated/normalized; remove; persists; opens via structured OPEN_WEBSITE action | High | V01-S1-09, V01-S1-12 | Windows | Completed |
| V01-S2-09 | v0.1 | Settings | File shortcuts | Pick file; remove; persists; opens via structured OPEN_FILE action | High | V01-S1-09 | Windows | Completed |
| V01-S2-10 | v0.1 | Settings | Folder shortcuts | Pick folder; remove; persists; opens via structured OPEN_FOLDER action | High | V01-S1-09 | Windows | Completed |
| V01-S2-11 | v0.1 | Settings | Default Windows folder shortcuts | Downloads/Documents/Desktop seeded once via OS path APIs; not duplicated on later launches; removable by user | High | V01-S2-10 | Windows | Completed |
| V01-S2-12 | v0.1 | Persistence | Configuration persistence via ConfigStore | All settings persist through the single ConfigStore; corrupt/missing/partial config recovers safely; unknown patch keys rejected | High | V01-S1-12 | Windows | Completed |
| V01-S2-13 | v0.1 | Registry | Live registry updates | Adding a website, file, or folder is usable immediately without restart (registry cache invalidation) | High | V01-S2-08, V01-S2-09, V01-S2-10 | Windows | Completed |
| V01-S2-14 | v0.1 | Recents | Recent applications | Recents update after launch, dedupe, cap at 10, persist, appear in overlay | Medium | V01-S1-11 | Windows | Completed |
| V01-S2-15 | v0.1 | Security | IPC validation & minimal preload API | contextIsolation on, nodeIntegration off, payloads validated, patches whitelisted, no unrestricted Node access | High | V01-S1-09 | Windows | Completed |
| V01-S2-16 | v0.1 | Launcher | Safe launcher | Structured spawn / shell.openPath / shell.openExternal only; no `cmd /c start`; no arbitrary shell strings | High | V01-S1-09 | Windows | Completed |

## Packaging & Release

| Requirement ID | Version | Epic | Requirement | Acceptance Criteria | Priority | Dependencies | Platform | Status |
|---|---|---|---|---|---|---|---|---|
| V01-R-01 | v0.1 | Packaging | Windows installer/executable | `npm run package:win` produces the NSIS installer; packaged binary launches | High | All v0.1 | Windows | Completed |
| V01-R-02 | v0.1 | Release | v0.1 exit gate | Manual exit-gate sequence (spec §20/§26) passes end to end | High | All v0.1 | Windows | Completed |

## v0.2 Slice 1 — Voice Input (PTT)

| Requirement ID | Version | Epic | Requirement | Acceptance Criteria | Priority | Dependencies | Platform | Status |
|---|---|---|---|---|---|---|---|---|
| V02-S1-001 | v0.2 | Voice | SpeechRecognizer abstraction | `SpeechRecognizer` interface defined with `initialize()`, `start()`, `acceptAudio()`, `partialTranscript()`, `finishAndGetTranscript()`, `cancel()`, `dispose()`. All voice logic depends only on this interface; no sherpa-onnx imports outside `sherpa-recognizer.ts`. | High | None | Cross-platform | Completed |
| V02-S1-002 | v0.2 | Voice | sherpa-onnx streaming recognizer | `SherpaSpeechRecognizer` implements `SpeechRecognizer` using `sherpa-onnx` WASM. Lazy-loads `require('sherpa-onnx')` on first `initialize()`. Creates online transducer recognizer with greedy search and endpoint detection. Validates all 4 model files exist before initializing. | High | V02-S1-001 | Windows | Completed |
| V02-S1-003 | v0.2 | Voice | Local streaming English model | Streaming zipformer English model (`sherpa-onnx-streaming-zipformer-en-2023-06-21`, see `MODEL_NAME` in `electron/core/speech/constants.ts`) with 4 required files (encoder, decoder, joiner `.int8.onnx` + `tokens.txt`) present under `resources/models/`. Model resolved via `resolveModelDir()` which handles both dev and packaged paths. The large model binaries are gitignored (`resources/models/`) and must be downloaded/extracted locally before packaging. | High | V02-S1-002 | Windows | Completed |
| V02-S1-004 | v0.2 | Voice | Microphone capture | Renderer captures mic via `navigator.mediaDevices.getUserMedia({ audio: true })`. Creates 16 kHz `AudioContext`, feeds `ScriptProcessorNode` chunks (4096 samples) as `Float32Array` to main process via IPC `nova:voice-audio`. Capture auto-stops when listening phase ends or component unmounts. Mic errors reported via `nova:voice-mic-error`. | High | V02-S1-001 | Windows | Completed |
| V02-S1-005 | v0.2 | Voice | Push-to-Talk toggle | Default PTT hotkey `Control+Shift+Space` registered globally. Pressing while idle starts listening; pressing while listening stops and executes. Hotkey is configurable in Settings with conflict detection and revert on failure. Independent of overlay hotkey (`Control+Space`). | High | V02-S1-001 | Windows | Completed |
| V02-S1-006 | v0.2 | Voice | Voice state machine | `VoiceController` manages phases: `idle → listening → processing → success/error → idle`. Transitions: PTT toggles `idle→listening` and `listening→processing`; inactivity timeout (8s silence) or max timeout (15s) auto-finalizes; Escape cancels to idle; mic error aborts to idle; `success/error` auto-returns to idle after 2s display. PTT ignored during `processing`. | High | V02-S1-001, V02-S1-002 | Windows | Completed |
| V02-S1-007 | v0.2 | Voice | Partial/final transcript | Partial transcript updated on each `acceptAudio()` cycle via `recognizer.partialTranscript()`. Final transcript produced by `recognizer.finishAndGetTranscript()` when listening stops. Both broadcast to renderer via `nova:voice-state` IPC with `partial` and `transcript` fields. | High | V02-S1-002, V02-S1-006 | Windows | Completed |
| V02-S1-008 | v0.2 | Voice | Voice → shared command pipeline | Voice transcripts pass through the same `executeCommand()` function as typed commands. Voice controller receives `executeCommand` closure wrapping `command-pipeline.ts`. Identical command parsing, resolution, and launch behavior for voice and typed input. Max input 200 chars enforced. | High | V02-S1-007 | Windows | Completed |
| V02-S1-009 | v0.2 | Voice | Voice indicator | `VoiceIndicator` component renders in the floating dot window. Returns `null` when idle (plain dot visible). Listening: pulsing purple mic bubble with partial transcript. Processing: animated dots with final transcript. Success: green checkmark with message. Error: red X with message. Uses `AnimatePresence` for transitions. | Medium | V02-S1-006 | Windows | Completed |
| V02-S1-010 | v0.2 | Voice | Voice settings | Settings panel includes Voice section with: toggle for `voiceEnabled`, PTT hotkey recorder with conflict detection, info text about offline model. Config changes persist via `ConfigStore`. `voiceEnabled` change dynamically registers/unregisters PTT hotkey and Escape cancel. `pttHotkey` change re-registers hotkey with validation. | High | V02-S1-005 | Windows | Completed |
| V02-S1-011 | v0.2 | Voice | Voice disabled by default | `voiceEnabled` defaults to `false` in `ConfigStore`. On fresh install, no mic access requested, no PTT hotkey registered, no WASM loaded. Voice becomes active only after user explicitly enables it in Settings. | High | V02-S1-010 | Windows | Completed |
| V02-S1-012 | v0.2 | Voice | Timeout/cancellation/error handling | Hard max 15s listening cap. 8s inactivity (no transcript change) auto-finalizes. Escape cancels active session and returns to idle. Mic errors (permission denied, device unavailable) captured and displayed, auto-return to idle after 2s. Model file missing throws descriptive error. Graceful degradation on all failure paths — never crashes. | High | V02-S1-006 | Windows | Completed |
| V02-S1-013 | v0.2 | Voice | Automated tests | `voice-controller.test.ts` covers: PTT ignored when disabled, lazy engine init, partial transcripts, empty speech flush, successful transcript execution through shared pipeline, clarification error, mic error abort, Escape cancel, `setEnabled(false)` disposal, PTT ignored during processing. All 60/60 tests pass. | High | V02-S1-006, V02-S1-008 | Windows | Testing |
| V02-S1-014 | v0.2 | Voice | Packaged model/resource support | `model-resolver.ts` resolves dev path (`resources/models/<name>`) and packaged path (`process.resourcesPath/app.asar.unpacked/resources/models/<name>`). `package.json` electron-builder config: `files` includes `resources/**/*`; `asarUnpack` includes `node_modules/sherpa-onnx/**/*` and `resources/models/**/*`. Both WASM binaries and model files extracted outside ASAR at runtime. | High | V02-S1-003 | Windows | Testing |

## v0.2 Slice 2 — Voice Command Coverage

| Requirement ID | Version | Epic | Requirement | Acceptance Criteria | Priority | Dependencies | Platform | Status |
|---|---|---|---|---|---|---|---|---|
| V02-S2-001 | v0.2 | Voice | Voice transcripts execute through shared pipeline | Voice final transcripts resolve through the same `executeCommand()` → `resolveCommand()` → `Launcher` pipeline as typed commands. Identical behavior for the same input text. No separate voice command engine. | High | V02-S1-008 | Cross-platform | Completed |
| V02-S2-002 | v0.2 | Voice | Application launch by voice | Voice "Open Chrome", "Open Visual Studio Code", "Open File Explorer" resolve to the correct applications through the command engine. | High | V02-S2-001 | Windows | Completed |
| V02-S2-003 | v0.2 | Voice | Website launch by voice | Voice "Open YouTube", "Open ChatGPT" resolve to the correct websites through the command engine. | High | V02-S2-001 | Cross-platform | Completed |
| V02-S2-004 | v0.2 | Voice | Folder open by voice | Voice "Open Downloads", "Open Documents", "Open Desktop" resolve to the correct folders through the command engine. | High | V02-S2-001 | Windows | Completed |
| V02-S2-005 | v0.2 | Voice | Custom entry launch by voice | User-added custom applications, websites, and folders are launchable by voice through the same registry snapshot. | High | V02-S2-001 | Windows | Completed |
| V02-S2-006 | v0.2 | Voice | File open by voice | User-added file shortcuts are openable by voice through the command engine. | High | V02-S2-001 | Windows | Completed |
| V02-S2-007 | v0.2 | Voice | Favorite invocation by voice | Voice can invoke any app/website/file/folder that is also a favorite. Favorites use app IDs internally; voice resolves by name. | Medium | V02-S2-001 | Windows | Completed |
| V02-S2-008 | v0.2 | Voice | Well-known app aliases | `AppRegistry` merges legitimate product aliases (e.g. "VS Code" for "Visual Studio Code", "Explorer" for "File Explorer") into discovered apps. Aliases work for both typed and voice input. | Medium | V02-S2-001 | Cross-platform | Completed |
| V02-S2-009 | v0.2 | Voice | Final-only transcript execution | Only `finishAndGetTranscript()` (final) transcripts execute commands. Partial transcripts are displayed in the UI but never sent to `executeCommand()`. | High | V02-S1-007 | Cross-platform | Completed |
| V02-S2-010 | v0.2 | Voice | Duplicate execution prevention | Session ID guard ensures stale sessions cannot execute. PTT ignored during `processing` phase. Multiple rapid PTT toggles do not cause duplicate command execution. | High | V02-S2-009 | Cross-platform | Completed |
| V02-S2-011 | v0.2 | Voice | Empty transcript handling | Empty or whitespace-only transcripts return to idle without executing any command. No error displayed for silence. | Medium | V02-S2-009 | Cross-platform | Completed |
| V02-S2-012 | v0.2 | Voice | Unknown command handling | Unknown voice commands use the existing command-engine clarification behavior. No voice-specific error system. | Medium | V02-S2-001 | Cross-platform | Completed |
| V02-S2-013 | v0.2 | Voice | Launcher failure handling | Failed launches use the existing launcher failure handling. Voice never crashes NOVA. Error state auto-returns to idle. | High | V02-S2-001 | Cross-platform | Completed |
| V02-S2-014 | v0.2 | Voice | Typed commands unaffected | Keyboard/mouse commands continue to work identically after voice command coverage is added. No regression in v0.1 functionality. | High | V02-S2-001 | Cross-platform | Completed |
| V02-S2-015 | v0.2 | Voice | Voice command automated tests | `voice-commands.test.ts` covers: 26 command-engine resolution tests (apps, websites, folders, files, custom entries, aliases, edge cases) + 12 voice-controller integration tests (final-only, dedup, empty, unknown, failure, disabled, typed, PTT guard, session guard, cancel, mic error, timeouts). All 119/119 tests pass. | High | V02-S2-001, V02-S2-009 | Cross-platform | Completed |
| V02-S2-016 | v0.2 | Voice | Clean TypeScript | `npx tsc --noEmit` exits 0 after Slice 2 changes. | High | All Slice 2 | Cross-platform | Completed |
| V02-S2-017 | v0.2 | Voice | Clean build | `npm run build` succeeds after Slice 2 changes. | High | All Slice 2 | Cross-platform | Completed |

## v0.2 Slice 3A — Royal Identity, Shortcuts & Performance

| Requirement ID | Version | Epic | Requirement | Acceptance Criteria | Priority | Dependencies | Platform | Status |
|---|---|---|---|---|---|---|---|---|
| V02-S3A-001 | v0.2 | Identity | Royal visual theme | Royal purple/gold design tokens (`.nova-*` CSS variables) define bg, surface, accent, border, glow across `index.css` and `tailwind.config.js`; applied to glass surfaces, hover/focus states, and typography. Minimal, premium, dark, royal, futuristic. | High | None | Windows | Completed |
| V02-S3A-002 | v0.2 | Identity | New NOVA logo | `NovaLogo` SVG component renders the royal diamond mark; used by the floating dot, overlay header, and settings header. | High | V02-S3A-001 | Cross-platform | Completed |
| V02-S3A-003 | v0.2 | Identity | Hidden A/J monogram in logo | The logo geometry carries a negative-space ligature of the initials A·J under a four-point nova spark; discoverable, never spelled out. | Medium | V02-S3A-002 | Cross-platform | Completed |
| V02-S3A-004 | v0.2 | Identity | New Windows application icon | `resources/icons/nova.ico` generated from the same geometry as the logo; used as the Windows app icon, installer icon, and uninstaller icon (electron-builder.yml + package.json). | High | V02-S3A-002 | Windows | Testing |
| V02-S3A-005 | v0.2 | Identity | New tray icon | `resources/tray.png` regenerated (32px) from the logo geometry; loaded by the tray. | High | V02-S3A-002 | Windows | Testing |
| V02-S3A-006 | v0.2 | Identity | Floating dot redesign | The floating dot renders the NOVA logo (not a legacy gradient circle) with minimal royal glow/breathe; idle/hover states preserved. | High | V02-S3A-001, V02-S3A-002 | Windows | Testing |
| V02-S3A-007 | v0.2 | Identity | Listening animation | VoiceIndicator shows a pulsing royal mic bubble with partial transcript while listening. | Medium | V02-S1-009 | Cross-platform | Completed |
| V02-S3A-008 | v0.2 | Identity | Processing animation | VoiceIndicator shows an animated processing state with the final transcript. | Medium | V02-S1-009 | Cross-platform | Completed |
| V02-S3A-009 | v0.2 | Identity | Success/error animation | VoiceIndicator shows a green success check or red error X with a message; auto-returns to idle. | Medium | V02-S1-009 | Cross-platform | Completed |
| V02-S3A-010 | v0.2 | Shortcuts | Default NOVA shortcut = Control+J | Fresh installs default to `Control+J` to open/toggle NOVA. | High | None | Cross-platform | Completed |
| V02-S3A-011 | v0.2 | Shortcuts | Default voice shortcut = Control+Shift+J | Fresh installs default to `Control+Shift+J` for voice PTT. Single canonical default constant. | High | None | Cross-platform | Completed |
| V02-S3A-012 | v0.2 | Shortcuts | Configurable shortcuts + migration | `migrateShortcutDefaults()` runs once at startup, migrating exact legacy defaults (Ctrl+Space family) to the new defaults, never overwriting custom choices; `shortcutsMigratedV2` guards idempotence. `decideShortcutChange()` rejects overlay/PTT collisions in Settings. | High | V02-S3A-010, V02-S3A-011 | Cross-platform | Completed |
| V02-S3A-013 | v0.2 | Performance | Faster overlay opening | Overlay window is kept alive and shown/hidden instead of recreated on each open, reducing perceived latency. | Medium | V01-S1-08 | Windows | Testing |
| V02-S3A-014 | v0.2 | Performance | App discovery caching/performance | AppRegistry caches the registry snapshot and invalidates on config changes; avoid stale-while-revalidate churn. | Medium | V01-S1-10 | Cross-platform | Completed |
| V02-S3A-015 | v0.2 | Performance | Voice startup/latency optimization | Voice engine and WASM load lazily on first use; PTT hotkey registered only when voice enabled; WASM single-threaded; NOVA startup stays fast (no 180MB preload). | Medium | V02-S1-001 | Cross-platform | Completed |
| V02-S3A-016 | v0.2 | Accessibility | Reduced-motion preservation | `prefers-reduced-motion: reduce` disables all `nova-anim-*` and trims transitions; keyboard/focus states preserved. | High | V02-S3A-001 | Cross-platform | Completed |
| V02-S3A-017 | v0.2 | Quality | v0.1/v0.2 regression protection | App discovery, launching, websites, files, folders, favorites, recents, typed/voice commands, PTT, Escape, settings, startup, always-on-top, tray, and position persistence all continue to work. | High | All Slice 3A | Cross-platform | Testing |
| V02-S3A-018 | v0.2 | Documentation | RTM documentation | This Slice 3A section records all requirements, acceptance criteria, and honest statuses. | High | All Slice 3A | Cross-platform | Completed |

---

## Legend

- **V01-S1-*** — v0.1 Slice 1 (desktop core). Manually validated by the user.
- **V01-S2-*** — v0.1 Slice 2 (settings, shortcuts, persistence, security).
- **V01-R-*** — v0.1 Packaging and release.
- **V01-R-02 (exit gate)** is **Completed**: the full manual exit-gate sequence
  (interactive NSIS install/uninstall, packaged launch, settings, shortcuts,
  persistence, favorites) was performed by a human and all acceptance tests
  passed.
- **V02-S1-*** — v0.2 Slice 1 (voice input via PTT). Automated tests pass;
  manual exit gate **Testing** — awaiting human verification.
- **V02-S2-*** — v0.2 Slice 2 (voice command coverage). Automated tests pass;
  manual exit gate **Testing** — awaiting human verification.
- **V02-S3A-*** — v0.2 Slice 3A (royal identity, shortcuts, performance).
  Automated tests pass and TypeScript/build are clean; requirements requiring
  visual/runtime verification (icons, dot, overlay latency, regression) are
  **Testing** — awaiting human verification.
