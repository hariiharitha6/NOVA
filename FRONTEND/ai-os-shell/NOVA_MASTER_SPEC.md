# NOVA --- Cursor Master Project Specification

## Product Requirements + Architecture + Version Roadmap + RTM Execution Rules

**Project:** NOVA\
**Product type:** Minimal AI desktop control layer / universal launcher\
**Primary platform:** Windows 10/11\
**First release:** Windows `.exe`\
**Development model:** Version-gated, RTM-driven\
**Phone calling:** LAST MVP feature only (v1.0)

------------------------------------------------------------------------

# 1. PRODUCT DEFINITION

NOVA is a lightweight desktop application that stays available on the
user's screen as a tiny floating icon.

The user can trigger NOVA from anywhere using:

-   mouse click
-   global keyboard shortcut
-   push-to-talk voice
-   optional wake word: **"Hey Nova"**

After activation, NOVA presents a minimal command surface asking:

> What do you want to do?

The user can type or speak commands such as:

-   Open Chrome
-   Open YouTube
-   Open ChatGPT
-   Open VS Code
-   Open Downloads
-   Search YouTube for Python tutorials
-   Start coding mode
-   Start study mode

NOVA translates the command into a safe structured action and executes
it.

The product must feel like a **minimal control layer over the desktop**,
not a large dashboard and not a normal chatbot.

------------------------------------------------------------------------

# 2. PRODUCT POSITIONING

NOVA combines ideas from:

-   desktop launchers
-   Spotlight / PowerToys-style quick access
-   Siri / Google Assistant-style voice triggering
-   application shortcuts
-   browser shortcuts
-   lightweight AI command interpretation
-   user-defined workflows

Core promise:

> **One tiny control point for the applications, websites, files, and
> actions the user uses most.**

The product should reduce dependence on:

-   Start Menu searching
-   taskbar navigation
-   repeated browser navigation
-   manually opening groups of applications
-   remembering complex commands

------------------------------------------------------------------------

# 3. IMPORTANT SCOPE CHANGE FROM THE ORIGINAL LADY LISA SRS

The original Lady LISA document describes a broader voice-first
cognitive assistant with:

-   persistent semantic memory
-   multi-agent orchestration
-   local LLMs
-   skill files
-   blackboard architecture
-   validator
-   research/RAG agents
-   coding agents
-   terminal-native workflows

Those ideas remain **future/advanced capabilities**, but they are NOT
the first product milestone.

NOVA's first priority is the desktop control layer:

``` text
Floating Icon
      ↓
Mouse / Hotkey / Voice
      ↓
Minimal Command Surface
      ↓
Command Engine
      ↓
Safe Action Router
      ↓
Apps / Websites / Files / System
```

Advanced AI, browser integration, plugins, memory, and multi-agent
capabilities are added only after the core launcher is stable.

------------------------------------------------------------------------

# 4. DESIGN PRINCIPLES

## 4.1 Minimal

The application must remain visually small.

Normally the user should see only:

``` text
●
```

Clicking or triggering it expands the command surface.

## 4.2 Fast

Simple commands must not require an LLM.

Example:

``` text
Open Chrome
```

should use deterministic local matching.

## 4.3 Always Available

NOVA should live in the background and remain accessible without
requiring the user to switch applications.

## 4.4 Non-disruptive

NOVA must not unnecessarily steal focus.

After an action completes, the user's previous application should remain
usable.

## 4.5 Local-first

Simple operations should work without cloud AI.

Voice/AI processing should support local processing where practical.

## 4.6 User-controlled

Users decide:

-   which apps appear
-   which websites appear
-   which shortcuts exist
-   which workflows exist
-   which permissions are granted
-   whether wake word is enabled
-   whether AI is local or cloud

## 4.7 Safe

AI must never directly execute arbitrary OS commands.

Use:

``` text
User
 ↓
Intent
 ↓
Structured Action
 ↓
Permission Validation
 ↓
Action Validation
 ↓
Execution
```

------------------------------------------------------------------------

# 5. PRIMARY USER EXPERIENCE

## 5.1 Idle State

A tiny floating icon is visible.

``` text
                     ●
```

The user can drag it anywhere.

## 5.2 Click State

Clicking the icon opens:

``` text
┌──────────────────────────────────────┐
│ ✦ What do you want to do?            │
│                                      │
│ 🎙 Speak or type                     │
│                                      │
│ ──────────────────────────────────── │
│ Recent                               │
│ 🌐 Chrome       💻 VS Code            │
│ ▶ YouTube      💬 ChatGPT            │
│                                      │
│ Favorites                            │
│ GitHub        Gmail        Drive      │
└──────────────────────────────────────┘
```

## 5.3 Keyboard State

Example default:

``` text
CTRL + SPACE
```

The shortcut opens the same command surface.

The shortcut must be configurable.

## 5.4 Voice State

Example:

``` text
Hey Nova
   ↓
Listening...
   ↓
Open YouTube
   ↓
OPEN_WEBSITE
   ↓
YouTube opens
```

Wake word is optional.

------------------------------------------------------------------------

# 6. CORE FUNCTIONAL REQUIREMENTS

## Desktop Shell

NOVA shall provide:

-   Windows `.exe` packaging
-   installer
-   optional portable build
-   system tray
-   optional start-with-Windows
-   floating icon
-   always-on-top behavior
-   drag/reposition
-   multi-monitor support
-   minimize/collapse
-   persistent icon position

## Trigger Methods

NOVA shall support:

-   mouse/manual trigger
-   global keyboard shortcut
-   push-to-talk
-   optional wake word

All trigger types must feed the same command pipeline.

## Application Access

NOVA shall support:

-   installed application discovery
-   application launching
-   recent applications
-   favorite applications
-   pinned applications
-   custom executable registration
-   focusing an existing application/window where technically possible

## Files and Folders

NOVA shall support shortcuts for:

-   files
-   folders
-   Downloads
-   common Windows locations

## Websites

Users shall be able to register URLs such as:

-   YouTube
-   ChatGPT
-   Gmail
-   GitHub
-   Google Drive
-   any custom URL

NOVA shall open websites using the configured/default browser.

------------------------------------------------------------------------

# 7. COMMAND ENGINE

The command engine is the central abstraction.

Example intents:

``` text
OPEN_APPLICATION
OPEN_WEBSITE
OPEN_FILE
OPEN_FOLDER
SEARCH_WEB
SEARCH_WEBSITE
FOCUS_APPLICATION
RUN_WORKFLOW
CLARIFICATION_REQUIRED
```

Commands should become structured actions.

Example:

``` text
"Open Chrome"

→
{
  intent: "OPEN_APPLICATION",
  target: "Google Chrome"
}
```

Then:

``` text
Permission Check
      ↓
Action Validation
      ↓
Launch Chrome
```

------------------------------------------------------------------------

# 8. TWO-TIER COMMAND INTERPRETATION

## Tier 1 --- Deterministic

Use:

-   keyword matching
-   aliases
-   regex
-   application registry
-   URL registry
-   command registry

For simple commands.

No LLM required.

## Tier 2 --- AI

Use AI only for:

-   ambiguous commands
-   multi-step requests
-   contextual workflows
-   natural-language automation

Example:

> Open everything I need for my machine-learning project.

AI may produce:

``` text
OPEN_APPLICATION(VSCode)
OPEN_APPLICATION(Chrome)
OPEN_WEBSITE(GitHub)
OPEN_APPLICATION(Terminal)
```

The action engine validates every action before execution.

------------------------------------------------------------------------

# 9. USER CUSTOMIZATION

Users shall be able to configure:

-   floating icon position
-   monitor
-   hotkey
-   wake word
-   microphone
-   favorite applications
-   recent applications
-   custom applications
-   websites
-   files
-   folders
-   workflows
-   custom commands
-   AI provider
-   local/cloud mode
-   startup behavior
-   permissions
-   privacy settings
-   appearance

------------------------------------------------------------------------

# 10. RECENT APPS

NOVA should provide a recent application list so the user does not need
to look at the taskbar.

Example:

``` text
Recent

Chrome
VS Code
YouTube
ChatGPT
Terminal
```

Recent usage should be persisted locally.

------------------------------------------------------------------------

# 11. CUSTOM WORKFLOWS

Users can create named workflows.

Example:

## Coding Mode

``` text
VS Code
Chrome
GitHub
Terminal
Postman
```

## Study Mode

``` text
Chrome
College Portal
Notes
Music
Timer
```

## Meeting Mode

``` text
Teams
Calendar
Notes
```

The user can trigger them with:

> Start coding mode.

The workflow engine must execute structured actions, not arbitrary
generated shell commands.

------------------------------------------------------------------------

# 12. VOICE SYSTEM

Voice pipeline:

``` text
Microphone
    ↓
Wake Word / Push-to-Talk
    ↓
Speech-to-Text
    ↓
Transcript
    ↓
Command Engine
    ↓
Action Router
```

Requirements:

-   push-to-talk
-   speech-to-text
-   listening indicator
-   waveform
-   transcript persistence
-   long speech support
-   cancel/interrupt
-   microphone error handling
-   keyboard/text fallback
-   optional wake word
-   local processing where practical

The application must never get stuck in a listening or processing state.

------------------------------------------------------------------------

# 13. BROWSER INTEGRATION

Later releases may include a browser extension/companion.

Architecture:

``` text
NOVA Desktop
      ↓
Secure Local Bridge
      ↓
Browser Extension
      ↓
Chrome / Edge / Firefox
```

Potential capabilities:

-   open URLs
-   search websites
-   search YouTube
-   page-aware actions
-   summarize current page
-   save current page
-   send selected page content to AI

All browser capabilities require explicit permissions.

------------------------------------------------------------------------

# 14. AI INTEGRATION

AI is optional.

The architecture should support:

-   local models
-   cloud models
-   provider adapters
-   model routing

Potential local runtime:

-   Ollama

The system must not hard-code one model.

Use:

``` text
ModelProvider
  ├── LocalProvider
  ├── CloudProvider
  └── FutureProvider
```

Simple commands should bypass AI.

------------------------------------------------------------------------

# 15. SECURITY ARCHITECTURE

Because NOVA controls desktop actions, security is mandatory.

Never allow:

``` text
LLM → arbitrary shell command → OS
```

Use:

``` text
LLM
 ↓
Structured Intent
 ↓
Allowed Action Registry
 ↓
Permission Validation
 ↓
Risk Validation
 ↓
Confirmation if required
 ↓
Execution
```

High-risk operations include:

-   delete files
-   overwrite files
-   bulk modifications
-   terminal commands
-   system changes
-   messaging
-   calling

These require explicit permissions and/or confirmation.

Use secure Electron architecture:

-   context isolation
-   node integration disabled in renderer
-   typed/validated IPC
-   minimal preload API
-   no direct Node access from renderer

------------------------------------------------------------------------

# 16. PORTABILITY

Windows is the first platform.

However, the core must be designed to support:

-   Windows
-   Linux
-   macOS

Separate platform-independent logic from OS-specific functionality.

Recommended interfaces:

``` text
ApplicationLauncher
BrowserLauncher
FileLauncher
SystemActions
WindowManager
HotkeyManager
NotificationManager
```

Windows implements the first adapter.

Linux/macOS adapters can be added later.

Avoid hardcoded user paths.

------------------------------------------------------------------------

# 17. PORTABLE DATA

User configuration must be exportable/importable.

Export should include:

-   favorites
-   custom apps
-   URLs
-   workflows
-   commands
-   preferences

Avoid machine-specific absolute paths where possible.

Provide:

``` text
Export Configuration
Import Configuration
Backup
Restore
```

------------------------------------------------------------------------

# 18. PLUGIN ARCHITECTURE

Later, NOVA shall support plugins.

Plugin examples:

-   Spotify
-   Discord
-   GitHub
-   AWS
-   Docker
-   Flutter
-   Unity
-   DevOps
-   QA
-   Security

Each plugin must declare:

``` text
name
version
permissions
commands
actions
```

Plugins must never receive unrestricted system access.

------------------------------------------------------------------------

# 19. ADVANCED LADY LISA CONCEPTS --- FUTURE ONLY

The original Lady LISA SRS contains advanced concepts such as:

-   persistent memory
-   identity/royal file
-   episodic memory
-   semantic memory
-   skill files
-   LangGraph
-   blackboard architecture
-   validator agent
-   compression/sleep agent
-   multi-agent orchestration
-   coding agent
-   research agent
-   RAG
-   knowledge graph
-   local model orchestration

These are retained as future NOVA capabilities, not required for the
first launcher MVP.

The original SRS describes the blackboard as a shared structured agent
space and defines separate Talking, Orchestrator, Validator, Coding, Web
Search, Notebook/RAG, and Compression agents.
fileciteturn1file0L177-L241

The original memory design also includes identity, working, episodic,
semantic and structured knowledge layers.
fileciteturn1file0L266-L318

These concepts should be added only after the desktop control layer is
stable.

------------------------------------------------------------------------

# 20. VERSION-GATED DEVELOPMENT PLAN

## v0.1 --- DESKTOP CORE

Build:

-   `.exe`
-   installer
-   tray
-   floating icon
-   draggable icon
-   always-on-top
-   multi-monitor
-   click trigger
-   global hotkey
-   minimal overlay
-   installed app discovery
-   app launch
-   recent apps
-   favorites
-   custom apps
-   files/folders
-   website shortcuts
-   persistent configuration
-   startup option

### v0.1 Exit Gate

This exact flow must work:

``` text
Install NOVA
 ↓
NOVA starts
 ↓
Floating icon appears
 ↓
Drag icon
 ↓
Press hotkey
 ↓
Overlay appears
 ↓
Type "Open Chrome"
 ↓
Chrome opens
 ↓
NOVA collapses
```

Do not proceed until this is stable.

------------------------------------------------------------------------

## v0.2 --- VOICE

Build:

-   push-to-talk
-   STT
-   listening UI
-   transcript
-   long speech
-   cancel
-   wake word
-   "Hey Nova"
-   microphone fallback

### Exit Gate

User can say:

> Hey Nova, open YouTube.

and YouTube opens reliably.

------------------------------------------------------------------------

## v0.3 --- SMART COMMANDS

Build:

-   intent engine
-   deterministic command parser
-   aliases
-   website search
-   YouTube search
-   ChatGPT/GitHub/Gmail commands
-   app focusing
-   custom app groups
-   custom workflows
-   natural-language workflow triggers
-   confirmation for risky actions

### Exit Gate

Simple commands work without AI and complex commands can use optional
AI.

------------------------------------------------------------------------

## v0.4 --- BROWSER + AI

Build:

-   browser extension
-   secure browser bridge
-   local AI provider
-   cloud AI provider abstraction
-   model router
-   AI command interpretation
-   settings
-   permissions
-   secure secrets
-   audit log
-   privacy controls

### Exit Gate

AI can interpret complex commands but cannot bypass permissions.

------------------------------------------------------------------------

## v0.5 --- PORTABILITY

Build:

-   platform abstraction
-   Windows adapter
-   portable Windows build
-   configuration import/export
-   backup/restore
-   update strategy
-   Linux/macOS architecture preparation

### Exit Gate

Core logic contains no unnecessary Windows-only assumptions.

------------------------------------------------------------------------

## v0.6 --- PLUGINS

Build:

-   plugin API
-   plugin manifest
-   plugin permissions
-   sample plugin
-   plugin SDK documentation
-   marketplace architecture

------------------------------------------------------------------------

## v0.7 --- QUALITY

Build:

-   startup optimization
-   idle optimization
-   crash recovery
-   keyboard-only navigation
-   accessibility
-   unit tests
-   integration tests
-   installer tests
-   uninstall tests
-   upgrade tests

------------------------------------------------------------------------

## v0.8 --- SECURITY + OPEN SOURCE

Build:

-   sandboxing
-   command injection protection
-   prompt injection protection
-   destructive-action confirmation
-   secure secret storage
-   privacy controls
-   telemetry opt-out
-   MIT LICENSE
-   README
-   CONTRIBUTING
-   SECURITY
-   CHANGELOG
-   semantic versioning

------------------------------------------------------------------------

## v0.9 --- PUBLIC BETA

Release:

-   Windows installer
-   portable option
-   complete core launcher
-   voice
-   wake word
-   workflows
-   browser integration
-   AI
-   permissions
-   security
-   import/export
-   documentation

Collect opt-in beta feedback.

------------------------------------------------------------------------

# 21. v1.0 --- FINAL MVP

The final Windows-first MVP contains:

-   floating launcher
-   mouse trigger
-   keyboard trigger
-   voice trigger
-   Hey Nova
-   application launcher
-   recent apps
-   favorites
-   custom apps
-   files
-   folders
-   websites
-   search
-   workflows
-   browser integration
-   AI interpretation
-   permissions
-   security
-   portability
-   import/export
-   plugin foundation
-   performance
-   accessibility
-   documentation

## PHONE CALLING IS THE LAST FEATURE

Phone calling must NOT be developed before v1.0.

It is the final MVP feature.

Possible integrations:

-   Android companion
-   supported Windows phone integration
-   VoIP provider
-   supported communication platform

The system must not claim universal calling.

Example:

``` text
Hey Nova, call Mom
       ↓
Resolve configured contact
       ↓
Resolve supported provider
       ↓
Confirm:
"Call Mom using X?"
       ↓
User confirms
       ↓
Place call
```

Calling must have explicit permissions and confirmation.

------------------------------------------------------------------------

# 22. RTM EXECUTION RULES

Every feature must have:

-   Requirement ID
-   Version
-   Epic
-   Requirement
-   Acceptance criteria
-   Priority
-   Dependencies
-   Platform
-   Status

Statuses:

``` text
Planned
In Progress
Testing
Blocked
Completed
```

Never mark a requirement completed without its acceptance criteria
passing.

------------------------------------------------------------------------

# 23. CURSOR DEVELOPMENT RULES

When working on this project, always:

1.  Read this specification.
2.  Identify the current version.
3.  Identify the exact requirement IDs involved.
4.  Inspect the existing repository before changing code.
5.  Do not rewrite working modules unnecessarily.
6.  Do not implement future-version features early unless explicitly
    requested.
7.  Preserve architecture boundaries.
8.  Implement the smallest complete vertical slice.
9.  Write/update tests.
10. Run the relevant tests/build.
11. Report what changed.
12. Report what remains.
13. Update the RTM status.

Before coding, output:

``` text
CURRENT VERSION:
REQUIREMENT IDS:
GOAL:
DEPENDENCIES:
FILES TO INSPECT:
FILES TO CREATE:
FILES TO MODIFY:
ACCEPTANCE TEST:
```

After coding, output:

``` text
IMPLEMENTED:
TESTS:
BUILD RESULT:
ACCEPTANCE RESULT:
RTM STATUS:
NEXT REQUIREMENT:
```

------------------------------------------------------------------------

# 24. FIRST TASK FOR CURSOR

Do NOT start with voice.

Do NOT start with AI.

Do NOT start with browser extensions.

Do NOT start with plugins.

Do NOT start with phone calling.

Start with **v0.1**.

First inspect the repository.

Then implement only the first complete vertical slice:

``` text
Electron desktop shell
 ↓
System tray
 ↓
Floating icon
 ↓
Draggable position
 ↓
Global hotkey
 ↓
Minimal overlay
 ↓
Text command
 ↓
Application registry
 ↓
Launch application
```

The first successful demonstration should be:

> Press Ctrl+Space → type "Open Chrome" → Chrome opens.

Only after that works reliably should development continue through the
RTM.

------------------------------------------------------------------------

# 25. PRODUCT SUCCESS CRITERIA

NOVA succeeds when a user can forget where an application, website, or
shortcut lives.

They simply:

``` text
Click
or
Press
or
Speak
```

and NOVA handles the rest safely.

The application should feel like:

> **A tiny control layer sitting between the user and their computer.**

Not another window.

Not another chatbot.

Not another taskbar.

A minimal, extensible, voice-friendly desktop command layer.

------------------------------------------------------------------------

# END OF MASTER SPECIFICATION
