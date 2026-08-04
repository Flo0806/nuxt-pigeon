import { describe, it, expect } from 'vitest'
import {
  assertWithinLimit,
  DISCORD_LIMIT,
  escapeMarkdown,
} from '../src/runtime/server/channels/discord/format'

describe('assertWithinLimit', () => {
  it('passes at exactly the limit', () => {
    expect(() => assertWithinLimit('x'.repeat(DISCORD_LIMIT))).not.toThrow()
  })

  it('throws one over, before any request goes out', () => {
    expect(() => assertWithinLimit('x'.repeat(DISCORD_LIMIT + 1))).toThrow(/got 2001/)
  })
})

describe('escapeMarkdown', () => {
  it('defuses the inline markers', () => {
    expect(escapeMarkdown('*bold* _under_ ~strike~ `code` ||spoiler||')).toBe(
      '\\*bold\\* \\_under\\_ \\~strike\\~ \\`code\\` \\|\\|spoiler\\|\\|',
    )
  })

  it('escapes the backslash itself, otherwise the escaping is forgeable', () => {
    expect(escapeMarkdown('a\\*b')).toBe('a\\\\\\*b')
  })

  it('escapes quote, heading and list markers at the start of a line', () => {
    const lines = ['> quote', '# heading', '- item'].join('\n')
    const escaped = ['\\> quote', '\\# heading', '\\- item'].join('\n')

    expect(escapeMarkdown(lines)).toBe(escaped)
  })

  it('leaves those markers alone in the middle of a line', () => {
    // Escaping them everywhere would put backslashes into ordinary prose.
    expect(escapeMarkdown('5 > 3 and a-b and c#d')).toBe('5 > 3 and a-b and c#d')
  })

  it('leaves plain text untouched', () => {
    expect(escapeMarkdown('Deploy failed on main')).toBe('Deploy failed on main')
  })
})
