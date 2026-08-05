import { describe, it, expect } from 'vitest'
import {
  assertWithinLimit,
  byteLength,
  NTFY_LIMIT,
} from '../src/runtime/server/channels/ntfy/format'

describe('byteLength', () => {
  it('counts ascii as one each', () => {
    expect(byteLength('hallo')).toBe(5)
  })

  it('counts an umlaut as two', () => {
    // The whole reason this exists: `.length` would say 5 and let 4096 characters
    // through, which ntfy then refuses.
    expect('grüße'.length).toBe(5)
    expect(byteLength('grüße')).toBe(7)
  })

  it('counts an emoji as four', () => {
    expect(byteLength('🐦')).toBe(4)
  })
})

describe('assertWithinLimit', () => {
  it('passes at exactly the limit', () => {
    expect(() => assertWithinLimit('x'.repeat(NTFY_LIMIT))).not.toThrow()
  })

  it('throws one byte over', () => {
    expect(() => assertWithinLimit('x'.repeat(NTFY_LIMIT + 1))).toThrow(/got 4097/)
  })

  it('counts bytes, so umlauts run out of room sooner than characters', () => {
    const text = 'ü'.repeat(NTFY_LIMIT / 2 + 1)

    expect(text.length).toBeLessThan(NTFY_LIMIT)
    expect(() => assertWithinLimit(text)).toThrow()
  })

  it('takes a raised limit, self hosted instances can lift it', () => {
    expect(() => assertWithinLimit('x'.repeat(5000), 8192)).not.toThrow()
  })
})
