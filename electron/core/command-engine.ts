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
      risk: 'LOW',
    }
  }

  // Search commands
  const searchMatch = raw.match(/^search\s+(?:youtube|yt)\s+for\s+(.+)$/i) ?? raw.match(/^search\s+(?:google|web)\s+for\s+(.+)$/i) ??
    raw.match(/^youtube\s+search\s+(.+)$/i) ?? raw.match(/^yt\s+search\s+(.+)$/i) ??
    raw.match(/^google\s+search\s+(.+)$/i) ??
    raw.match(/^search\s+for\s+(.+)$/i) ??
    raw.match(/^search\s+the\s+web\s+for\s+(.+)$/i)
  
  if (searchMatch) {
    const query = searchMatch[1].trim()
    if (!query) {
      return clarification('Please provide a search query.')
    }
    if (/\b(?:youtube|yt)\b/i.test(raw) && !/^(search\s+(?:google|web))/i.test(raw)) {
      return {
        intent: 'SEARCH_YOUTUBE',
        target: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
        label: `Search YouTube for "${query}"`,
        arguments: { query },
        risk: 'LOW',
      }
    }
    return {
      intent: 'SEARCH_WEB',
      target: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      label: `Search Google for "${query}"`,
      arguments: { query },
      risk: 'LOW',
    }
  }

  // Direct search patterns
  if (raw.match(/^search\s+youtube\s+(.+)$/i)) {
    const q = raw
      .replace(/^search\s+youtube\s+/i, '')
      .replace(/^for\s+/i, '')
      .replace(/^for$/i, '')
      .trim()
    if (!q) return clarification('Please provide a search query.')
    return {
      intent: 'SEARCH_YOUTUBE',
      target: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
      label: `Search YouTube for "${q}"`,
      arguments: { query: q },
      risk: 'LOW',
    }
  }
  if (raw.match(/^search\s+google\s+(.+)$/i) || raw.match(/^search\s+web\s+(.+)$/i)) {
    const q = raw
      .replace(/^search\s+(google|web)\s+/i, '')
      .replace(/^for\s+/i, '')
      .replace(/^for$/i, '')
      .trim()
    if (!q) return clarification('Please provide a search query.')
    return {
      intent: 'SEARCH_WEB',
      target: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
      label: `Search Google for "${q}"`,
      arguments: { query: q },
      risk: 'LOW',
    }
  }

  // Bare "google ..." or "youtube ..." search patterns
  if (raw.match(/^youtube\s+(.+)$/i) || raw.match(/^yt\s+(.+)$/i)) {
    const q = raw.replace(/^(youtube|yt)\s+/i, '').trim()
    if (q && q.match(/^(search|for|results)/i) === null) {
      return {
        intent: 'SEARCH_YOUTUBE',
        target: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
        label: `Search YouTube for "${q}"`,
        arguments: { query: q },
        risk: 'LOW',
      }
    }
  }
  if (raw.match(/^google\s+(.+)$/i)) {
    const q = raw.replace(/^google\s+/i, '').trim()
    if (q && q.match(/^(search|for)/i) === null) {
      return {
        intent: 'SEARCH_WEB',
        target: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
        label: `Search Google for "${q}"`,
        arguments: { query: q },
        risk: 'LOW',
      }
    }
  }

  // Go to patterns
  if (raw.match(/^go\s+to\s+youtube/i)) {
    return { intent: 'OPEN_WEBSITE', target: 'https://www.youtube.com', label: 'YouTube', risk: 'LOW' }
  }
  if (raw.match(/^go\s+to\s+google/i)) {
    return { intent: 'OPEN_WEBSITE', target: 'https://www.google.com', label: 'Google', risk: 'LOW' }
  }

  // Show/focus patterns
  if (raw.match(/^show\s+favorites/i) || raw.match(/^favorites/i)) {
    return { intent: 'SHOW_FAVORITES', target: '', label: 'Show Favorites', risk: 'LOW' }
  }
  if (raw.match(/^show\s+recents/i) || raw.match(/^recents/i) || raw.match(/^recent/i)) {
    return { intent: 'SHOW_RECENTS', target: '', label: 'Show Recents', risk: 'LOW' }
  }
  if (raw.match(/^open\s+settings/i) || raw.match(/^settings/i) || raw.match(/^preferences/i)) {
    return { intent: 'OPEN_SETTINGS', target: '', label: 'Open Settings', risk: 'LOW' }
  }
  if (raw.match(/^focus\s+(.+)$/i) || raw.match(/^bring\s+(.+)\s+to\s+front$/i) || raw.match(/^switch\s+to\s+(.+)$/i)) {
    const focusMatch = raw.match(/^focus\s+(.+)$/i) ?? raw.match(/^bring\s+(.+)\s+to\s+front$/i) ?? raw.match(/^switch\s+to\s+(.+)$/i)
    const focusTerm = focusMatch ? focusMatch[1].trim() : ''
    const app = registry.apps.find((a) => aliasMatch(focusTerm, [a.name], a.aliases))
    if (app) {
      return { intent: 'FOCUS_APPLICATION', target: app.path, label: app.name, risk: 'LOW' }
    }
    const appLike = bestStartWith(registry.apps, focusTerm)
    if (appLike) {
      return { intent: 'FOCUS_APPLICATION', target: appLike.path, label: appLike.name, risk: 'LOW' }
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
        risk: 'LOW',
      }
    }
    return {
      intent: 'CLARIFICATION',
      target: '',
      label: `Could not find "${remainder}"`,
      description: 'Check the name, or add it to NOVA in Settings.',
      risk: 'LOW',
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
        risk: 'LOW',
      }
    }

    return {
      intent: 'CLARIFICATION',
      target: '',
      label: `Unknown command "${raw}"`,
      description: 'Try "Open <App>", "Open <website>", or "Open <folder>".',
      risk: 'LOW',
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
      risk: 'LOW',
    }
  }

  const app = registry.apps.find((a) => aliasMatch(q, [a.name], a.aliases))
  if (app) {
    return { intent: 'OPEN_APPLICATION', target: app.path, label: app.name, risk: 'LOW' }
  }

  const website = registry.websites.find((w) => aliasMatch(q, [w.name], w.aliases))
  if (website) {
    return { intent: 'OPEN_WEBSITE', target: website.url, label: website.name, risk: 'LOW' }
  }

  const appLike = bestStartWith(registry.apps, q)
  if (appLike) return { intent: 'OPEN_APPLICATION', target: appLike.path, label: appLike.name, risk: 'LOW' }

  const websiteLike = bestStartWith(registry.websites, q)
  if (websiteLike) return { intent: 'OPEN_WEBSITE', target: websiteLike.url, label: websiteLike.name, risk: 'LOW' }

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
  return { intent: 'CLARIFICATION', target: '', label, description, risk: 'LOW' }
}
