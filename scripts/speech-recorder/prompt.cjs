'use strict'

// Pure prompt/hint derivation for the local recorder. Kept dependency-free and
// CommonJS so the Electron main process and the vitest suite can both load it.

/** Must match DEFAULT_WAKE_PHRASE in electron/core/speech/constants.ts. */
const WAKE_PHRASE = 'Hey NOVA'

/**
 * The text the tester should speak for a sample. Backed entirely by the
 * manifest, so it can never drift from what the harness scores.
 */
function derivePrompt(sample) {
  if (sample.category === 'wake') return WAKE_PHRASE
  if (sample.category === 'noise') return ''
  return sample.reference || ''
}

/** A short, human tip based on the sample's id prefix (its coverage bucket). */
function hintForId(id) {
  if (id.startsWith('cmd-normal-')) return 'Speak naturally, at a normal pace.'
  if (id.startsWith('cmd-fast-')) return 'Speak quickly, like you are in a hurry.'
  if (id.startsWith('cmd-slow-')) return 'Speak slowly and clearly.'
  if (id.startsWith('cmd-pause-')) return 'Insert a clear 0.5-1.5 s pause in the middle.'
  if (id.startsWith('cmd-app-')) return 'This names an application.'
  if (id.startsWith('cmd-web-')) return 'This names a website.'
  if (id.startsWith('cmd-chat-')) return 'Say it as a natural, conversational request.'
  if (id.startsWith('cmd-noisy-')) return 'Start the background sound, then speak over it.'
  if (id.startsWith('wake-pos-')) return 'Say the wake phrase. Vary distance and angle.'
  if (id.startsWith('wake-neg-')) return 'Say this clearly - it must NOT trigger the wake word.'
  if (id.startsWith('noise-')) return 'Do NOT speak. Record the named background sound only.'
  return 'Record the sample.'
}

module.exports = { WAKE_PHRASE, derivePrompt, hintForId }
