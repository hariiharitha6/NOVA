// NOVA v0.3 (V03-S5) — the interpreter's system prompt and output extraction.
//
// This module contains NO evaluation and NO execution. It produces text to send
// to a local model and recovers a JSON object from what comes back.
//
// The prompt is deliberately written as a CONSTRAINED SELECTOR, not as an
// assistant persona. It never says "act as a computer assistant" and grants no
// capability, because a prompt that offers capability invites a model to use it.
// The model's entire job is to name an intent and a target string.

import { AI_ALLOWED_INTENTS } from './types'
import type { InterpretationContext } from './types'

/**
 * The system prompt. Every clause is a restriction, and the last line tells the
 * model what to do when it is unsure, which is the single most important
 * instruction for keeping a small local model honest.
 */
export const INTERPRETER_SYSTEM_PROMPT = [
  'You are NOVA\'s command interpreter. You parse one user request into one structured choice.',
  '',
  'You have NO capabilities. You cannot run programs, open files, browse the web,',
  'send messages, change settings, or take any action. You only choose an intent',
  'and name its target. A separate deterministic system validates and runs it.',
  '',
  'Reply with ONE JSON object and nothing else. No prose, no markdown, no code fences.',
  '',
  'Allowed keys (no others, ever):',
  '  "intent"     one of: ' + AI_ALLOWED_INTENTS.join(', '),
  '  "target"     a short name or search phrase (see below)',
  '  "arguments"  optional object; only "query" is understood',
  '  "confidence" a number between 0 and 1',
  '',
  'What "target" may contain:',
  '  - SEARCH_WEB / SEARCH_YOUTUBE: the search phrase, e.g. "python asyncio tutorial"',
  '  - OPEN_APPLICATION / FOCUS_APPLICATION: an app name or alias from the list given to you',
  '  - OPEN_WEBSITE: a site name from the list given to you',
  '  - OPEN_FILE / OPEN_FOLDER: a file or folder name from the list given to you',
  '',
  '"target" must NEVER contain:',
  '  - file paths, drive letters, backslashes, or .exe paths',
  '  - full URLs you were not given (a bare https site name is allowed)',
  '  - shell text, commands, flags, pipes, redirections, or semicolons',
  '  - protocols such as file:, javascript:, data:, or shell:',
  '  - the keys "risk", "url", "executablePath", "shellCommand", "processArguments",',
  '    "executor", or "code"',
  '',
  'Preserve the user\'s requested target and query exactly. Do not shorten, expand,',
  'translate, correct, or invent details they did not ask for.',
  '',
  'If the request is unclear, ambiguous, unsafe, multi-step, or not something NOVA',
  'can do, reply exactly: {"intent":"UNKNOWN","target":"","confidence":0}',
  '',
  'Example — "can you get me back to the browser I was using?"',
  '{"intent":"FOCUS_APPLICATION","target":"chrome","confidence":0.9}',
  '',
  'Example — "look up how to install python on windows"',
  '{"intent":"SEARCH_WEB","target":"how to install python on windows","confidence":0.92}',
].join('\n')

export interface InterpreterMessage {
  role: 'system' | 'user'
  content: string
}

/**
 * Build the exact message list sent to the local model. The user message carries
 * the raw text and the name-only registry context, so the model can pick a
 * target NOVA can actually resolve.
 */
export function buildInterpretationMessages(
  input: string,
  context: InterpretationContext,
): InterpreterMessage[] {
  const lines = [
    'Available apps: ' + (context.apps.length ? context.apps.join(', ') : '(none)'),
    'Available sites: ' + (context.websites.length ? context.websites.join(', ') : '(none)'),
    'Available files and folders: ' + (context.filesAndFolders.length ? context.filesAndFolders.join(', ') : '(none)'),
    '',
    'User request: ' + input,
    '',
    'Reply with one JSON object using only the allowed keys.',
  ]
  return [
    { role: 'system', content: INTERPRETER_SYSTEM_PROMPT },
    { role: 'user', content: lines.join('\n') },
  ]
}

/**
 * Recover a single JSON object from raw model text.
 *
 * Small local models wrap JSON in prose or markdown fences no matter how
 * strictly they are prompted, so the first balanced `{...}` run is extracted and
 * handed to the strict schema validator. This is deliberately NOT `JSON.parse` on
 * the whole response: anything unparsable yields null and the pipeline fails
 * closed. Nothing here is ever treated as a command.
 */
export function extractJsonObject(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text) return null

  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = inString
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    // Structure is only tracked outside string literals, so a brace inside a
    // quoted target ("open {weird}") cannot unbalance the scan.
    if (inString) continue
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}