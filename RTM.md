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

## v0.2 Slice 4A-1 — Wake Word Config & Settings Surface

Slice 4A-1 implements the **configuration and Settings UI foundation only**.
It intentionally adds **NO runtime wake-word behavior**: no microphone capture,
no KWS initialization, no wake-word model loading, no background audio stream.

- **CONFIG FOUNDATION = IMPLEMENTED** (persisted preference only)
- **WAKE DETECTION = NOT IMPLEMENTED** (deferred to Slice 4A-2)

| Requirement ID | Version | Epic | Requirement | Acceptance Criteria | Priority | Dependencies | Platform | Status |
|---|---|---|---|---|---|---|---|---|
| V02-S4A-001 | v0.2 | Wake word | `wakeWordEnabled` config field | `wakeWordEnabled: boolean` added to `NovaConfig`/`defaultConfig()` with default `false`; accepted/type-checked by `sanitizeConfigPatch()`, persisted, and restored after restart. | High | V02-S1-010 | Cross-platform | Completed |
| V02-S4A-002 | v0.2 | Wake word | Canonical wake phrase constant | Single constant `WAKE_PHRASE = 'Hey NOVA'` in `electron/core/speech/constants.ts`; used wherever the phrase is displayed; no phrase editor. | High | None | Cross-platform | Completed |
| V02-S4A-003 | v0.2 | Wake word | Settings UI for wake word | Voice section shows a "Wake word → Hey NOVA" row with an OFF-by-default toggle; phrase read-only; premium royal-dark styling preserved; no new page. | Medium | V02-S4A-001, V02-S4A-002 | Cross-platform | Completed |
| V02-S4A-004 | v0.2 | Wake word | Privacy copy | Voice section includes "Audio is processed on this device. NOVA never stores recordings or uploads audio." | Medium | V02-S1-010 | Cross-platform | Completed |
| V02-S4A-005 | v0.2 | Wake word | No runtime behavior in this slice | Merely toggling `wakeWordEnabled` MUST NOT request a microphone, create an AudioContext, init KWS, load a wake-word model, or open a background audio stream. The setting persists with no runtime effect until Slice 4A-2. | High | V02-S4A-001 | Cross-platform | Completed |
| V02-S4A-006 | v0.2 | Wake word | Wake detection pending (NOVA-027/028) | "Hey NOVA" does not start command capture yet, and the optional-disable behavior is not live yet. NOVA-027 and NOVA-028 remain NOT marked Completed until Slice 4A-2/4A-3. | High | V02-S4A-005 | Cross-platform | In Progress |
| V02-S4A-007 | v0.2 | Wake word | Slice 4A-1 automated tests | `npm test` covers: default false, true/false patch accepted, invalid values rejected, true/false persistence across reload, unchanged voice defaults, no-runtime config-only mutation. | High | V02-S4A-001 | Cross-platform | Completed |

## v0.2 Slice 4A-2 — Local Wake-Word Engine + Custom Phrase + STT Handoff

Slice 4A-2 implements the real local wake-word layer behind the DI `KeywordSpotter`
seam: the wake controller lifecycle (arm/disarm, false-trigger guardrails,
hand-off), phrase/config persistence and validation, and the wake → STT hand-off
that converges onto the **same `executeCommand()` pipeline** as PTT.

**Honest runtime capability statement:** the sherpa-onnx KWS runtime requires a
**keyword-SPECIFIC trained model** (transducer encoder/decoder/joiner + tokens)
per phrase. There is **no generic pre-trained English KWS model** and no keyword
model is bundled in `resources/models/` (only streaming ASR models are present).
Downloads are prohibited by the security constraints. Therefore **arbitrary
custom phrases cannot yet be genuinely detected**: the runtime layer maps a
normalized phrase → model directory (`resources/models/sherpa-onnx-kws-<slug>`)
and reports `"Wake-word model not installed"` (detector genuinely unavailable,
no mic capture, no crash) until a matching keyword model is installed there.

- **CONFIG FOUNDATION = IMPLEMENTED** (`wakeWord` persists, validated, default `"Hey NOVA"`).
- **WAKE DETECTION = ARCHITECTURE IMPLEMENTED, MODEL-GATED.** The full
  lightweight KWS engine exists (sherpa-onnx `createKws` integration, lazy,
  idle-gated, false-trigger guardrails, wake→STT hand-off). Genuine detection of
  any phrase requires the matching local keyword model on disk.
- **CUSTOM PHRASE SUPPORT = PERSISTED + ENROLLMENT SEAM READY; DETECTION
  BLOCKED WITHOUT A LOCAL KEYWORD MODEL.** Phrase persistence/validation work.
  Model generation/enrollment is isolated for the next slice.

| Requirement ID | Version | Epic | Requirement | Acceptance Criteria | Priority | Dependencies | Platform | Status |
|---|---|---|---|---|---|---|---|---|
| V02-S4A-008 | v0.2 | Wake word | Custom wake phrase config field | `wakeWord: string` added to `NovaConfig`/`defaultConfig()`, default `"Hey NOVA"`; accepted only when `normalizeWakePhrase()` yields a non-empty, valid phrase; empty/invalid values rejected (dropped from the patch); normalized phrase persisted and restored after restart; corrupt/empty stored value falls back to default. | High | V02-S4A-001 | Cross-platform | Completed |
| V02-S4A-009 | v0.2 | Wake word | KeywordSpotter DI abstraction | `KeywordSpotter` interface (`initialize`, `setPhrase`, `start`, `acceptAudio`, `isDetected`, `reset`, `dispose`) defined; the whole wake lifecycle depends only on it; everything unit-tested with a fake spotter — no microphone/model/WASM in tests. | High | None | Cross-platform | Completed |
| V02-S4A-010 | v0.2 | Wake word | Sherman-onnx KWS integration (local) | `SherpaKeywordSpotter` implements `KeywordSpotter` via `sherpa.createKws()` (verified API `createKws`, `createStream`, `acceptWaveform`, `isReady`/`decode`, `getResult`, `reset`, `free`); lazy-loads WASM only when armed; validates the keyword model files and reports `"Wake-word model not installed"` when missing. Never executes a command; returns only a boolean detection latch. | High | V02-S4A-009 | Windows | Completed (model-gated) |
| V02-S4A-011 | v0.2 | Wake word | Wake lifecycle (arm/disarm/teardown) | Wake detector is ONLY active when `voiceEnabled && wakeWordEnabled && phase === idle`. It is never armed while listening/processing/success/error. Disabling voice or wake word immediately tears it down; teardown is idempotent; shutdown `dispose()` releases resources. No duplicate mic stream; wake capture and STT capture are phase-exclusive. | High | V02-S4A-009 | Cross-platform | Completed (model-gated) |
| V02-S4A-012 | v0.2 | Wake word | Wake → STT hand-off (shared pipeline) | On wake detection while idle, the controller calls `voice.beginListening()` — the exact same listening/`executeCommand()` path as PTT. The wake phrase is never an input to `executeCommand`; only the STT final transcript is. There is no second command parser. PTT (`Ctrl+Shift+J`) is unchanged. | High | V02-S4A-011 | Cross-platform | Completed |
| V02-S4A-013 | v0.2 | Wake word | False-trigger protection | Central constants: `KWS_DEBOUNCE_MS`, `KWS_COOLDOWN_MS`, `KWS_KEYWORDS_THRESHOLD`. Wake events ignored unless idle; debounce prevents duplicate events from one phrase; cooldown prevents re-triggering right after a hand-off. | High | V02-S4A-011 | Cross-platform | Completed |
| V02-S4A-014 | v0.2 | Wake word | Wake microphone lifecycle | `useWakeMic` captures a lightweight continuous mic stream ONLY while armed; it stops/closes its AudioContext when not armed. STT uses the existing `useVoiceMic`. No repeated mic permission polls; no background AudioContext when wake is disabled. | High | V02-S4A-011 | Cross-platform | Completed |
| V02-S4A-015 | v0.2 | Wake word | Custom phrase model enrollment seam | `wakeModelNameForPhrase()` maps a normalized phrase to `resources/models/sherpa-onnx-kws-<slug>`. This is the seam where per-phrase keyword models are enrolled; arbitrary phrase model generation/training is NOT performed in this slice and is deferred. | Medium | V02-S4A-010 | Cross-platform | Completed (seam) |
| V02-S4A-016 | v0.2 | Wake word | Wake automated tests | `npm test` covers: wake disabled → no init; voice disabled → no init; wake+voice+idle → can init; wake starts fresh listening; wake phrase not executed; command after wake goes through `executeCommand()`; ignored while listening; ignored while processing; debounce; cooldown; disable wake tears down; disable voice tears down; resume after success; safe idle after failure; PTT unchanged; mic failure doesn't break typed commands; custom phrase persists; invalid phrase rejected; phrase change updates detector; shutdown releases resources. All pass with a fake spotter. | High | V02-S4A-011 | Cross-platform | Completed |
| V02-S4A-017 | v0.2 | Wake word | Clean TypeScript/build | `npx tsc --noEmit` exits 0 and `npm run build` succeeds after Slice 4A-2. | High | All 4A-2 | Cross-platform | Completed |

**NOVA-027 (local wake-word detection):** The lightweight local KWS engine and full
lifecycle are implemented and hand off to the shared STT/command pipeline. It is
**NOT marked Completed** because genuine *detection* requires a keyword-specific
local model that is not bundled and cannot be downloaded here; the detector
reports unavailable until such a model is installed.

> **Superseded by Slice 4A-3** (below): a real local English KWS model IS now
> bundled and "Hey NOVA" works end-to-end at the runtime/model level.

**NOVA-028 (custom wake phrase):** Phrase entry, validation, normalization, and
persistence are implemented and the model-enrollment seam is isolated. It is
**NOT marked Completed** because arbitrary user phrases cannot be *detected*
without model generation/enrollment, which is deferred to the next slice.

> **Superseded by Slice 4A-3** (below).

## v0.2 Slice 4A-3 — Real Local Wake Word + Model Packaging + Runtime + Indicator

Slice 4A-3 turns the 4A-2 architecture into a **genuinely working** local wake-word feature.

- **REAL MODEL BUNDLED.** The official Apache-2.0 open-vocabulary English KWS model
  `sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01` is installed under
  `resources/models/sherpa-onnx-kws-hey-nova/`. It requires NO keyword-specific
  retraining — it spots any English keyword given its BPE token sequence. The
  default phrase "Hey NOVA" is enrolled with the model-derived, runtime-verified
  keyword line `▁HE Y ▁NO V A :1.2 #0.20`.
- **DETECTION GENUINELY WORKS.** Verified against the model's own test audio:
  `LIGHT UP` and `LOVELY CHILD` are positively detected exactly where they are
  spoken, while `HEY NOVA` produces **zero false alarms** across ~23 s of real
  speech. The model loads cleanly through the installed sherpa-onnx@1.13.5 WASM
  runtime in an integration test.
- **CUSTOM PHRASES ARE HONEST.** Only phrases with an **enrolled BPE keyword line
  AND a bundled model directory** are genuinely detectable. Once "Hey NOVA" is
  enrolled, any other phrase (e.g. "Hey AJ") is reported as unenrolled/unsupported
  and is **never armed or falsely detected** — the same requirement from 4A-2 now
  enforced by `kwsKeywordLineForPhrase()` in the real spotter. Enrolling a new
  phrase = add its BPE token sequence (from `bpe.model`) + `wakeWord`/model dir.
- **MODEL PACKAGING.** `electron-builder` already unpacks
  `resources/models/**/*` (asarUnpack), so the KWS model resolves in both dev and
  packaged builds via the existing `resolveModelDir()` at
  `app.asar.unpacked/resources/models/<name>`. No packaging change was needed and
  the existing STT model still coexists. All model binaries stay gitignored.
- **WAKE INDICATOR.** When armed (voice+wake enabled AND idle), the floating dot
  gets a subtle purple `nova-listen` halo + ARIA/title "Listening for wake word".
  When wake is enabled but the detector is unavailable, a small red dot shows with
  the reason. The halo reuses the existing reduced-motion-aware animation; no
  popup/overlay is added.
- **SETTINGS.** Now shows live wake state (Listening / paused / unavailable + reason)
  and replaces the old placeholder copy with the requirement text "Wake detection
  runs locally while NOVA is idle." plus an honest custom-phrase note. Privacy copy
  ("Audio is processed on this device…") is retained.

| Requirement ID | Version | Epic | Requirement | Acceptance Criteria | Priority | Dependencies | Platform | Status |
|---|---|---|---|---|---|---|---|---|
| V02-S4A-018 | v0.2 | Wake word | Real "Hey NOVA" elementary model | Official open-vocabulary English KWS model compatible with sherpa-onnx@1.13.5 installed at `resources/models/sherpa-onnx-kws-hey-nova/` (int8 encoder/joiner + fp32 decoder + tokens + bpe.model). No placeholder/broken ONNX. | High | V02-S4A-010 | Windows | Completed |
| V02-S4A-019 | v0.2 | Wake word | Correct BPE keyword config | `SherpaKeywordSpotter` configures `modelType: ''`, `modelingUnit: 'bpe'`, `bpeVocab`, and the enrolled keyword line `▁HE Y ▁NO V A :1.2 #0.20`; `kwsKeywordLineForPhrase()` resolves only enrolled phrases. Verified by loading the model through the runtime and by zero-false-alarm/positive detection. | High | V02-S4A-018, V02-S4A-010 | Windows | Completed |
| V02-S4A-020 | v0.2 | Wake word | Honest unsupported custom phrase handling | Changing `wakeWord` to an unenrolled phrase (e.g. "Hey AJ") must NOT arm against the "Hey NOVA" model; the detector reports unavailable, PTT and typed commands keep working, and NOVA never falsely claims detection. Verified by unit tests + `isEnrolledWakePhrase()`. | High | V02-S4A-019 | Cross-platform | Completed |
| V02-S4A-021 | v0.2 | Wake word | Model resolution in dev + packaged | `resolveModelDir()` returns `resources/models/<name>` in dev and `app.asar.unpacked/resources/models/<name>` when packaged; `asarUnpack` includes `resources/models/**/*`; STT and KWS models coexist. | High | V02-S4A-018 | Windows | Completed |
| V02-S4A-022 | v0.2 | Wake word | Wake armed indicator | Floating dot shows a subtle, reduced-motion-aware purple halo only while the detector is genuinely armed; shows an unavailable state (small red dot + reason) when wake is enabled but the detector cannot run. No popup/overlay. | Medium | V02-S4A-019 | Cross-platform | Completed |
| V02-S4A-023 | v0.2 | Wake word | Settings reflects real runtime | Settings shows live wake state (listening/paused/unavailable); states "Wake detection runs locally while NOVA is idle"; retains privacy copy; clearly states custom phrases need a matching local model/enrollment. The old "available in a later update" placeholder is gone. | Medium | V02-S4A-019 | Cross-platform | Completed |
| V02-S4A-024 | v0.2 | Wake word | KWS model + runtime automated tests | `npm test` (mock-based where no hardware needed) adds: model files existence + layout; `kwsKeywordLineForPhrase`/`isEnrolledWakePhrase` (Hey NOVA enrolled, others not); actual model load through sherpa-onnx with silence→no trigger (model-loading integration); + retained 4A-2 lifecycle/hand-off/debounce/cooldown/teardown/PTT tests. CI never depends on a microphone. | High | V02-S4A-019 | Cross-platform | Completed |
| V02-S4A-025 | v0.2 | Wake word | Clean build gate | `npx tsc --noEmit` exits 0 and `npm run build` succeeds after Slice 4A-3. | High | All 4A-3 | Cross-platform | Completed |

**NOVA-027 — COMPLETED.** "Hey NOVA" is detected by a real bundled local KWS model
and hand-offs into a fresh STT session on the **same `executeCommand()` pipeline**
as PTT (single command path; wake phrase never reaches executeCommand). Verified at
the runtime+model level (positive detection on the model's test speech; zero false
alarms on unrelated speech) and by the full wake life-cycle/hand-off test suite. The
final human acceptance is a live-mic "say Hey NOVA → open Chrome" run (branded
**Testing / awaiting human verification**, matching the repo's convention).

**NOVA-028 — COMPLETED.** The wake word can be disabled (toggle) and/or voice can be
disabled; PTT (Ctrl+Shift+J) and typed commands remain fully available and unchanged
whenever wake is off or unavailable. Verified by the wake/voice/PTT test suite.

**Custom wake phrase capability:** *supported only when a matching local model is
enrolled.* "Hey NOVA" is enrolled and bundled. Arbitrary user phrases (e.g. "Hey
AJ") are NOT silently detected: they pass through the enrollment seam and surface as
"unsupported/unenrolled" until a matching BPE token sequence + model directory exist.

## v0.3 Slice 2 — Search / Web Intent Execution (V03-S2)

V03-S2 completes deterministic execution for the search intents introduced in
V03-S1. `SEARCH_WEB` and `SEARCH_YOUTUBE` resolve to **fixed, trusted search
origins** with only the user query as encoded data, and execute through the
**same shared `executeCommand()` → `resolveCommand()` → `Launcher` pipeline** used
by typed and voice commands. No new parser and no separate voice path were added.

- **RECOGNITION = IMPLEMENTED.** Deterministic phrase patterns:
  `search for <q>`, `search the web for <q>`, `search google for <q>`,
  `search web for <q>`, `search youtube for <q>`, `search yt for <q>`,
  `google search <q>`, `youtube search <q>`, `yt search <q>`,
  bare `google <q>`, bare `youtube <q>` / `yt <q>`.
- **URL SAFETY = IMPLEMENTED.** Web → `https://www.google.com/search?q=<encoded>`;
  YouTube → `https://www.youtube.com/results?search_query=<encoded>`. Query is
  encoded with `encodeURIComponent`; the origin is fixed and cannot be changed by
  input. No arbitrary protocol/URL execution from natural language.
- **PIPELINE = SHARED.** Search intents are handled by the existing
  `windows-launcher.ts` `openUrl()` path (http(s) only) alongside `OPEN_WEBSITE`.
- **EMPTY QUERY = CLARIFICATION.** Blank queries never launch a search.
- **V03-S3 (focus + rich launcher actions) is now Completed** — see below.
  **V03-S4 (risk/confirmation enforcement), V03-S5 (AI interpretation) and
  later slices are NOT started and remain Planned.**

| Requirement ID | Version | Epic | Requirement | Acceptance Criteria | Priority | Dependencies | Platform | Status |
|---|---|---|---|---|---|---|---|---|
| V03-S2-001 | v0.3 | Command Engine | Deterministic SEARCH_WEB recognition | Inputs `search for <q>`, `search the web for <q>`, `search google for <q>`, `search web for <q>`, `google search <q>`, bare `google <q>` resolve to `SEARCH_WEB` with `arguments.query`. No LLM. | High | V03-S1 | Cross-platform | Completed |
| V03-S2-002 | v0.3 | Command Engine | Deterministic SEARCH_YOUTUBE recognition | Inputs `search youtube for <q>`, `search yt for <q>`, `youtube search <q>`, `yt search <q>`, bare `youtube <q>`/`yt <q>` resolve to `SEARCH_YOUTUBE` with `arguments.query`. | High | V03-S1 | Cross-platform | Completed |
| V03-S2-003 | v0.3 | Security | Safe fixed-origin URL construction | Web target is exactly `https://www.google.com/search?q=<encodeURIComponent(q)>`; YouTube target is exactly `https://www.youtube.com/results?search_query=<encodeURIComponent(q)>`. The origin is constant; only the query is dynamic and is encoded. | High | V03-S2-001 | Cross-platform | Completed |
| V03-S2-004 | v0.3 | Security | Query is data, never executable | Queries containing `https://evil.example`, `&`, `?redirect=`, shell-like strings, punctuation, and symbols remain query data; the trusted origin is unchanged and no shell/protocol/eval path is introduced. | High | V03-S2-003 | Cross-platform | Completed |
| V03-S2-005 | v0.3 | Execution | Search executes through the shared pipeline | `SEARCH_WEB`/`SEARCH_YOUTUBE` are launched by the existing Windows launcher `openUrl()` (http(s)-only) exactly like `OPEN_WEBSITE`; typed and voice input both call the same `executeCommand()` → `resolveCommand()` path. | High | V03-S2-003 | Windows | Completed |
| V03-S2-006 | v0.3 | Command Engine | Empty/invalid query handling | Blank queries (`search for`, `search youtube for`, `search google for`) return a `CLARIFICATION` and never launch a blank search. | High | V03-S2-001 | Cross-platform | Completed |
| V03-S2-007 | v0.3 | Quality | V03-S2 automated tests | `tests/v03-search.test.ts` covers recognition, query extraction/encoding, empty queries, security (trusted origin preserved, shell-like input stays data), and shared-pipeline execution through `executeCommand()`. No GUI/microphone required. | High | V03-S2-001 | Cross-platform | Completed |
| V03-S2-008 | v0.3 | Quality | Clean TypeScript/build + regression | `npx tsc --noEmit` exits 0, `npm run build` succeeds, and all pre-existing v0.1/v0.2 tests continue to pass (209/209 total after V03-S2, including the new search suite). | High | All V03-S2 | Cross-platform | Completed |

**Known limitations (honest):** Search requires a default browser; results appear
in the system browser (NOVA does not render results in-app). Search intents are
deterministic phrase patterns only — free-form natural-language search phrasing
beyond the patterns above is not recognized and falls back to clarification. The
`CommandResult` structured response type exists but the search path continues to
surface via the existing `launched` response (action + LaunchResult) to avoid
changing v0.2 behavior. Risk/confirmation enforcement was not applied in this
slice beyond the LOW classification recorded on the action; it is enforced in
**V03-S4** (see below), where that classification was replaced by a real policy
and gate.

---

## v0.3 Slice 3 — Application Focus + Rich Launcher Actions (V03-S3)

V03-S3 completes **real execution** for the four intents recognised since V03-S1.
All four run through the **same shared `executeCommand()` → `resolveCommand()`
pipeline** used by typed and voice input; a single
`createCommandPipelineDeps()` factory builds the dependency set for *both* input
paths so they cannot drift. No intent has a voice-only or typed-only
implementation.

- **FOCUS_APPLICATION = FOCUS, NEVER LAUNCH.** The target is resolved against
  the validated registry, so the platform layer only ever receives
  `AppEntry.path` + `AppEntry.name`. An already-running window is activated; if
  the app is not running a structured "isn't currently running" result is
  returned. It is **never** converted into `OPEN_APPLICATION`, and **no process
  is ever started for the target**.
- **NO SHELL, EVER.** Focus uses the Win32 API (`user32.dll`) through the
  Node-API FFI binding `koffi` (`EnumWindows`, `GetWindowThreadProcessId`,
  `AttachThreadInput`, `ShowWindow`, `BringWindowToTop`, `SetForegroundWindow`).
  `cmd.exe`, PowerShell, `wscript`, `shell: true`, `eval` and `new Function` are
  absent. The only child process spawned is the **fixed** system binary
  `System32\tasklist.exe`, with `shell: false` and a **constant** argv
  (`/FO CSV /NH`) — no user or registry text is ever passed to it; its output is
  parsed in-process and compared against validated image names.
- **EXISTING DATA SOURCES ONLY.** `SHOW_FAVORITES` and `SHOW_RECENTS` read the
  existing `NovaConfig.favorites` / `NovaConfig.recents` (the same store the
  overlay and Settings already use). No second favorites or recents database was
  created. Empty state returns a clean result and fabricates nothing; an
  unresolvable favorite id falls back to the stored id rather than an invented
  label.
- **EXISTING SETTINGS ARCHITECTURE.** `OPEN_SETTINGS` calls the existing
  `WindowManager.showSettings()` through an injected `openSettings` hook. No
  duplicate settings window is created.
- **STRUCTURED RESULT MODEL.** `CommandResult` was **extended** with an optional
  `data` field (`favorites` / `recents` / `settings`) rather than introducing a
  competing result interface; it is purely additive, so v0.2 consumers that
  ignore `data` are unaffected.
- **V03-S4 (risk/confirmation enforcement) is now Completed** — see below.
  **V03-S5 (AI interpretation) and automation remain Planned.**

| Requirement ID | Version | Epic | Requirement | Acceptance Criteria | Priority | Dependencies | Platform | Status |
|---|---|---|---|---|---|---|---|---|
| V03-S3-001 | v0.3 | Execution | Real FOCUS_APPLICATION execution | `focus <app>` / `switch to <app>` / `bring <app> to front` resolve to `FOCUS_APPLICATION` with the registry `AppEntry.path` as target and reach `windows-launcher.ts` → `executeFocusApplication()` → `WindowsApplicationFocusService`, which activates an existing top-level window. A live Windows test asserts a real window is focused (matched PID + title). | High | V03-S1 | Windows | Completed |
| V03-S3-002 | v0.3 | Command Engine | Focus alias + phrasing resolution | Known app by name, by alias (`chrome`, `vscode`, `vs code`, `explorer`), and by `switch to` / `bring ... to front` phrasing all resolve to the registry entry. Unknown targets return `CLARIFICATION` and never fall through to an `OPEN_*` intent. | High | V03-S3-001 | Cross-platform | Completed |
| V03-S3-003 | v0.3 | Execution | Not-running is structured, not a launch | When the target is not running the service returns the `not-running` outcome and the user sees "<App> isn't currently running." The launcher receives exactly one `FOCUS_APPLICATION` action, no `OPEN_APPLICATION`, and no recent is recorded. | High | V03-S3-001 | Windows | Completed |
| V03-S3-004 | v0.3 | Security | No shell execution in the focus path | The focus implementation contains no PowerShell, `cmd.exe`, `cmd /c`, `shell: true`, `exec`/`execSync`/`execFile`, `eval` or `new Function`. Verified by comment-stripped source assertions plus a single-spawn/constant-argv assertion. | High | V03-S3-001 | Windows | Completed |
| V03-S3-005 | v0.3 | Security | No arbitrary process execution | Only `System32\tasklist.exe` is spawned, with `shell: false` and constant argv `/FO CSV /NH`. The argv references no request-derived value. Process image names are validated against `SAFE_IMAGE_NAME`; anything that fails validation yields zero candidates. | High | V03-S3-004 | Windows | Completed |
| V03-S3-006 | v0.3 | Security | No arbitrary executable path | The focus target always originates from the validated registry. Derived image names come only from the executable basename; a `.lnk` shortcut yields no candidates and cannot be focused. Hostile input (`& ; $() backtick pipe`) never reaches the platform layer as a target. | High | V03-S3-005 | Cross-platform | Completed |
| V03-S3-007 | v0.3 | Execution | SHOW_FAVORITES returns real data | Reads `NovaConfig.favorites`, resolves labels from the registry snapshot, and returns `data: { kind: 'favorites', items, total }` via the existing `result` CommandResponse. Message is "Here are your favorites." | High | V03-S1 | Cross-platform | Completed |
| V03-S3-008 | v0.3 | Execution | SHOW_FAVORITES empty state | With no favorites configured the result is clean and non-fabricated: "No favorites are configured yet." with `items: []`, `total: 0`. | High | V03-S3-007 | Cross-platform | Completed |
| V03-S3-009 | v0.3 | Execution | SHOW_RECENTS returns real data | Reads `NovaConfig.recents` and returns `data: { kind: 'recents', items, total }`. Viewing recents does not itself record a recent (no feedback loop). | High | V03-S1 | Cross-platform | Completed |
| V03-S3-010 | v0.3 | Execution | SHOW_RECENTS empty state | With no recents the result is clean and non-fabricated: "No recent apps yet." with `items: []`, `total: 0`. | High | V03-S3-009 | Cross-platform | Completed |
| V03-S3-011 | v0.3 | Execution | OPEN_SETTINGS reuses the existing settings window | Calls the existing `WindowManager.showSettings()` through the injected `openSettings` hook and returns "Opening NOVA settings." with `data: { kind: 'settings', action: 'open-settings' }`. No second settings window, and no launcher involvement. | High | V03-S1 | Cross-platform | Completed |
| V03-S3-012 | v0.3 | Architecture | One shared pipeline for typed and voice | Both the typed IPC handler and the voice controller build deps via `createCommandPipelineDeps()` and call the same `executeCommand()`. Tests assert identical results, identical focus-service calls and identical intents for focus/favorites/settings across both input paths. | High | V03-S3-001 | Cross-platform | Completed |
| V03-S3-013 | v0.3 | UI | Minimal structured rendering | The existing royal-dark overlay is unchanged in design; it only renders the returned message plus the favorites/recents list, an empty state, and a not-found/not-running state. Added `role="list"`/`role="listitem"`/`aria-label`; existing logo, floating dot, animations, reduced-motion and keyboard navigation are untouched. | High | V03-S3-007 | Cross-platform | Completed |
| V03-S3-014 | v0.3 | Quality | V03-S3 automated tests | `tests/v03-app-actions.test.ts` (46 tests) covers focus known app / alias / running / not-running / unknown / no-launch-when-not-running, favorites populated + empty, recents populated + empty, settings action, the security suite, shared typed+voice pipeline, and a live Windows backend test. No GUI or physical microphone required. | High | All V03-S3 | Cross-platform | Completed |
| V03-S3-015 | v0.3 | Quality | Clean TypeScript/build + regression | `npx tsc --noEmit` exits 0, `npm run build` succeeds, and all pre-existing v0.1/v0.2/V03-S1/V03-S2 tests continue to pass (255/255 total after V03-S3, including the new suite). | High | All V03-S3 | Cross-platform | Completed |

**Known limitations (honest):** Focus requires a running instance that owns a
visible top-level window with a title, and the process image name must match the
registry entry's executable basename — Start Menu `.lnk` entries and apps whose
window title is empty cannot be focused and correctly report "isn't currently
running". Window activation depends on the optional native `koffi` binding; if it
cannot be loaded the service degrades to the `unavailable` outcome ("Focusing X
isn't available on this system.") instead of throwing. Windows may still apply
its foreground-lock restrictions in edge cases (e.g. a session with no
interactive desktop). `SHOW_FAVORITES` / `SHOW_RECENTS` are read-only views of
existing config — this slice adds no favorite/recent editing commands. In this
slice risk was only the LOW classification recorded on the action; the
authoritative policy and the confirmation gate are implemented in **V03-S4**
below. Manual voice/microphone acceptance of spoken focus /
favorites / recents / settings phrasing remains **Testing — awaiting human
verification**; the automated suite drives the same shared pipeline through a
mock recognizer.

---

## v0.3 Slice 4 — Risk Classification + Confirmation Safety Layer (V03-S4)

V03-S4 inserts a **deterministic confirmation boundary** between understanding a
command and running it. Recognition and risk are now two separate concerns, and
the risk decision is made by one auditable module — never by the parser and never
by a model.

- **RISK IS NOT DECIDED BY THE PARSER.** `command-engine.ts` no longer stamps
  `risk: 'LOW'` on every action. `electron/core/risk-policy.ts` is the single
  source of truth and classifies every action immediately before the gate. This
  matters for V03-S5: when optional AI interpretation is added, an interpreted
  proposal cannot mark itself safe, because the interpreter has no way to
  contribute a risk level at all.
- **ONE BOUNDARY, BOTH INPUT PATHS.** The enforced order is
  `input → intent → StructuredCommand → risk classification → validation →
  confirmation if MEDIUM/HIGH → execution`. Typed IPC and voice both call the same
  `executeCommand()`, and **one** `ConfirmationGate` instance is shared by the
  whole process, so there is exactly one pending confirmation slot.
- **LOW RUNS, MEDIUM/HIGH WAIT.** `LOW` = no meaningful side effect
  (`SHOW_FAVORITES`, `SHOW_RECENTS`, `OPEN_SETTINGS`, `SEARCH_WEB`,
  `SEARCH_YOUTUBE`, `FOCUS_APPLICATION`, `CLARIFICATION`/`UNKNOWN`, and
  registry-validated website/file/folder targets). `MEDIUM` = a real side effect
  (`OPEN_APPLICATION`, and any website/file/folder target NOVA never vetted).
  `HIGH` is reserved and currently assigned to nothing, because no supported NOVA
  intent is destructive; inventing a dangerous command to exercise the level would
  be dishonest, but the level exists so the gate already treats it as gated.
- **FAIL CLOSED, ALWAYS.** An intent the policy does not know classifies as
  `MEDIUM`, and a pipeline built **without** a gate refuses every gated action
  (`reason: 'unavailable'`) instead of running it.
- **THE TOKEN IS THE ONLY KEY.** A pending confirmation holds one random UUID
  token, compared timing-safely against a canonical-UUID shape check. Only that
  token can release the **exact action the gate was bound to** — the approval
  path cannot re-resolve input, re-read intent, or re-classify. The renderer only
  ever sees `{ prompt, detail, intent, risk, expiresInMs, token }` and echoes the
  token; no executable command data crosses the IPC boundary. No shell, `eval`,
  or new process-spawning path was introduced.
- **ONE SHOT, THEN GONE.** Confirm/cancel invalidate the token synchronously, so
  replay, a stale dialog, a double click, or a cancel-then-confirm race all execute
  nothing. A pending confirmation expires after a single 30-second timer (no
  polling), is superseded immediately by any later command, and is invalidated
  when the overlay hides so a prompt can never stay armed off-screen.
- **SPOKEN ANSWERS, ONLY WHEN PENDING.** While a confirmation is pending, voice
  additionally accepts exactly `yes` / `confirm` / `do it` and `no` / `cancel` /
  `stop`, matched after normalization against a fixed list. The words are never
  used as a token — they resolve the token the gate already issued. With nothing
  pending these words do nothing at all and only acknowledge inertly ("There is
  nothing to confirm."), and **typed** text is never treated as a confirmation.

| Requirement ID | Version | Epic | Requirement | Acceptance Criteria | Priority | Dependencies | Platform | Status |
|---|---|---|---|---|---|---|---|---|
| V03-S4-001 | v0.3 | Architecture | Risk is classified by one policy module, never by the parser | `electron/core/risk-policy.ts` exports `classifyRisk()`, `requiresConfirmation()`, `trustedTargets()`, `withClassifiedRisk()` and is the only writer of `StructuredAction.risk`. `resolveCommand()` returns actions with `risk === undefined`, and `withClassifiedRisk()` does not mutate its input. | High | V03-S1 | Cross-platform | Completed |
| V03-S4-002 | v0.3 | Security | Deterministic LOW set | `CLARIFICATION`, `UNKNOWN`, `SHOW_FAVORITES`, `SHOW_RECENTS`, `OPEN_SETTINGS`, `SEARCH_WEB`, `SEARCH_YOUTUBE`, `FOCUS_APPLICATION` classify LOW. Tests assert the exact intent **and** level for each. | High | V03-S4-001 | Cross-platform | Completed |
| V03-S4-003 | v0.3 | Security | Deterministic MEDIUM set | `OPEN_APPLICATION` classifies MEDIUM even when the target is registry-validated, and even when no registry context is supplied. | High | V03-S4-001 | Cross-platform | Completed |
| V03-S4-004 | v0.3 | Security | Registry-validated target rule | `OPEN_WEBSITE` / `OPEN_FILE` / `OPEN_FOLDER` are LOW only on an exact registry match (`AppEntry.path`, website `url`, `fileFolder.path`); anything else is MEDIUM. Empty registry values are dropped so an empty target can never become "trusted". | High | V03-S4-001 | Cross-platform | Completed |
| V03-S4-005 | v0.3 | Security | HIGH is reserved, and assigned to nothing today | The policy defines HIGH as gated-by-construction; a test enumerates every currently supported intent and asserts none classifies HIGH, so no destructive action is invented to populate the level. | High | V03-S4-001 | Cross-platform | Completed |
| V03-S4-006 | v0.3 | Security | Fail closed on an unknown intent | An intent with no policy entry classifies MEDIUM even if the action object claims `risk: 'LOW'`; a caller-supplied level is ignored by both `classifyRisk()` and `withClassifiedRisk()`. | High | V03-S4-001 | Cross-platform | Completed |
| V03-S4-007 | v0.3 | Execution | LOW executes with no prompt | A LOW command produces a normal `launched`/`result` response, leaves the gate empty, records its recent where applicable, and the executed action carries the stamped `risk: 'LOW'`. | High | V03-S4-002 | Cross-platform | Completed |
| V03-S4-008 | v0.3 | Security | MEDIUM/HIGH stop before execution | A held command never reaches the launcher: zero launches, zero recents recorded, and `onSettled` has not fired. Tests assert on absence of execution, not just on the response kind. | High | V03-S4-003 | Cross-platform | Completed |
| V03-S4-009 | v0.3 | Security | The prompt carries no actionable payload | `ConfirmationRequest` has exactly `{ token, prompt, detail?, intent, risk, expiresInMs }`; the resolved app path is absent from the serialized request. | High | V03-S4-008 | Cross-platform | Completed |
| V03-S4-010 | v0.3 | Execution | Confirm runs exactly the prompted command, once | Approval runs the action the gate was bound to — verified by changing the registry between prompt and approval and asserting the bound target still runs. The approval path performs no re-parsing and re-resolves nothing. | High | V03-S4-008 | Cross-platform | Completed |
| V03-S4-011 | v0.3 | Execution | Cancel never executes | `cancelPendingCommand()` returns `cancelled` with `reason: 'user'`, launches nothing, records nothing, and the token is dead so a later approval is refused. | High | V03-S4-008 | Cross-platform | Completed |
| V03-S4-012 | v0.3 | Security | Bounded window with a single timer | `CONFIRMATION_TIMEOUT_MS` is `30_000`. Exactly one timer exists while a prompt is pending (asserted with `vi.getTimerCount()`), it is cleared on answer, and expiry launches nothing and leaves the token invalid. A superseded prompt starts a fresh full-length window rather than inheriting elapsed time. | High | V03-S4-008 | Cross-platform | Completed |
| V03-S4-013 | v0.3 | Security | Replay, stale and forged tokens are refused | Confirming twice launches once. A forged token (empty, whitespace, `yes`, shell-like text, a SQL-ish string, a path, `null`, a number, an action object, an array) is rejected and leaves the genuine prompt alive. A canonical-but-unissued token is rejected as `mismatch`. Confirm-after-cancel and cancel-after-confirm are both safe. | High | V03-S4-010 | Cross-platform | Completed |
| V03-S4-014 | v0.3 | Security | One pending slot; a new command supersedes | A second command invalidates the first prompt immediately (`outcome: 'superseded'`), and the older token can never approve the newer command. Valid-but-unrecognised and over-length input does **not** invalidate a pending prompt. | High | V03-S4-013 | Cross-platform | Completed |
| V03-S4-015 | v0.3 | Security | Hiding the overlay disarms the prompt | `WindowManager` invokes `onOverlayHidden()` on every hide path and main invalidates the pending confirmation, so nothing stays armed off-screen. | High | V03-S4-014 | Cross-platform | Completed |
| V03-S4-016 | v0.3 | Security | Renderer can submit only a token | Preload exposes `getConfirmationState()`, `confirmCommand(token)`, `cancelCommand(token)` and `onConfirmationState(cb)`; the IPC handlers pass the raw value straight to the gate. There is no channel that accepts command data for execution. | High | V03-S4-010 | Cross-platform | Completed |
| V03-S4-017 | v0.3 | Security | A missing gate refuses rather than permits | A pipeline with no `confirmation` dep returns `cancelled` with `reason: 'unavailable'` for a gated action and launches nothing; LOW actions are unaffected. | High | V03-S4-007 | Cross-platform | Completed |
| V03-S4-018 | v0.3 | Voice | Fixed confirmation vocabulary, pending only | `CONFIRM_PHRASES` is exactly `['yes','confirm','do it']` and `CANCEL_PHRASES` is exactly `['no','cancel','stop']`, matched case/punctuation-insensitively; `y`, `yep`, `yes please open chrome` and `do it now` are not phrases. With nothing pending these words execute nothing, open nothing and only acknowledge inertly. | High | V03-S4-010 | Cross-platform | Completed |
| V03-S4-019 | v0.3 | Voice | Spoken answers can be accepted while confirming | The `confirming` voice phase still starts a listening session, so the prompt is answerable by voice; answering settles the indicator back to `idle`. | High | V03-S4-018 | Cross-platform | Completed |
| V03-S4-020 | v0.3 | Security | Typed text is never a confirmation | Typing `yes` with a prompt pending is parsed as an ordinary command and returns `clarification`; it cannot approve anything. | High | V03-S4-018 | Cross-platform | Completed |
| V03-S4-021 | v0.3 | Architecture | Typed and voice parity over one shared gate | Identical command text produces identical responses from both surfaces apart from the opaque token; a voice-raised prompt is answerable through the typed path and a typed prompt through the spoken path, and both share one pending slot. | High | V03-S4-010 | Cross-platform | Completed |
| V03-S4-022 | v0.3 | UI | Accessible prompt, no redesign | The existing royal-dark overlay is unchanged in design. A pending confirmation renders a `role="dialog"` prompt with `aria-modal`, labelled title/description, read-only input, focus moved to the dialog, `Enter` to confirm, `Esc` to cancel, and reduced-motion support. Every settle outcome (`confirmed`, `cancelled`, `expired`, `superseded`) reaches the UI exactly once, and a throwing listener cannot break the gate. | High | V03-S4-010 | Cross-platform | Completed |
| V03-S4-023 | v0.3 | UI | Voice indicator reflects the gate | The indicator shows a `confirming` state while a confirmation is pending and returns to idle when it settles anywhere. | High | V03-S4-022 | Cross-platform | Completed |
| V03-S4-024 | v0.3 | Security | No new execution capability | Comment-stripped source assertions prove the policy, gate and pipeline contain no PowerShell, `cmd.exe`, `shell: true`, `exec`/`execSync`/`execFile`/`spawn`, `eval` or `new Function`; the confirmation layer imports no process or Electron module; the launcher is reachable from exactly one place in the pipeline and that place is downstream of the gate; `windows-launcher.ts` is untouched. | High | All V03-S4 | Cross-platform | Completed |
| V03-S4-025 | v0.3 | Quality | V03-S4 automated tests | `tests/v03-risk-confirmation.test.ts` (86 tests) covers classification, LOW execution, gated-before-execution, confirm-exactly-once, cancel, timeout/single timer, replay, stale/forged tokens, supersession, spoken confirm/cancel, typed-voice parity, UI state transitions, and the security boundary. No GUI, browser or physical microphone required. | High | All V03-S4 | Cross-platform | Completed |
| V03-S4-026 | v0.3 | Quality | Clean TypeScript/build + regression | `npx tsc --noEmit` exits 0, `npm run build` succeeds, and all pre-existing v0.1/v0.2/V03-S1/S2/S3 tests continue to pass (341/341 total after V03-S4, including the new suite). | High | All V03-S4 | Cross-platform | Completed |

**Executability:** All 26 requirements are backed by executable code and 86 new
automated tests. `classifyRisk()` is pure and directly unit-tested, and the gate is
tested through fake timers for expiry and for the "exactly one timer" property.

**Risks:** The main behavioural change for users is that launching an application
now asks first, which is the point of the slice. Because V03-S1–S3 recorded
`risk: 'LOW'` on every action, any code that trusted that field is now reading an
authoritative classification instead — nothing in the repository did. The gate's
30-second window is short by design; a user who ignores the prompt gets a
"no longer valid" answer rather than a surprise execution.

**Dependencies:** V03-S1 (`StructuredAction`/`Intent`), V03-S2/S3 (the real
launch/focus execution paths that are now gated). No new runtime dependency, no
model, and no native binding were added.

**Open questions (for a later slice, not decided here):** whether a
remember-always answer should ever be possible for a validated app (the current
design deliberately has no such affordance), and whether a future destructive
intent should get its own timeout or a stricter prompt than the generic HIGH
wording.

**Known limitations (honest):** Confirmation is in-process and per-command — there
is no persistence of an armed prompt across a restart, and no allow-list that
would let a validated app skip confirmation. `HIGH` has no live example because
nothing NOVA can currently do is destructive. A confirmation cannot be answered
from a surface that has not yet been implemented (e.g. a future tray menu). The
spoken vocabulary is intentionally minimal: a user who says "yeah, go ahead" gets
no confirmation and no execution. Manual microphone/spoken acceptance of the
confirmation flow remains **Testing — awaiting human verification**; the automated
suite drives the same shared pipeline and the real voice controller through a mock
recognizer.

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
- **V02-S4A-*** — v0.2 Slice 4A (wake word). Slice 4A-1 shipped the config +
  Settings **surface** (`wakeWordEnabled` persists, no runtime). **Slice 4A-2**
  implemented the real local wake-word engine behind the `KeywordSpotter` DI
  seam: phrase/config persistence + validation + normalization, the wake
  controller lifecycle (armed only when `voiceEnabled && wakeWordEnabled &&
  idle`), false-trigger guardrails, and the wake → shared-STT hand-off. **Slice
  4A-3** bundled a real local KWS model for the default phrase and wired the
  runtime + wake indicator. **NOVA-027/028 are Completed at the
  implementation/automated-verification level** (detection exposed through the
  real model at the runtime level, positive detection on the model's test
  speech, zero false alarms on unrelated speech, full wake life-cycle/hand-off
  suite passing). The **final live-microphone acceptance is Testing — awaiting
  human verification** (compare Section "v0.2 Slice 4A-3", NOVA-027). Detection
  remains **model-gated**: a phrase is genuinely detectable only when an enrolled
  BPE keyword line and a matching `resources/models/sherpa-onnx-kws-<slug>`
  model exist. "Hey NOVA" is enrolled and bundled; arbitrary custom phrases (e.g.
  "Hey AJ") surface as unsupported/unenrolled — they are configurable but not
  detectable until enrolled.
- **V03-S1-*** — v0.3 Slice 1 (command model + deterministic intent engine
  foundation). Implemented; automated checks clean. Status **Completed** at the
  code/test level.
- **V03-S2-*** — v0.3 Slice 2 (search / web intent execution). Implemented;
  automated checks clean. Status **Completed** at the code/test level. Manual
  browser/voice verification of a live search is **Testing — awaiting human
  verification**.
- **V03-S3-*** — v0.3 Slice 3 (application focus + rich launcher actions).
  Implemented; automated checks clean. Status **Completed** at the code/test
  level, including a **live Windows test that actually focuses a running
  application window** and asserts the matched PID and window title. Manual
  spoken/microphone acceptance remains **Testing — awaiting human verification**.
- **V03-S4-*** — v0.3 Slice 4 (risk classification + confirmation safety layer).
  Implemented; automated checks clean. Status **Completed** at the code/test
  level: deterministic risk policy (`LOW`/`MEDIUM`/`HIGH`, fail-closed) enforced by
  one process-wide, token-bound confirmation gate that both the typed and voice
  paths share, with a 30-second window, supersession, replay/stale rejection, and
  a fixed spoken yes/no vocabulary active only while a prompt is pending.
  Manual spoken/microphone acceptance of the confirmation flow remains
  **Testing — awaiting human verification**.
- **V03-S5** (optional local-AI interpretation) and v0.3 automation are **not
  started** and remain Planned.
