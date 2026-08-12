# NOVA v0.1 — Requirements Traceability Matrix (RTM)

Canonical in-repository RTM for **NOVA v0.1 (Desktop Core)**.
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

## Legend

- **V01-S1-*** — Slice 1 (desktop core). Manually validated by the user.
- **V01-S2-*** — Slice 2 (settings, shortcuts, persistence, security).
- **V01-R-*** — Packaging and release.
- **V01-R-02 (exit gate)** is **Completed**: the full manual exit-gate sequence
  (interactive NSIS install/uninstall, packaged launch, settings, shortcuts,
  persistence, favorites) was performed by a human and all acceptance tests
  passed.
