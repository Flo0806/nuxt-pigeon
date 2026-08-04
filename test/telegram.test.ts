import { describe, it, expect } from 'vitest'
import {
  assertWithinLimit,
  escapeHtml,
  TELEGRAM_LIMIT,
} from '../src/runtime/server/channels/telegram/format'

describe('assertWithinLimit', () => {
  it('passes at exactly the limit', () => {
    expect(() => assertWithinLimit('x'.repeat(TELEGRAM_LIMIT))).not.toThrow()
  })

  it('throws one over, before any request goes out', () => {
    expect(() => assertWithinLimit('x'.repeat(TELEGRAM_LIMIT + 1))).toThrow(/got 4097/)
  })
})

describe('escapeHtml', () => {
  it('escapes exactly the three characters Telegram reserves', () => {
    expect(escapeHtml('<b>a & b</b>')).toBe('&lt;b&gt;a &amp; b&lt;/b&gt;')
  })

  it('escapes the ampersand first, otherwise the entities get mangled', () => {
    // A naive order would turn < into &lt; and then its & into &amp;lt;
    expect(escapeHtml('<')).toBe('&lt;')
  })

  it('leaves quotes alone, Telegram only reserves the three', () => {
    expect(escapeHtml(`he said "hi" and 'bye'`)).toBe(`he said "hi" and 'bye'`)
  })

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Deploy failed on main')).toBe('Deploy failed on main')
  })
})
