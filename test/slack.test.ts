import { describe, it, expect } from 'vitest'
import {
  assertWithinLimit,
  escapeMrkdwn,
  SLACK_LIMIT,
} from '../src/runtime/server/channels/slack/format'

describe('assertWithinLimit', () => {
  it('passes at exactly the limit', () => {
    expect(() => assertWithinLimit('x'.repeat(SLACK_LIMIT))).not.toThrow()
  })

  it('throws one over, before any request goes out', () => {
    expect(() => assertWithinLimit('x'.repeat(SLACK_LIMIT + 1))).toThrow(/got 40001/)
  })
})

describe('escapeMrkdwn', () => {
  it('escapes the three characters that would start markup', () => {
    // Without this a `<` opens a link and swallows the rest of the line.
    expect(escapeMrkdwn('<https://evil|klick> & <b>')).toBe(
      '&lt;https://evil|klick&gt; &amp; &lt;b&gt;',
    )
  })

  it('leaves the asterisk alone, bold is the caller decision', () => {
    // Slack bold is a single asterisk, unlike Discord. We do not decide that.
    expect(escapeMrkdwn('*fett*')).toBe('*fett*')
  })

  it('leaves plain text untouched', () => {
    expect(escapeMrkdwn('Deploy failed on main')).toBe('Deploy failed on main')
  })
})
