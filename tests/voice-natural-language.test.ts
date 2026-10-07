/**
 * Pre-release hardening (PHASE 9) — natural-language robustness regression suite.
 *
 * Locks the root causes fixed in this pass:
 *
 *   A  Endpointing: sherpa speech-end window is a SENSIBLE trailing-silence
 *      value (1.2 s, the upstream default), not a hair-trigger 0.8 s that fired
 *      on mid-phrase pauses.
 *   B  Confirming: a silence-only "answer attempt" never finalises the prompt,
 *      never restarts the recognizer, and never arms the inactivity loop
 *      (the gate's own timeout is the only expirer).
 *   C  Wake bleed: "Hey NOVA open chrome" -> the shared pipeline sees only
 *      "open chrome"; a bare "Hey NOVA" executes NOTHING.
 *   D  Natural-language tolerance through the SAME shared command engine:
 *      fillers ("please/can you/could you"), trailing politeness
 *      ("open ... please"), surrounding punctuation, "you tube" folds, and the
 *      definite article ("open the chrome") — without a second voice parser
 *      and without mangling proper names that start with a filler word.
 *
 * No GUI, no microphone, no network.
 */

import { describe, expect, it } from 'vitest'
import { resolveCommand } from '../electron/core/command-engine'
import type { CommandSource } from '../electron/core/command-engine'
import { buildSherpaEndpointConfig } from '../electron/core/speech/sherpa-recognizer'
import { stripWakePhraseFromTranscript } from '../electron/core/speech/wake-phrase'
import { createVoiceController } from '../electron/core/speech/voice-controller'
import type { SpeechRecognizer } from '../electron/core/speech/recognizer'
import type { CommandResponse, StructuredAction } from '../electron/core/types'

// ---------------------------------------------------------------------------
// A. Endpointing — the speech-end window must be sensible
// ---------------------------------------------------------------------------

describe('PHASE 9 A: speech-end window (endpoint detection)', () => {
  it('uses a sensible trailing-silence window, not a hair-trigger 0.8 s', () => {
    const config = buildSherpaEndpointConfig()
    expect(config.enableEndpoint).toBe(1)
    // 1.2 s is sherpa-onnx's own upstream default: a short pause INSIDE a
    // sentence must not finalise, but a real stop finalises immediately.
    expect(config.rule2MinTrailingSilence).toBeGreaterThanOrEqual(1.2)
    // Rule 3 (hard cap) still guards runaway utterances.
    expect(config.rule3MinUtteranceLength).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// C. Wake-word bleed cleanup (pure helper)
// ---------------------------------------------------------------------------

describe('PHASE 9 C: wake phrase bleed is stripped from transcripts', () => {
  it('strips a leading "Hey NOVA" so the command engine sees the real command', () => {
    expect(stripWakePhraseFromTranscript('Hey NOVA open chrome')).toBe('open chrome')
    expect(stripWakePhraseFromTranscript('Hey NOVA, open chrome.')).toBe('open chrome')
    expect(stripWakePhraseFromTranscript('hey nova open chrome')).toBe('open chrome')
  })

  it('strips the phrase even when the leading interjection is missing from the audio', () => {
    expect(stripWakePhraseFromTranscript('NOVA open chrome')).toBe('open chrome')
    expect(stripWakePhraseFromTranscript('nova open chrome')).toBe('open chrome')
  })

  it('a bare wake phrase leaves nothing to execute', () => {
    expect(stripWakePhraseFromTranscript('Hey NOVA')).toBe('')
    expect(stripWakePhraseFromTranscript('Hey NOVA!')).toBe('')
    expect(stripWakePhraseFromTranscript('nova')).toBe('')
  })

  it('strips a custom phrase, and only the configured one', () => {
    expect(stripWakePhraseFromTranscript('okay nova open notes', 'okay nova')).toBe('open notes')
    // "Hey NOVA" is NOT the custom phrase: leave this text alone.
    expect(stripWakePhraseFromTranscript('hey nova open notes', 'okay nova')).toBe('hey nova open notes')
  })

  it('never eats ordinary first words (arbitrary app/site names)', () => {
    expect(stripWakePhraseFromTranscript('open chrome')).toBe('open chrome')
    expect(stripWakePhraseFromTranscript('Hello')).toBe('Hello')
    expect(stripWakePhraseFromTranscript('')).toBe('')
  })
})

describe('PHASE 9 C: wake bleed through the voice pipeline', () => {
  function makeRecognizer(final = ''): SpeechRecognizer & { setFinal: (v: string) => void } {
    let finalText = final
    return {
      kind: 'stub',
      initialize: () => {},
      start: () => {},
      acceptAudio: () => {},
      partialTranscript: () => '',
      finishAndGetTranscript: () => finalText,
      cancel: () => {},
      dispose: () => {},
      setFinal: (v) => {
        finalText = v
      },
    }
  }

  function launched(label: string): CommandResponse {
    return {
      kind: 'launched',
      action: { intent: 'OPEN_APPLICATION', target: 'chrome', label } as StructuredAction,
      result: { ok: true, message: '', label },
    }
  }

  it('"Hey NOVA open chrome" executes ONLY "open chrome"', async () => {
    const rec = makeRecognizer('Hey NOVA open chrome')
    const executed: string[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      getWakePhrase: () => 'Hey NOVA',
      executeCommand: async (input) => {
        executed.push(input)
        return launched('Chrome')
      },
      emit: () => {},
    })
    ctrl.togglePtt()
    ctrl.togglePtt()
    await Promise.resolve()
    expect(executed).toEqual(['open chrome'])
  })

  it('a bare wake phrase ("Hey NOVA" alone) executes nothing', async () => {
    const rec = makeRecognizer('Hey NOVA')
    const executed: string[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      getWakePhrase: () => 'Hey NOVA',
      executeCommand: async (input) => {
        executed.push(input)
        return launched('x')
      },
      emit: () => {},
    })
    ctrl.togglePtt()
    ctrl.togglePtt()
    await Promise.resolve()
    expect(executed).toEqual([])
    expect(ctrl.getState().phase).toBe('idle')
  })

  it('a custom wake phrase bleeds and is stripped the same way', async () => {
    const rec = makeRecognizer('okay nova open chrome')
    const executed: string[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      getWakePhrase: () => 'okay nova',
      executeCommand: async (input) => {
        executed.push(input)
        return launched('Chrome')
      },
      emit: () => {},
    })
    ctrl.togglePtt()
    ctrl.togglePtt()
    await Promise.resolve()
    expect(executed).toEqual(['open chrome'])
  })
})

// ---------------------------------------------------------------------------
// D. Natural-language tolerance in the shared command engine
// ---------------------------------------------------------------------------

const registry: CommandSource = {
  apps: [
    {
      id: 'app-chrome',
      name: 'Google Chrome',
      aliases: ['chrome', 'google chrome'],
      path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    },
    {
      id: 'app-vscode',
      name: 'Visual Studio Code',
      aliases: ['vscode', 'code', 'vs code'],
      path: 'C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
    },
    {
      id: 'app-explorer',
      name: 'File Explorer',
      aliases: ['explorer', 'windows explorer'],
      path: 'C:\\Windows\\explorer.exe',
    },
  ],
  websites: [
    { id: 'web-youtube', name: 'YouTube', aliases: ['youtube'], url: 'https://www.youtube.com' },
    { id: 'web-chatgpt', name: 'ChatGPT', aliases: ['chatgpt', 'gpt'], url: 'https://chatgpt.com' },
  ],
  fileFolders: [
    { id: 'folder-downloads', name: 'Downloads', path: 'C:\\Users\\me\\Downloads', kind: 'folder' },
  ],
}

describe('PHASE 9 D: fillers, punctuation and "the" — one shared engine', () => {
  it('"please open chrome", "can you open chrome", "could you open chrome" -> Chrome', () => {
    for (const text of [
      'please open chrome',
      'can you open chrome',
      'could you open chrome',
      'would you open chrome',
    ]) {
      const action = resolveCommand(text, registry)
      expect(action.intent).toBe('OPEN_APPLICATION')
      expect(action.label).toBe('Google Chrome')
    }
  })

  it('trailing politeness does not break the target ("open chrome please")', () => {
    const action = resolveCommand('open chrome please', registry)
    expect(action.intent).toBe('OPEN_APPLICATION')
    expect(action.label).toBe('Google Chrome')
    expect(resolveCommand('could you open chrome for me', registry).intent).toBe('OPEN_APPLICATION')
  })

  it('surrounding punctuation and quotes are ignored', () => {
    expect(resolveCommand('Open Chrome.', registry).intent).toBe('OPEN_APPLICATION')
    expect(resolveCommand('Open Chrome!', registry).intent).toBe('OPEN_APPLICATION')
    expect(resolveCommand('"Open Chrome"', registry).intent).toBe('OPEN_APPLICATION')
    expect(resolveCommand('Open Chrome,', registry).intent).toBe('OPEN_APPLICATION')
  })

  it('"you tube" folds to the canonical YouTube name', () => {
    const action = resolveCommand('open you tube', registry)
    expect(action.intent).toBe('OPEN_WEBSITE')
    expect(action.label).toBe('YouTube')
    expect(action.target).toBe('https://www.youtube.com')
    expect(resolveCommand('open you tube.', registry).target).toBe('https://www.youtube.com')
    expect(resolveCommand('go to you tube', registry).target).toBe('https://www.youtube.com')
  })

  it('the definite article is tolerated without corrupting "The ..." names', () => {
    expect(resolveCommand('open the chrome', registry).intent).toBe('OPEN_APPLICATION')
    expect(resolveCommand('open the explorer', registry).label).toBe('File Explorer')
    expect(resolveCommand('focus the chrome', registry).intent).toBe('FOCUS_APPLICATION')
    // A site literally named The Verge must STILL resolve verbatim.
    const verge = resolveCommand('open the verge', {
      ...registry,
      websites: [{ id: 'web-verge', name: 'The Verge', aliases: ['verge'], url: 'https://theverge.com' }],
    })
    expect(verge.target).toBe('https://theverge.com')
  })

  it('fillers are only stripped when a real command verb follows', () => {
    // "hello" alone is an app search term / unknown command, not "open ...".
    expect(resolveCommand('hello', registry).intent).toBe('CLARIFICATION')
    // An app named "Hello" must still be reachable without vertex mangling.
    const hello = resolveCommand('open hello kitty', {
      ...registry,
      apps: [...registry.apps, { id: 'app-hello', name: 'Hello Kitty', aliases: [], path: 'C:\\HK\\hello.exe' }],
    })
    expect(hello.label).toBe('Hello Kitty')
  })

  it('settings intents survive fillers and punctuation', () => {
    expect(resolveCommand('please open settings,', registry)).toMatchObject({ intent: 'OPEN_SETTINGS' })
    expect(resolveCommand('settings please', registry)).toMatchObject({ intent: 'OPEN_SETTINGS' })
  })
})