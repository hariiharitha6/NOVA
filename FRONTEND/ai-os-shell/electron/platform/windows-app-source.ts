// Windows-specific app discovery. Implements the platform-neutral AppSource.
// Scans the "App Paths" registry key and the user Start Menu shortcuts folder.

import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { AppEntry, AppSource } from '../core/types'

interface RegQueryResult {
  subkeys: string[]
  defaultValues: Record<string, string>
}

function regQuery(subkey: string): Promise<RegQueryResult> {
  return new Promise((resolve) => {
    const child = spawn(
      'reg.exe',
      ['query', `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${subkey}`, '/s'],
      { windowsHide: true },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()))
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    child.on('close', (code) => {
      if (code !== 0 || !stdout.trim()) {
        resolve({ subkeys: [], defaultValues: {} })
        return
      }
      const subkeys = new Set<string>()
      const defaultValues: Record<string, string> = {}
      for (const line of stdout.split(/\r?\n/)) {
        const header = line.match(/^HKEY_LOCAL_MACHINE\\(.+)$/)
        if (header) {
          const key = header[1].replace(/\\App Paths\\/i, '')
          if (key && key !== subkey) subkeys.add(key)
        }
      }
      const defaultMatch = stdout.match(/\(Default\)\s+REG_SZ\s+(.+)/i)
      if (defaultMatch) defaultValues[subkey] = defaultMatch[1].trim()
      resolve({ subkeys: [...subkeys], defaultValues })
    })
  })
}

async function readAppPaths(): Promise<AppEntry[]> {
  try {
    const root = await regQuery('')
    const details = await Promise.all(root.subkeys.map((key) => regQuery(key)))
    const entries: AppEntry[] = []
    for (let i = 0; i < root.subkeys.length; i++) {
      const key = root.subkeys[i]
      const exePath = details[i].defaultValues[key]
      if (!exePath || !/\.exe$/i.test(exePath)) continue
      const name = basename(exePath, extname(exePath))
      entries.push({
        id: `app-path-${name.toLowerCase()}`,
        name,
        aliases: [],
        path: exePath,
      })
    }
    return entries
  } catch {
    // Registry unavailable (non-Windows or restricted). Fall back gracefully.
    return []
  }
}

function scanStartMenu(dir: string): AppEntry[] {
  const entries: AppEntry[] = []
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        entries.push(...scanStartMenu(join(dir, entry.name)))
        continue
      }
      if (!/\.(lnk|url)$/i.test(entry.name)) continue
      const name = basename(entry.name, extname(entry.name))
      entries.push({
        id: `startmenu-${name.toLowerCase()}`,
        name,
        aliases: [],
        path: join(dir, entry.name),
      })
    }
  } catch {
    // Folder may not exist.
  }
  return entries
}

export class WindowsAppSource implements AppSource {
  readonly id = 'windows-app-source'

  async discover(): Promise<AppEntry[]> {
    const appPathEntries = await readAppPaths()
    const user = process.env.APPDATA
    const startMenuDirs = [
      user ? join(user, 'Microsoft', 'Windows', 'Start Menu', 'Programs') : '',
      'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs',
    ].filter(Boolean)
    const startMenuEntries = startMenuDirs.flatMap(scanStartMenu)
    return [...appPathEntries, ...startMenuEntries]
  }
}
