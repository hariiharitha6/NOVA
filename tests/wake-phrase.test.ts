import { describe, expect, it } from 'vitest'
import {
  normalizeWakePhrase,
  isValidWakePhrase,
  slugifyWakePhrase,
} from '../electron/core/speech/wake-phrase'
import { WAKE_PHRASE_MAX_LEN } from '../electron/core/speech/constants'

describe('wake-phrase normalization', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeWakePhrase('  Hey NOVA  ')).toBe('Hey NOVA')
  })

  it('collapses internal whitespace runs to a single space', () => {
    expect(normalizeWakePhrase('Hey    NOVA')).toBe('Hey NOVA')
  })

  it('preserves single spaces and punctuation', () => {
    expect(normalizeWakePhrase("Hello, Ajay!")).toBe('Hello, Ajay!')
  })

  it('accepts a valid phrase and returns the normalized form', () => {
    expect(normalizeWakePhrase('Heyy Harii')).toBe('Heyy Harii')
  })

  it('rejects an empty / whitespace-only phrase', () => {
    expect(normalizeWakePhrase('')).toBeNull()
    expect(normalizeWakePhrase('   ')).toBeNull()
    expect(normalizeWakePhrase('\t\n')).toBeNull()
  })

  it('rejects a non-string value', () => {
    expect(normalizeWakePhrase(undefined as unknown as string)).toBeNull()
    expect(normalizeWakePhrase(null as unknown as string)).toBeNull()
    expect(normalizeWakePhrase(42 as unknown as string)).toBeNull()
  })

  it('rejects a phrase longer than the max length', () => {
    const long = 'a'.repeat(WAKE_PHRASE_MAX_LEN + 1)
    expect(normalizeWakePhrase(long)).toBeNull()
  })

  it('accepts a phrase exactly at the max length', () => {
    const exact = 'a'.repeat(WAKE_PHRASE_MAX_LEN)
    expect(normalizeWakePhrase(exact)).toBe(exact)
  })

  it('rejects phrases containing unsafe characters', () => {
    expect(normalizeWakePhrase('Hey NOVA<script>')).toBeNull()
    expect(normalizeWakePhrase('Hey ../../etc')).toBeNull()
    expect(normalizeWakePhrase('Hey 🚀')).toBeNull()
  })

  it('isValidWakePhrase reflects normalizeWakePhrase', () => {
    expect(isValidWakePhrase('Hey NOVA')).toBe(true)
    expect(isValidWakePhrase('')).toBe(false)
    expect(isValidWakePhrase('   ')).toBe(false)
  })
})

describe('wake-phrase slug', () => {
  it('produces a filesystem-safe slug', () => {
    expect(slugifyWakePhrase('Hey NOVA')).toBe('hey-nova')
  })

  it('handles punctuation and case', () => {
    expect(slugifyWakePhrase("Hello, Ajay!")).toBe('hello-ajay')
  })

  it('collapses repeated separators', () => {
    expect(slugifyWakePhrase('Heyy   Harii')).toBe('heyy-harii')
  })
})
