// Deterministic command engine. Platform-neutral.
// Parses user input and emits ONLY typed StructuredActions. Never raw shell strings.

import type {
  AppEntry,
  FileFolderEntry,
  RegistrySnapshot,
  StructuredAction,
  WebsiteEntry,
} from './types'

export type CommandSource = Omit<RegistrySnapshot, 'apps'> & { apps: AppEntry[] }

const WEBSITE_PATTERN = /^https?:\/\//i

function normalize(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLowerCase()
}

function aliasMatch(query: string, names: string[], aliases: string[]): boolean {
  const q = normalize(query)
  if (!q) return false
  return names.some((n) => normalize(n) === q) || aliases.some((a) => normalize(a) === q)
}

function startsWithScore(name: string, query: string): number {
  const n = normalize(name)
  const q = normalize(query)
  if (!n.startsWith(q)) return -1
  return q.length / n.length
}

function bestStartWith<T extends { name: string }>(items: T[], query: string): T | undefined {
  let best: T | undefined
  let bestScore = -1
  for (const item of items) {
    const score = startsWithScore(item.name, query)
    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }
  return best
}

export function resolveCommand(
  input: string,
  registry: CommandSource,
): StructuredAction {
  const raw = input.trim()
  const query = normalize(raw)

  if (!query) {
    return clarification('Type a command. For example: "Open Chrome" or "Open YouTube".')
  }

  if (WEBSITE_PATTERN.test(raw)) {
    return {
      intent: 'OPEN_WEBSITE',
      target: raw,
      label: raw,
    }
  }

  const openMatch = raw.match(/^open\s+(.+)$/i) ?? raw.match(/^launch\s+(.+)$/i) ?? raw.match(/^start\s+(.+)$/i)
  const remainder = openMatch ? openMatch[1].trim() : raw

  if (openMatch) {
    const resolved = resolveTarget(remainder, registry)
    if (resolved) return resolved

    const similar = similarNames(remainder, registry)
    if (similar.length > 0) {
      return {
        intent: 'CLARIFICATION',
        target: '',
        label: `Could not find "${remainder}"`,
        description: 'Did you mean one of these?',
        suggestions: similar,
      }
    }
    return {
      intent: 'CLARIFICATION',
      target: '',
      label: `Could not find "${remainder}"`,
      description: 'Check the name, or add it to NOVA in Settings.',
    }
  }

  const resolved = resolveTarget(raw, registry)
  if (resolved) return resolved

  const similar = similarNames(raw, registry)
  if (similar.length > 0) {
    return {
      intent: 'CLARIFICATION',
      target: '',
      label: `Unknown command "${raw}"`,
      description: 'Did you mean one of these?',
      suggestions: similar,
    }
  }

  return {
    intent: 'CLARIFICATION',
    target: '',
    label: `Unknown command "${raw}"`,
    description: 'Try "Open <App>", "Open <website>", or "Open <folder>".',
  }
}

function resolveTarget(name: string, registry: CommandSource): StructuredAction | null {
  const q = name.trim()
  if (!q) return null

  const fileEntry = resolveFileFolder(q, registry.fileFolders)
  if (fileEntry) {
    return {
      intent: fileEntry.kind === 'folder' ? 'OPEN_FOLDER' : 'OPEN_FILE',
      target: fileEntry.path,
      label: fileEntry.name,
    }
  }

  const app = registry.apps.find((a) => aliasMatch(q, [a.name], a.aliases))
  if (app) {
    return { intent: 'OPEN_APPLICATION', target: app.path, label: app.name }
  }

  const website = registry.websites.find((w) => aliasMatch(q, [w.name], w.aliases))
  if (website) {
    return { intent: 'OPEN_WEBSITE', target: website.url, label: website.name }
  }

  const appLike = bestStartWith(registry.apps, q)
  if (appLike) return { intent: 'OPEN_APPLICATION', target: appLike.path, label: appLike.name }

  const websiteLike = bestStartWith(registry.websites, q)
  if (websiteLike) return { intent: 'OPEN_WEBSITE', target: websiteLike.url, label: websiteLike.name }

  return null
}

function resolveFileFolder(q: string, entries: FileFolderEntry[]): FileFolderEntry | undefined {
  return entries.find((e) => aliasMatch(q, [e.name], []))
}

function similarNames(name: string, registry: CommandSource): string[] {
  const q = normalize(name)
  const all = [
    ...registry.apps.map((a) => a.name),
    ...registry.websites.map((w) => w.name),
    ...registry.fileFolders.map((f) => f.name),
  ]
  return all
    .filter((n) => {
      const nn = normalize(n)
      return nn.includes(q) || q.includes(nn)
    })
    .slice(0, 5)
}

function clarification(label: string, description?: string): StructuredAction {
  return { intent: 'CLARIFICATION', target: '', label, description }
}
