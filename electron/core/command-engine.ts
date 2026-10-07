// Deterministic command engine. Platform-neutral.
// Parses user input and emits ONLY typed StructuredActions. Never raw shell strings.
//
// v0.3 (V03-S4): this parser deliberately does NOT assign `StructuredAction.risk`.
// Recognition and risk are separate concerns, and a future natural-language or AI
// interpreter must not be able to declare its own proposal safe. The risk level is
// stamped deterministically by electron/core/risk-policy.ts, which the command
// pipeline applies immediately before the confirmation gate.

import type {
  AppEntry,
  FileFolderEntry,
  RegistrySnapshot,
  StructuredAction,
  WebsiteEntry,
} from './types'

export type CommandSource = Omit<RegistrySnapshot, 'apps'> & { apps: AppEntry[] }

const WEBSITE_PATTERN = /^https?:\/\//i

/**
 * The ONLY two origins NOVA will ever construct a search URL from. They are
 * exported so the optional AI interpreter (v0.3 V03-S5) builds search URLs
 * through this same code instead of duplicating the string — one place decides
 * where a web search may go.
 */
export const GOOGLE_SEARCH_ORIGIN = 'https://www.google.com/search?q='
export const YOUTUBE_SEARCH_ORIGIN = 'https://www.youtube.com/results?search_query='

/**
 * Build a search action from a raw query. The origin is constant and only the
 * query varies, so the query is `encodeURIComponent`-escaped and can never be
 * parsed as anything but data. Returns null for a blank query.
 *
 * Shared by the deterministic parser and the AI interpreter so the trusted
 * origins cannot drift apart.
 */
export function buildSearchAction(
  intent: 'SEARCH_WEB' | 'SEARCH_YOUTUBE',
  rawQuery: string,
): StructuredAction | null {
  const query = rawQuery.trim()
  if (!query) return null
  if (intent === 'SEARCH_YOUTUBE') {
    return {
      intent: 'SEARCH_YOUTUBE',
      target: `${YOUTUBE_SEARCH_ORIGIN}${encodeURIComponent(query)}`,
      label: `Search YouTube for "${query}"`,
      arguments: { query },
    }
  }
  return {
    intent: 'SEARCH_WEB',
    target: `${GOOGLE_SEARCH_ORIGIN}${encodeURIComponent(query)}`,
    label: `Search Google for "${query}"`,
    arguments: { query },
  }
}

/**
 * Outer noise around a command: surrounding punctuation and quotation marks.
 * Applied to both the normalized query and the raw text used for intent
 * patterns, so "open chrome.", `"open chrome"` and "Open Chrome!" all match.
 */
const OUTER_NOISE = /^[.,!?;:"'\s]+|[.,!?;:"'\s]+$/g

/** Polite fillers that may precede a real command ("please open", "can you"). */
const LEADING_FILLER_CHAIN =
  /^(?:(?:please|kindly|could you|could|can you|can i|can|would you|could you please|would|will you|do you|hey|hello|hi|okay|ok|alright)\s+)+/i

/**
 * A stripped input is trusted ONLY when it would still begin with a real
 * command verb. This gate means fillers can never turn arbitrary text (an app
 * literally named "Hello", a query starting with a filler word, ...) into a
 * different command.
 */
const COMMAND_START = /^(?:open|launch|start|focus|bring|switch|show|search|go to|google|youtube|yt|settings|preferences|recents|favorites)\b/i

/** Trailing politeness: "open chrome please" must not break target matching. */
const TRAILING_POLITE = /(?:\s+(?:please|kindly|for me|for me please|thank you|thanks))+\s*$/i

/**
 * Strip spoken/text fillers and trailing politeness from a command. Only the
 * leading fillers are gated on a following command verb (see COMMAND_START),
 * so natural phrasing like "please open chrome", "can you open chrome" or
 * "could you open chrome please" resolves to exactly the same command as the
 * bare phrase — through the SAME shared engine, never a second parser.
 */
function cleanCommandText(input: string): string {
  let t = input.trim().replace(/\s+/g, ' ')
  t = t.replace(TRAILING_POLITE, ' ').trim()
  for (;;) {
    const rest = t.replace(LEADING_FILLER_CHAIN, '')
    if (rest === t) break
    if (!COMMAND_START.test(rest)) break
    t = rest.replace(/\s+/g, ' ').trim()
  }
  // Fold the spoken two-word variant into the canonical name so every pattern
  // and the shared matcher agree ("open you tube" == "open youtube").
  return t.replace(OUTER_NOISE, '').trim().replace(/\byou\s+tube\b/gi, 'youtube').trim()
}

function normalize(input: string): string {
  return input
    .replace(OUTER_NOISE, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\byou\s+tube\b/g, 'youtube')
}

/** "open THE chrome" is as natural to say as "open chrome". */
function stripLeadingArticle(name: string): string {
  return name.trim().replace(/^the\s+/i, '').trim()
}

function aliasMatch(query: string, names: string[], aliases: string[]): boolean {
  const q = normalize(query)
  if (!q) return false
  // Matching is deliberate about the definite article: compare the leading-the
  // forms TOO, so "open the chrome" and "open the verge" both resolve without
  // ever corrupting proper names that begin with "The" (the full form is still
  // compared verbatim first).
  const qNoArticle = q.replace(/^the\s+/, '')
  return names.some((n) => {
    const nn = normalize(n)
    return nn === q || nn === qNoArticle
  }) || aliases.some((a) => {
    const na = normalize(a)
    return na === q || na === qNoArticle
  })
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
  // Spoken natural language reaches the same engine as typed commands; the
  // clean pass only strips fillers/politeness/punctuation/trailing "the" —
  // never raw user text that legitimately belongs to a query or a name.
  const text = cleanCommandText(raw)
  const query = normalize(text)

  if (!query) {
    return clarification('Type a command. For example: "Open Chrome" or "Open YouTube".')
  }

  if (WEBSITE_PATTERN.test(text)) {
    return {
      intent: 'OPEN_WEBSITE',
      target: text,
      label: text,
    }
  }

  // Search commands
  const searchMatch = text.match(/^search\s+(?:youtube|yt)\s+for\s+(.+)$/i) ?? text.match(/^search\s+(?:google|web)\s+for\s+(.+)$/i) ??
    text.match(/^youtube\s+search\s+(.+)$/i) ?? text.match(/^yt\s+search\s+(.+)$/i) ??
    text.match(/^google\s+search\s+(.+)$/i) ??
    text.match(/^search\s+for\s+(.+)$/i) ??
    text.match(/^search\s+the\s+web\s+for\s+(.+)$/i)

  if (searchMatch) {
    const query = searchMatch[1].trim()
    if (!query) {
      return clarification('Please provide a search query.')
    }
    if (/\b(?:youtube|yt)\b/i.test(text) && !/^(search\s+(?:google|web))/i.test(text)) {
      const action = buildSearchAction('SEARCH_YOUTUBE', query)
      if (action) return action
    }
    const web = buildSearchAction('SEARCH_WEB', query)
    if (web) return web
  }

  // Direct search patterns
  if (text.match(/^search\s+youtube\s+(.+)$/i)) {
    const q = text
      .replace(/^search\s+youtube\s+/i, '')
      .replace(/^for\s+/i, '')
      .replace(/^for$/i, '')
      .trim()
    const action = buildSearchAction('SEARCH_YOUTUBE', q)
    if (action) return action
    return clarification('Please provide a search query.')
  }
  if (text.match(/^search\s+google\s+(.+)$/i) || text.match(/^search\s+web\s+(.+)$/i)) {
    const q = text
      .replace(/^search\s+(google|web)\s+/i, '')
      .replace(/^for\s+/i, '')
      .replace(/^for$/i, '')
      .trim()
    const action = buildSearchAction('SEARCH_WEB', q)
    if (action) return action
    return clarification('Please provide a search query.')
  }

  // Bare "google ..." or "youtube ..." search patterns
  if (text.match(/^youtube\s+(.+)$/i) || text.match(/^yt\s+(.+)$/i)) {
    const q = text.replace(/^(youtube|yt)\s+/i, '').trim()
    if (q && q.match(/^(search|for|results)/i) === null) {
      const action = buildSearchAction('SEARCH_YOUTUBE', q)
      if (action) return action
    }
  }
  if (text.match(/^google\s+(.+)$/i)) {
    const q = text.replace(/^google\s+/i, '').trim()
    if (q && q.match(/^(search|for)/i) === null) {
      const action = buildSearchAction('SEARCH_WEB', q)
      if (action) return action
    }
  }

  // Go to patterns
  if (text.match(/^go\s+to\s+youtube/i)) {
    return { intent: 'OPEN_WEBSITE', target: 'https://www.youtube.com', label: 'YouTube' }
  }
  if (text.match(/^go\s+to\s+google/i)) {
    return { intent: 'OPEN_WEBSITE', target: 'https://www.google.com', label: 'Google' }
  }

  // Show/focus patterns
  if (text.match(/^show\s+favou?rites?\b/i) || text.match(/^favou?rites?\b/i)) {
    return { intent: 'SHOW_FAVORITES', target: '', label: 'Show Favorites' }
  }
  // Singular and plural both accepted: "Show recent" is a normal thing to say
  // and previously fell through to a clarification (acceptance Bug 4).
  if (text.match(/^show\s+recents?\b/i) || text.match(/^recents?\b/i)) {
    return { intent: 'SHOW_RECENTS', target: '', label: 'Show Recents' }
  }
  // Windows Settings (the OPERATING SYSTEM's settings app) is a different
  // target from NOVA's own settings window, which stays behind "Open settings"
  // alone (acceptance Bug 5). Listed before the generic pattern on purpose.
  if (
    text.match(/^open\s+(?:the\s+)?(?:windows\s+)?system\s+settings/i) ||
    text.match(/^open\s+(?:the\s+)?windows\s+settings/i) ||
    text.match(/^open\s+(?:windows\s+)?settings\s+app$/i)
  ) {
    return {
      intent: 'OPEN_SYSTEM_SETTINGS',
      target: '',
      label: 'Open Windows Settings',
    }
  }
  if (text.match(/^open\s+settings/i) || text.match(/^settings/i) || text.match(/^preferences/i)) {
    return { intent: 'OPEN_SETTINGS', target: '', label: 'Open Settings' }
  }
  if (text.match(/^focus\s+(.+)$/i) || text.match(/^bring\s+(.+)\s+to\s+front$/i) || text.match(/^switch\s+to\s+(.+)$/i)) {
    const focusMatch = text.match(/^focus\s+(.+)$/i) ?? text.match(/^bring\s+(.+)\s+to\s+front$/i) ?? text.match(/^switch\s+to\s+(.+)$/i)
    const focusTerm = stripLeadingArticle(focusMatch ? focusMatch[1].trim() : '')
    // The target is always resolved against the validated registry, so a focus
    // command can never carry raw user text into the platform layer.
    const app = registry.apps.find((a) => aliasMatch(focusTerm, [a.name], a.aliases))
    if (app) {
      return { intent: 'FOCUS_APPLICATION', target: app.path, label: app.name }
    }
    const appLike = bestStartWith(registry.apps, focusTerm)
    if (appLike) {
      return { intent: 'FOCUS_APPLICATION', target: appLike.path, label: appLike.name }
    }
    // Unknown focus target: clarify instead of falling through to OPEN_*.
    // FOCUS_APPLICATION must never be downgraded into a launch.
    return clarification(
      `Could not find "${focusTerm}"`,
      'Focus needs an app NOVA already knows. Add it in Settings, or use "Open <App>" to start it.',
    )
  }

  const openMatch = text.match(/^open\s+(.+)$/i) ?? text.match(/^launch\s+(.+)$/i) ?? text.match(/^start\s+(.+)$/i)
  const remainder = openMatch ? stripLeadingArticle(openMatch[1].trim()) : text

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

  const resolved = resolveTarget(text, registry)
  if (resolved) return resolved

  const similar = similarNames(text, registry)
  if (similar.length > 0) {
      return {
        intent: 'CLARIFICATION',
        target: '',
        label: `Unknown command "${text}"`,
        description: 'Did you mean one of these?',
        suggestions: similar,
      }
    }

    return {
      intent: 'CLARIFICATION',
      target: '',
      label: `Unknown command "${text}"`,
      description: 'Try "Open <App>", "Open <website>", or "Open <folder>".',
    }
}

/**
 * Resolve a user-supplied NAME against the validated registry.
 *
 * This is the ONLY way any target becomes an executable path or a URL, and it is
 * shared by the deterministic parser and the optional AI interpreter
 * (v0.3 V03-S5). Exported so the AI path resolves a model-proposed name through
 * exactly the same rules instead of re-implementing them.
 *
 * Returns null when the name matches nothing. A resolved target is ALWAYS a
 * verbatim registry value — never text the user (or a model) supplied.
 */
export function resolveTarget(name: string, registry: CommandSource): StructuredAction | null {
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
