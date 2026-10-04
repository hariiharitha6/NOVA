// Windows application focus service (V03-S3).
//
// SAFETY CONTRACT
// ---------------
// * No shell of any kind. `cmd.exe`, PowerShell, `wscript`, `eval` and
//   `shell: true` are all absent by design.
// * No process is ever started for the target application. FOCUS_APPLICATION
//   only ever activates a window that already exists.
// * The only child process NOVA spawns is the fixed, absolute Windows system
//   binary `System32\tasklist.exe`, invoked with `shell: false` and a constant
//   argument vector. No user text and no registry text is ever passed to it —
//   its output is read back and compared in-process.
// * Window activation goes through the Win32 API (user32.dll) via the Node-API
//   FFI binding `koffi`, loaded lazily and defensively. All FFI is confined to
//   this file; `electron/core/` stays platform-neutral.
//
// If `koffi` is unavailable (non-Windows, stripped install, unsupported arch)
// every operation degrades to the `unavailable` outcome instead of throwing.

import { spawn } from 'node:child_process'
import { basename, extname, join } from 'node:path'
import type { ApplicationFocusService, FocusRequest, FocusResult } from '../core/app-focus'

/** A visible top-level window we discovered. */
interface WindowInfo {
  hwnd: bigint
  pid: number
  title: string
}

interface Win32 {
  /** Enumerate visible top-level windows that have a non-empty title. */
  enumerateWindows(): WindowInfo[]
  /** Restore (if minimised) and bring a window to the foreground. */
  activateWindow(hwnd: bigint): boolean
}

/**
 * Minimal structural typing for the subset of the `koffi` Node-API binding used
 * here. Declared locally so the optional native dependency is never a
 * compile-time requirement and can be resolved lazily at runtime.
 *
 * Native functions are deliberately loosely typed (`any`): this is an FFI
 * boundary where signatures come from Win32, not from TypeScript, and every
 * call site is immediately narrowed/checked by TypeScript.
 */
type NativeFn = (...args: any[]) => any

interface KoffiModule {
  load(name: string): {
    func(name: string, result: string, args: unknown[]): NativeFn
    func(convention: string, name: string, result: string, args: unknown[]): NativeFn
  }
  proto(definition: string): unknown
  pointer(ref: unknown): unknown
  register(callback: (...args: never[]) => unknown, type: unknown): bigint
  unregister(callback: bigint): void
}

const SW_RESTORE = 9
const TASKLIST_TIMEOUT_MS = 4000

/** Process image names are matched against this pattern only. */
const SAFE_IMAGE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

let win32Cache: Promise<Win32 | null> | null = null

function systemRoot(): string {
  const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows'
  return root
}

/**
 * Lazily build the Win32 bridge. Returns null when the native backend cannot be
 * loaded so callers can degrade gracefully. Memoized as a promise because the
 * FFI binding is resolved through a dynamic import that works in both the
 * CommonJS Electron main bundle and an ESM context (tests).
 */
async function buildWin32(): Promise<Win32 | null> {
  try {
    if (process.platform !== 'win32') return null

    // Optional native dependency, resolved at runtime only. `koffi` ships a
    // Node-API build, so it works in Electron without a native rebuild.
    const imported = (await import(/* @vite-ignore */ 'koffi')) as unknown
    const koffi = ((imported as { default?: unknown })?.default ?? imported) as KoffiModule
    if (!koffi || typeof koffi.load !== 'function') return null

    const user32 = koffi.load('user32.dll')
    const kernel32 = koffi.load('kernel32.dll')

    const EnumWindowsProc = koffi.proto('bool NovaEnumWindowsProc(void *hwnd, int64_t lParam)')
    const EnumWindows = user32.func('__stdcall', 'EnumWindows', 'bool', [
      'void *',
      koffi.pointer(EnumWindowsProc),
    ])
    const IsWindowVisible = user32.func('__stdcall', 'IsWindowVisible', 'bool', ['void *'])
    const GetWindowTextW = user32.func('__stdcall', 'GetWindowTextW', 'int', [
      'void *',
      'uint16 *',
      'int',
    ])
    const GetWindowThreadProcessId = user32.func(
      '__stdcall',
      'GetWindowThreadProcessId',
      'uint32',
      ['void *', 'uint32 *'],
    )
    const GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'void *', [])
    const SetForegroundWindow = user32.func('__stdcall', 'SetForegroundWindow', 'bool', ['void *'])
    const BringWindowToTop = user32.func('__stdcall', 'BringWindowToTop', 'bool', ['void *'])
    const ShowWindow = user32.func('__stdcall', 'ShowWindow', 'bool', ['void *', 'int'])
    const IsIconic = user32.func('__stdcall', 'IsIconic', 'bool', ['void *'])
    const AttachThreadInput = user32.func('__stdcall', 'AttachThreadInput', 'bool', [
      'uint32',
      'uint32',
      'bool',
    ])
    const GetCurrentThreadId = kernel32.func('__stdcall', 'GetCurrentThreadId', 'uint32', [])

    return {
      enumerateWindows(): WindowInfo[] {
        const found: WindowInfo[] = []
        const callback = koffi.register(
          (hwnd: bigint): boolean => {
            try {
              if (!IsWindowVisible(hwnd)) return true
              const buffer = Buffer.alloc(1024)
              const length = GetWindowTextW(hwnd, buffer, 512)
              if (length <= 0) return true
              const pidBuffer = Buffer.alloc(4)
              GetWindowThreadProcessId(hwnd, pidBuffer)
              found.push({
                hwnd,
                pid: pidBuffer.readUInt32LE(0),
                title: buffer.toString('utf16le', 0, length).trim(),
              })
            } catch {
              // Ignore a single bad window rather than aborting the sweep.
            }
            return true
          },
          koffi.pointer(EnumWindowsProc),
        )
        try {
          EnumWindows(callback, null)
        } finally {
          koffi.unregister(callback)
        }
        return found.filter((w) => w.title.length > 0)
      },

      activateWindow(hwnd: bigint): boolean {
        const foreground = GetForegroundWindow()
        const foregroundThread = foreground ? GetWindowThreadProcessId(foreground, null) : 0
        const currentThread = GetCurrentThreadId()

        // Windows forbids cross-thread SetForegroundWindow in most cases;
        // temporarily attaching to the foreground thread is the documented
        // workaround. Always detached again in `finally`.
        let attached = false
        try {
          if (foregroundThread && foregroundThread !== currentThread) {
            attached = !!AttachThreadInput(currentThread, foregroundThread, true)
          }
          if (IsIconic(hwnd)) {
            ShowWindow(hwnd, SW_RESTORE)
          }
          BringWindowToTop(hwnd)
          return !!SetForegroundWindow(hwnd)
        } catch {
          return false
        } finally {
          if (attached) {
            try {
              AttachThreadInput(currentThread, foregroundThread, false)
            } catch {
              // Ignore detach failures; the thread is released on exit anyway.
            }
          }
        }
      },
    }
  } catch (error) {
    if (process.env.NOVA_DEBUG_FOCUS) {
      console.warn('[NOVA] focus backend unavailable:', error)
    }
    return null
  }
}

/** Memoized accessor for the Win32 bridge. */
function loadWin32(): Promise<Win32 | null> {
  if (!win32Cache) {
    win32Cache = buildWin32()
  }
  return win32Cache
}

/**
 * Read the running-process table from the fixed Windows system binary.
 * Returns a map of PID -> image name. The argument vector is constant: no
 * caller-supplied or registry-supplied text is ever handed to the process.
 */
function readRunningProcesses(): Promise<Map<number, string>> {
  const tasklist = join(systemRoot(), 'System32', 'tasklist.exe')

  return new Promise((resolve) => {
    let stdout = ''
    let settled = false

    let child: ReturnType<typeof spawn>
    try {
      child = spawn(tasklist, ['/FO', 'CSV', '/NH'], {
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    } catch {
      resolve(new Map())
      return
    }

    const settle = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const processes = new Map<number, string>()
      for (const line of stdout.split(/\r?\n/)) {
        // Format: "chrome.exe","1234","Console","1","120,000 K"
        const match = line.match(/^"([^"]*)","(\d+)"/)
        if (!match) continue
        const image = match[1]
        if (!SAFE_IMAGE_NAME.test(image)) continue
        processes.set(Number(match[2]), image)
      }
      resolve(processes)
    }

    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        // Already exited.
      }
      settle()
    }, TASKLIST_TIMEOUT_MS)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.on('error', () => settle())
    child.on('close', () => settle())
  })
}

/**
 * Derive the process image names we are willing to match for a registry entry.
 * Returns an empty list when the entry cannot yield a safe image name (for
 * example an unresolved `.lnk` shortcut), which the caller treats as
 * "cannot focus".
 */
export function candidateImageNames(exePath: string): string[] {
  const base = basename(exePath || '', extname(exePath || ''))
  const candidates = [base, basename(exePath || '')]
  const unique: string[] = []
  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase()
    if (!SAFE_IMAGE_NAME.test(normalized)) continue
    if (unique.includes(normalized)) continue
    unique.push(normalized)
  }
  return unique
}

/** Pick the best window for a set of candidate processes, deterministically. */
function chooseWindow(windows: WindowInfo[], pids: Set<number>, appName: string): WindowInfo | null {
  const matches = windows.filter((w) => pids.has(w.pid))
  if (matches.length === 0) return null
  if (matches.length === 1) return matches[0]
  const needle = appName.trim().toLowerCase()
  if (needle.length >= 3) {
    const titled = matches.find((w) => w.title.toLowerCase().includes(needle))
    if (titled) return titled
  }
  // Stable tie-break so repeated invocations behave identically.
  return [...matches].sort((a, b) => (a.pid === b.pid ? Number(a.hwnd - b.hwnd) : a.pid - b.pid))[0]
}

export function createWindowsApplicationFocusService(): ApplicationFocusService {
  return {
    async focusApplication(request: FocusRequest): Promise<FocusResult> {
      const win32 = await loadWin32()
      if (!win32) return { outcome: 'unavailable' }

      const candidates = candidateImageNames(request.exePath)
      if (candidates.length === 0) return { outcome: 'not-running' }

      const processes = await readRunningProcesses()
      if (processes.size === 0) return { outcome: 'unavailable' }

      const pids = new Set<number>()
      let matchedImage: string | undefined
      for (const [pid, image] of processes) {
        const normalized = image.toLowerCase()
        if (candidates.includes(normalized)) {
          pids.add(pid)
          matchedImage = normalized
        }
      }
      if (pids.size === 0) return { outcome: 'not-running' }

      let windows: WindowInfo[]
      try {
        windows = win32.enumerateWindows()
      } catch {
        return { outcome: 'unavailable' }
      }

      const target = chooseWindow(windows, pids, request.appName)
      if (!target) return { outcome: 'not-running' }

      let activated = false
      try {
        activated = win32.activateWindow(target.hwnd)
      } catch {
        activated = false
      }
      if (!activated) return { outcome: 'unavailable' }

      return {
        outcome: 'focused',
        processName: matchedImage,
        pid: target.pid,
        windowTitle: target.title,
      }
    },
  }
}