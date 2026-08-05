import { describe, it, expect } from 'vitest'
import {
  assertWithinLimit,
  BLUESKY_GRAPHEME_LIMIT,
  byteLength,
  detectRanges,
  graphemeLength,
} from '../src/runtime/server/channels/bluesky/format'

describe('graphemeLength', () => {
  it('counts what a reader sees, not what the string holds', () => {
    // An emoji family is one grapheme, several code points and 25 bytes.
    const family = '👨‍👩‍👧‍👦'

    expect(family.length).toBeGreaterThan(1)
    expect(graphemeLength(family)).toBe(1)
    expect(byteLength(family)).toBe(25)
  })

  it('counts a combining accent as one', () => {
    expect(graphemeLength('é')).toBe(1)
  })
})

describe('assertWithinLimit', () => {
  it('passes at exactly the grapheme limit', () => {
    expect(() => assertWithinLimit('x'.repeat(BLUESKY_GRAPHEME_LIMIT))).not.toThrow()
  })

  it('throws one grapheme over', () => {
    expect(() => assertWithinLimit('x'.repeat(BLUESKY_GRAPHEME_LIMIT + 1))).toThrow(
      /graphemes, got 301/,
    )
  })

  it('lets 300 emoji through on graphemes but stops them on bytes', () => {
    // 300 families are within the grapheme limit and far past the byte limit, which
    // is exactly why both checks exist.
    const text = '👨‍👩‍👧‍👦'.repeat(300)

    expect(graphemeLength(text)).toBe(300)
    expect(() => assertWithinLimit(text)).toThrow(/bytes/)
  })
})

describe('detectRanges', () => {
  it('finds a link and gives its byte range', () => {
    const { links } = detectRanges('see https://a.dev now')

    expect(links).toEqual([{ byteStart: 4, byteEnd: 17, uri: 'https://a.dev' }])
  })

  it('counts bytes, not characters, which is the whole point', () => {
    // "grüße " is 6 characters but 8 bytes, because ü and ß cost two each. A
    // character based offset would put the link two bytes too early and Bluesky
    // would linkify the wrong slice.
    const text = 'grüße https://a.dev'
    const { links } = detectRanges(text)

    expect(text.indexOf('https')).toBe(6)
    expect(links[0]!.byteStart).toBe(8)
  })

  it('leaves trailing punctuation out of the link', () => {
    expect(detectRanges('see https://a.dev.').links[0]!.uri).toBe('https://a.dev')
    expect(detectRanges('see https://a.dev, ok').links[0]!.uri).toBe('https://a.dev')
  })

  it('keeps a paren the link opened itself', () => {
    const wrapped = detectRanges('(see https://a.dev/x)').links[0]!
    const owned = detectRanges('https://a.dev/wiki_(page)').links[0]!

    expect(wrapped.uri).toBe('https://a.dev/x')
    expect(owned.uri).toBe('https://a.dev/wiki_(page)')
  })

  it('finds tags but not numbers', () => {
    const { tags } = detectRanges('#nuxt and #1 and #vue')

    expect(tags.map((tag) => tag.tag)).toEqual(['nuxt', 'vue'])
  })

  it('finds handles and leaves them unresolved', () => {
    // A mention needs a did, and looking that up is not the job of a pure function.
    const { mentions } = detectRanges('hallo @flo.bsky.social')

    expect(mentions).toEqual([{ byteStart: 6, byteEnd: 22, handle: 'flo.bsky.social' }])
  })

  it('ignores an email, it is not a handle', () => {
    expect(detectRanges('mail an flo@example.com').mentions).toEqual([])
  })

  it('finds nothing in plain text', () => {
    expect(detectRanges('Deploy failed on main')).toEqual({ links: [], tags: [], mentions: [] })
  })
})
