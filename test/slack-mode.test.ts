import { describe, it, expect } from 'vitest'
import { assertOk, chooseMode, requireBot } from '../src/runtime/server/channels/slack/mode'

describe('chooseMode', () => {
  it('takes the bot token when both are set, because it can do strictly more', () => {
    const mode = chooseMode({ webhookUrl: 'https://hooks…', botToken: 'xoxb-1', channel: 'C1' })

    expect(mode).toBe('bot')
  })

  it('takes the webhook when there is no token', () => {
    expect(chooseMode({ webhookUrl: 'https://hooks…' })).toBe('webhook')
  })

  it('lets a channel passed per call stand in for the configured one', () => {
    expect(chooseMode({ botToken: 'xoxb-1' }, 'C0PERCALL')).toBe('bot')
  })

  it('refuses a token without a channel instead of falling back to the webhook', () => {
    // The fallback would be the quiet kind of wrong: you set a token to get an id
    // back, and would be handed a message you cannot touch again.
    expect(() => chooseMode({ webhookUrl: 'https://hooks…', botToken: 'xoxb-1' })).toThrow(
      'bot token but no channel',
    )
  })

  it('says what to set when nothing at all is configured', () => {
    expect(() => chooseMode({})).toThrow('Slack is not configured')
  })
})

describe('requireBot', () => {
  it('hands the token back when there is one', () => {
    expect(requireBot({ botToken: 'xoxb-1' }, 'edit')).toBe('xoxb-1')
  })

  it('names the verb and the way out', () => {
    expect(() => requireBot({ webhookUrl: 'https://hooks…' }, 'delete')).toThrow(
      /slack cannot delete.*PIGEON_SLACK_BOT_TOKEN/s,
    )
  })
})

describe('assertOk', () => {
  it('says nothing when Slack is happy', () => {
    expect(() => assertOk('chat.postMessage', { ok: true, ts: '1' })).not.toThrow()
  })

  it('throws on ok:false, which arrives with status 200', () => {
    // The whole reason this exists: the status says success, the body does not.
    expect(() => assertOk('chat.postMessage', { ok: false, error: 'channel_not_found' })).toThrow(
      'Slack chat.postMessage failed: channel_not_found',
    )
  })

  it('names the missing scope, which is the most common cause', () => {
    expect(() =>
      assertOk('chat.delete', { ok: false, error: 'missing_scope', needed: 'chat:write' }),
    ).toThrow('needs the scope `chat:write`')
  })

  it('throws on an empty body rather than treating it as success', () => {
    expect(() => assertOk('chat.update', undefined)).toThrow('unknown error')
  })
})
