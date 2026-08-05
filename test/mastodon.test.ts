import { describe, it, expect } from 'vitest'
import {
  assertWithinLimit,
  countCharacters,
  pageIds,
  plainText,
  type MastodonLimits,
} from '../src/runtime/server/channels/mastodon/format'

const limits: MastodonLimits = { maxCharacters: 500, charactersReservedPerUrl: 23 }

describe('countCharacters', () => {
  it('counts plain text as its length', () => {
    expect(countCharacters('hallo', limits)).toBe(5)
  })

  it('charges a flat rate per url, however long it is', () => {
    expect(countCharacters('x https://a.dev', limits)).toBe(2 + 23)
    expect(countCharacters(`x https://example.com/${'p'.repeat(200)}`, limits)).toBe(2 + 23)
  })

  it('charges every url separately', () => {
    expect(countCharacters('https://a.dev https://b.dev', limits)).toBe(23 + 1 + 23)
  })

  it('does not charge the domain of a remote mention', () => {
    // @flo@mastodon.social costs what @flo costs.
    expect(countCharacters('@flo@mastodon.social', limits)).toBe(4)
  })

  it('counts a local mention in full', () => {
    expect(countCharacters('@flo', limits)).toBe(4)
  })

  it('follows the instance value instead of assuming 23', () => {
    const raised = { maxCharacters: 5000, charactersReservedPerUrl: 30 }

    expect(countCharacters('https://a.dev', raised)).toBe(30)
  })
})

describe('assertWithinLimit', () => {
  it('passes at exactly the limit', () => {
    expect(() => assertWithinLimit('x'.repeat(500), limits)).not.toThrow()
  })

  it('throws one over', () => {
    expect(() => assertWithinLimit('x'.repeat(501), limits)).toThrow(/over 500 characters, got 501/)
  })

  it('accepts a post that only text.length would reject', () => {
    // 400 plain characters, a space and a very long url: 601 raw, 424 by the rules.
    const text = `${'x'.repeat(400)} https://example.com/${'p'.repeat(180)}`

    expect(text.length).toBeGreaterThan(500)
    expect(countCharacters(text, limits)).toBe(424)
    expect(() => assertWithinLimit(text, limits)).not.toThrow()
  })
})

describe('pageIds', () => {
  const base = 'https://mastodon.social/api/v1/notifications'

  it('reads both directions out of the header', () => {
    const header = `<${base}?max_id=111>; rel="next", <${base}?min_id=222>; rel="prev"`

    expect(pageIds(header)).toEqual({ nextMaxId: '111', prevMinId: '222' })
  })

  it('survives the header being absent, which is the last page', () => {
    expect(pageIds(null)).toEqual({ nextMaxId: undefined, prevMinId: undefined })
  })

  it('ignores links with another rel', () => {
    expect(pageIds(`<${base}?max_id=111>; rel="alternate"`).nextMaxId).toBeUndefined()
  })

  it('takes the ids from the url, not from their position', () => {
    const header = `<${base}?limit=80&max_id=111&types%5B%5D=mention>; rel="next"`

    expect(pageIds(header).nextMaxId).toBe('111')
  })
})

describe('plainText', () => {
  it('turns a post into the words it contains', () => {
    expect(plainText('<p>Deploy failed</p>')).toBe('Deploy failed')
  })

  it('keeps paragraphs and breaks as newlines', () => {
    expect(plainText('<p>eins</p><p>zwei</p>')).toBe('eins\n\nzwei')
    expect(plainText('<p>eins<br>zwei</p>')).toBe('eins\nzwei')
  })

  it('decodes the ampersand last, otherwise entities get mangled', () => {
    // &amp;lt; must end up as &lt; and not as <
    expect(plainText('<p>a &amp;lt; b</p>')).toBe('a &lt; b')
  })

  it('unwraps a mention without losing the handle', () => {
    const html = '<p><a href="https://mastodon.social/@flo">@<span>flo</span></a> hallo</p>'

    expect(plainText(html)).toBe('@flo hallo')
  })
})
