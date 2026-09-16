import { describe, expect, it } from 'vitest'
import { normalizeUrl } from '../electron/core/url'

describe('normalizeUrl', () => {
  it('passes http(s) URLs through unchanged', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com')
    expect(normalizeUrl('http://example.com/x')).toBe('http://example.com/x')
  })

  it('prepends https:// to a bare host', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com')
    expect(normalizeUrl('www.youtube.com/watch?v=1')).toBe('https://www.youtube.com/watch?v=1')
  })

  it('rejects non-http(s) schemes', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeUrl('file:///C:/x')).toBeNull()
    expect(normalizeUrl('mailto:a@b.com')).toBeNull()
    expect(normalizeUrl('ftp://x')).toBeNull()
  })

  it('rejects empty and whitespace input', () => {
    expect(normalizeUrl('')).toBeNull()
    expect(normalizeUrl('   ')).toBeNull()
  })

  it('rejects strings with whitespace', () => {
    expect(normalizeUrl('hello world.com')).toBeNull()
  })
})
