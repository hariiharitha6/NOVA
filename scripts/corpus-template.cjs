'use strict'

// Single source of truth for the local speech benchmark corpus skeleton.
//
// `scripts/speech-corpus-init.mjs` turns this into the schema-clean
// `benchmark/speech/corpus.json` (the exact shape `electron/core/speech/
// benchmark.ts` -> parseManifest validates) plus a human-readable
// `benchmark/speech/RECORDING.md`. `tests/corpus-template.test.ts` validates
// that every command's `expected` values are actually reproduced by the real
// `resolveCommand` engine, and that each required coverage bucket is met.
//
// This file contains NO recorded audio and NO measured results — only the
// prompts and the ground-truth labels a tester must produce. Recording is a
// separate, explicitly consented, local-only step (npm run benchmark:record).
//
// ID scheme (the prefix encodes the coverage bucket, which keeps the manifest
// strictly schema-clean while still telling the recorder how to guide the user):
//   cmd-normal-###  Indian-English, normal pace
//   cmd-fast-###    spoken quickly
//   cmd-slow-###    spoken slowly
//   cmd-pause-###   with a deliberate pause inside the sentence
//   cmd-app-###     names an application
//   cmd-web-###     names a website
//   cmd-chat-###    natural conversational phrasing
//   cmd-noisy-###   spoken over representative background noise
//   wake-pos-###    "Hey Nova" positives (must trigger)
//   wake-neg-###    non-wake speech (must NOT trigger)
//   noise-###       silence / ambient sound only (must NOT trigger)

/** Must match DEFAULT_WAKE_PHRASE in electron/core/speech/constants.ts. */
const WAKE_PHRASE = 'Hey NOVA'

const file = (id) => `samples/${id}.wav`

const CORPUS_NOTES =
  'Local-only speech benchmark corpus. Audio is recorded on your own machine, ' +
  'never uploaded, never sent to Ollama or any API, and is excluded from git ' +
  '(benchmark/speech/). Record with npm run benchmark:record; score with ' +
  'npm run benchmark:speech; delete everything with npm run speech:corpus:remove.'

function command(id, reference, expected, extra) {
  return {
    id,
    file: file(id),
    category: 'command',
    reference,
    accent: 'indian-en',
    speed: 'normal',
    ...extra,
    expected,
  }
}

function wakePositive(id) {
  return { id, file: file(id), category: 'wake', reference: '', wake: true, accent: 'indian-en' }
}

function wakeNegative(id, phrase) {
  return { id, file: file(id), category: 'negative', reference: phrase, wake: false, accent: 'indian-en' }
}

function noiseSample(id, label) {
  return { id, file: file(id), category: 'noise', reference: '', wake: false, noise: label }
}

const NORMAL = [
  command('cmd-normal-001', 'open Google Chrome', { intent: 'OPEN_APPLICATION', target: 'Google Chrome' }),
  command('cmd-normal-002', 'open Notepad', { intent: 'OPEN_APPLICATION', target: 'Notepad' }),
  command('cmd-normal-003', 'open YouTube', { intent: 'OPEN_WEBSITE', target: 'YouTube' }),
  command('cmd-normal-004', 'open Gmail', { intent: 'OPEN_WEBSITE', target: 'Gmail' }),
  command('cmd-normal-005', 'open Calculator', { intent: 'OPEN_APPLICATION', target: 'Calculator' }),
  command('cmd-normal-006', 'open Downloads', { intent: 'OPEN_FOLDER', target: 'Downloads' }),
  command('cmd-normal-007', 'open Documents', { intent: 'OPEN_FOLDER', target: 'Documents' }),
  command('cmd-normal-008', 'open Spotify', { intent: 'OPEN_APPLICATION', target: 'Spotify' }),
  command('cmd-normal-009', 'open GitHub', { intent: 'OPEN_WEBSITE', target: 'GitHub' }),
  command('cmd-normal-010', 'open WhatsApp', { intent: 'OPEN_WEBSITE', target: 'WhatsApp' }),
  command('cmd-normal-011', 'open File Explorer', { intent: 'OPEN_APPLICATION', target: 'File Explorer' }),
  command('cmd-normal-012', 'open settings', { intent: 'OPEN_SETTINGS' }),
  command('cmd-normal-013', 'open windows settings', { intent: 'OPEN_SYSTEM_SETTINGS' }),
  command('cmd-normal-014', 'open Visual Studio Code', { intent: 'OPEN_APPLICATION', target: 'Visual Studio Code' }),
  command('cmd-normal-015', 'launch chrome', { intent: 'OPEN_APPLICATION', target: 'Google Chrome' }),
  command('cmd-normal-016', 'start notepad', { intent: 'OPEN_APPLICATION', target: 'Notepad' }),
  command('cmd-normal-017', 'open the calculator', { intent: 'OPEN_APPLICATION', target: 'Calculator' }),
  command('cmd-normal-018', 'open files', { intent: 'OPEN_APPLICATION', target: 'File Explorer' }),
  command('cmd-normal-019', 'search google for best biryani near me', { intent: 'SEARCH_WEB' }),
  command('cmd-normal-020', 'search youtube for cricket highlights', { intent: 'SEARCH_YOUTUBE' }),
]

const FAST = [
  command('cmd-fast-021', 'open chrome', { intent: 'OPEN_APPLICATION', target: 'Google Chrome' }, { speed: 'fast' }),
  command('cmd-fast-022', 'open youtube', { intent: 'OPEN_WEBSITE', target: 'YouTube' }, { speed: 'fast' }),
  command('cmd-fast-023', 'open notepad', { intent: 'OPEN_APPLICATION', target: 'Notepad' }, { speed: 'fast' }),
  command('cmd-fast-024', 'open gmail', { intent: 'OPEN_WEBSITE', target: 'Gmail' }, { speed: 'fast' }),
  command('cmd-fast-025', 'open calculator', { intent: 'OPEN_APPLICATION', target: 'Calculator' }, { speed: 'fast' }),
]

const SLOW = [
  command('cmd-slow-026', 'open Google Chrome', { intent: 'OPEN_APPLICATION', target: 'Google Chrome' }, { speed: 'slow' }),
  command('cmd-slow-027', 'open YouTube', { intent: 'OPEN_WEBSITE', target: 'YouTube' }, { speed: 'slow' }),
  command('cmd-slow-028', 'open Spotify', { intent: 'OPEN_APPLICATION', target: 'Spotify' }, { speed: 'slow' }),
  command('cmd-slow-029', 'open File Explorer', { intent: 'OPEN_APPLICATION', target: 'File Explorer' }, { speed: 'slow' }),
  command('cmd-slow-030', 'open Documents', { intent: 'OPEN_FOLDER', target: 'Documents' }, { speed: 'slow' }),
]

const PAUSE = [
  command('cmd-pause-031', 'open chrome', { intent: 'OPEN_APPLICATION', target: 'Google Chrome' }),
  command('cmd-pause-032', 'open youtube', { intent: 'OPEN_WEBSITE', target: 'YouTube' }),
  command('cmd-pause-033', 'open notepad', { intent: 'OPEN_APPLICATION', target: 'Notepad' }),
  command('cmd-pause-034', 'open gmail', { intent: 'OPEN_WEBSITE', target: 'Gmail' }),
  command('cmd-pause-035', 'open github', { intent: 'OPEN_WEBSITE', target: 'GitHub' }),
  command('cmd-pause-036', 'open spotify', { intent: 'OPEN_APPLICATION', target: 'Spotify' }),
  command('cmd-pause-037', 'open calculator', { intent: 'OPEN_APPLICATION', target: 'Calculator' }),
  command('cmd-pause-038', 'open downloads', { intent: 'OPEN_FOLDER', target: 'Downloads' }),
  command('cmd-pause-039', 'open whatsapp', { intent: 'OPEN_WEBSITE', target: 'WhatsApp' }),
  command('cmd-pause-040', 'open file explorer', { intent: 'OPEN_APPLICATION', target: 'File Explorer' }),
]

const APP_NAMES = [
  command('cmd-app-041', 'open Google Chrome', { intent: 'OPEN_APPLICATION', target: 'Google Chrome' }),
  command('cmd-app-042', 'open Notepad', { intent: 'OPEN_APPLICATION', target: 'Notepad' }),
  command('cmd-app-043', 'open Visual Studio Code', { intent: 'OPEN_APPLICATION', target: 'Visual Studio Code' }),
  command('cmd-app-044', 'open vs code', { intent: 'OPEN_APPLICATION', target: 'Visual Studio Code' }),
  command('cmd-app-045', 'open Spotify', { intent: 'OPEN_APPLICATION', target: 'Spotify' }),
  command('cmd-app-046', 'open Calculator', { intent: 'OPEN_APPLICATION', target: 'Calculator' }),
  command('cmd-app-047', 'open File Explorer', { intent: 'OPEN_APPLICATION', target: 'File Explorer' }),
  command('cmd-app-048', 'launch chrome', { intent: 'OPEN_APPLICATION', target: 'Google Chrome' }),
  command('cmd-app-049', 'start notepad', { intent: 'OPEN_APPLICATION', target: 'Notepad' }),
  command('cmd-app-050', 'open the calculator', { intent: 'OPEN_APPLICATION', target: 'Calculator' }),
]

const WEB_NAMES = [
  command('cmd-web-051', 'open YouTube', { intent: 'OPEN_WEBSITE', target: 'YouTube' }),
  command('cmd-web-052', 'open Gmail', { intent: 'OPEN_WEBSITE', target: 'Gmail' }),
  command('cmd-web-053', 'open GitHub', { intent: 'OPEN_WEBSITE', target: 'GitHub' }),
  command('cmd-web-054', 'open WhatsApp', { intent: 'OPEN_WEBSITE', target: 'WhatsApp' }),
  command('cmd-web-055', 'open youtube', { intent: 'OPEN_WEBSITE', target: 'YouTube' }),
  command('cmd-web-056', 'open gmail', { intent: 'OPEN_WEBSITE', target: 'Gmail' }),
  command('cmd-web-057', 'open github', { intent: 'OPEN_WEBSITE', target: 'GitHub' }),
  command('cmd-web-058', 'open whatsapp', { intent: 'OPEN_WEBSITE', target: 'WhatsApp' }),
  command('cmd-web-059', 'go to youtube', { intent: 'OPEN_WEBSITE', target: 'YouTube' }),
  command('cmd-web-060', 'go to google', { intent: 'OPEN_WEBSITE', target: 'Google' }),
]

const CONVERSATIONAL = [
  command('cmd-chat-061', 'can you please open Google Chrome', { intent: 'OPEN_APPLICATION', target: 'Google Chrome' }),
  command('cmd-chat-062', 'could you open notepad for me', { intent: 'OPEN_APPLICATION', target: 'Notepad' }),
  command('cmd-chat-063', 'please open youtube', { intent: 'OPEN_WEBSITE', target: 'YouTube' }),
  command('cmd-chat-064', 'hey can you open spotify', { intent: 'OPEN_APPLICATION', target: 'Spotify' }),
  command('cmd-chat-065', 'would you open the calculator', { intent: 'OPEN_APPLICATION', target: 'Calculator' }),
  command('cmd-chat-066', 'kindly launch gmail', { intent: 'OPEN_WEBSITE', target: 'Gmail' }),
  command('cmd-chat-067', 'can you please open github', { intent: 'OPEN_WEBSITE', target: 'GitHub' }),
  command('cmd-chat-068', 'please start chrome', { intent: 'OPEN_APPLICATION', target: 'Google Chrome' }),
  command('cmd-chat-069', 'could you open whatsapp please', { intent: 'OPEN_WEBSITE', target: 'WhatsApp' }),
  command('cmd-chat-070', 'can you open file explorer', { intent: 'OPEN_APPLICATION', target: 'File Explorer' }),
]

const NOISY = [
  command('cmd-noisy-071', 'open chrome', { intent: 'OPEN_APPLICATION', target: 'Google Chrome' }, { noise: 'fan' }),
  command('cmd-noisy-072', 'open youtube', { intent: 'OPEN_WEBSITE', target: 'YouTube' }, { noise: 'tv' }),
  command('cmd-noisy-073', 'open notepad', { intent: 'OPEN_APPLICATION', target: 'Notepad' }, { noise: 'traffic' }),
  command('cmd-noisy-074', 'open gmail', { intent: 'OPEN_WEBSITE', target: 'Gmail' }, { noise: 'keyboard' }),
  command('cmd-noisy-075', 'open spotify', { intent: 'OPEN_APPLICATION', target: 'Spotify' }, { noise: 'music' }),
  command('cmd-noisy-076', 'open calculator', { intent: 'OPEN_APPLICATION', target: 'Calculator' }, { noise: 'children' }),
  command('cmd-noisy-077', 'open github', { intent: 'OPEN_WEBSITE', target: 'GitHub' }, { noise: 'fan' }),
  command('cmd-noisy-078', 'open whatsapp', { intent: 'OPEN_WEBSITE', target: 'WhatsApp' }, { noise: 'tv' }),
  command('cmd-noisy-079', 'open downloads', { intent: 'OPEN_FOLDER', target: 'Downloads' }, { noise: 'traffic' }),
  command('cmd-noisy-080', 'open file explorer', { intent: 'OPEN_APPLICATION', target: 'File Explorer' }, { noise: 'keyboard' }),
]

const WAKE_POSITIVE = [
  wakePositive('wake-pos-101'),
  wakePositive('wake-pos-102'),
  wakePositive('wake-pos-103'),
  wakePositive('wake-pos-104'),
  wakePositive('wake-pos-105'),
  wakePositive('wake-pos-106'),
  wakePositive('wake-pos-107'),
  wakePositive('wake-pos-108'),
  wakePositive('wake-pos-109'),
  wakePositive('wake-pos-110'),
  wakePositive('wake-pos-111'),
  wakePositive('wake-pos-112'),
  wakePositive('wake-pos-113'),
  wakePositive('wake-pos-114'),
  wakePositive('wake-pos-115'),
]

const WAKE_NEGATIVE = [
  wakeNegative('wake-neg-201', 'hello nova'),
  wakeNegative('wake-neg-202', 'hey jack'),
  wakeNegative('wake-neg-203', 'nova open chrome'),
  wakeNegative('wake-neg-204', 'open nova'),
  wakeNegative('wake-neg-205', 'hey you'),
  wakeNegative('wake-neg-206', 'nova nova'),
  wakeNegative('wake-neg-207', 'hay neighbour'),
  wakeNegative('wake-neg-208', 'hey nina'),
  wakeNegative('wake-neg-209', 'hey brother'),
  wakeNegative('wake-neg-210', 'hello world'),
  wakeNegative('wake-neg-211', 'nova scotia'),
  wakeNegative('wake-neg-212', 'hey everyone'),
  wakeNegative('wake-neg-213', 'okay google'),
  wakeNegative('wake-neg-214', 'hey sister'),
  wakeNegative('wake-neg-215', 'nova here'),
]

const NOISE_ONLY = [
  noiseSample('noise-301', 'silence'),
  noiseSample('noise-302', 'fan'),
  noiseSample('noise-303', 'tv'),
  noiseSample('noise-304', 'traffic'),
  noiseSample('noise-305', 'keyboard'),
  noiseSample('noise-306', 'door'),
  noiseSample('noise-307', 'cough'),
  noiseSample('noise-308', 'music'),
  noiseSample('noise-309', 'phone'),
  noiseSample('noise-310', 'room-tone'),
]

const CORPUS_SAMPLES = [
  ...NORMAL,
  ...FAST,
  ...SLOW,
  ...PAUSE,
  ...APP_NAMES,
  ...WEB_NAMES,
  ...CONVERSATIONAL,
  ...NOISY,
  ...WAKE_POSITIVE,
  ...WAKE_NEGATIVE,
  ...NOISE_ONLY,
]

/**
 * Coverage buckets keyed by the id prefix produced above. The description
 * strings intentionally mirror REQUIRED_CORPUS_COVERAGE in
 * electron/core/speech/benchmark.ts so the test can match them by substring.
 */
const COVERAGE_BUCKETS = [
  { match: 'normal speed', prefixes: ['cmd-normal-'], minimum: 20 },
  { match: 'fast and slow', prefixes: ['cmd-fast-', 'cmd-slow-'], minimum: 10 },
  { match: 'pauses', prefixes: ['cmd-pause-'], minimum: 10 },
  { match: 'application names', prefixes: ['cmd-app-'], minimum: 10 },
  { match: 'website names', prefixes: ['cmd-web-'], minimum: 10 },
  { match: 'conversational', prefixes: ['cmd-chat-'], minimum: 10 },
  { match: 'background noise', prefixes: ['cmd-noisy-'], minimum: 10 },
  { match: 'positive', prefixes: ['wake-pos-'], minimum: 15 },
  { match: 'non-wake speech', prefixes: ['wake-neg-'], minimum: 15 },
  { match: 'silence', prefixes: ['noise-'], minimum: 10 },
]

module.exports = {
  WAKE_PHRASE,
  CORPUS_NOTES,
  CORPUS_SAMPLES,
  COVERAGE_BUCKETS,
}
