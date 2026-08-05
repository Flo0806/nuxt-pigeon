import { describe, it, expect } from 'vitest'
import { MAX_AGE_SECONDS, verifySignature } from '../src/runtime/server/channels/slack/verify'
import { hmacSha256Hex, utf8 } from '../src/runtime/server/core/verify'

const SECRET = 's3cr3t-signing-key'
const BODY = '{"type":"event_callback","event":{"type":"app_mention"}}'
const NOW = 1_700_000_000

async function sign(timestamp: number, body = BODY, secret = SECRET) {
  return `v0=${await hmacSha256Hex(utf8(secret), `v0:${timestamp}:${body}`)}`
}

type Check = Parameters<typeof verifySignature>[0]

function check(signature: string, over: Partial<Check> = {}): Check {
  return {
    signature,
    timestamp: String(NOW),
    rawBody: BODY,
    signingSecret: SECRET,
    now: NOW,
    ...over,
  }
}

describe('verifySignature', () => {
  it('accepts a correctly signed request', async () => {
    expect(await verifySignature(check(await sign(NOW)))).toBe(true)
  })

  it('rejects a body that changed after signing', async () => {
    const signature = await sign(NOW)
    const rawBody = BODY.replace('app_mention', 'message')

    expect(await verifySignature(check(signature, { rawBody }))).toBe(false)
  })

  it('rejects the wrong signing secret', async () => {
    const signature = await sign(NOW, BODY, 'someone-elses-key')

    expect(await verifySignature(check(signature))).toBe(false)
  })

  it('accepts a request right at the age limit', async () => {
    const timestamp = NOW - MAX_AGE_SECONDS

    expect(
      await verifySignature(check(await sign(timestamp), { timestamp: String(timestamp) })),
    ).toBe(true)
  })

  it('rejects a replay beyond the age limit, even correctly signed', async () => {
    const timestamp = NOW - MAX_AGE_SECONDS - 1

    expect(
      await verifySignature(check(await sign(timestamp), { timestamp: String(timestamp) })),
    ).toBe(false)
  })

  it('rejects a timestamp from the future beyond the window', async () => {
    const timestamp = NOW + MAX_AGE_SECONDS + 1

    expect(
      await verifySignature(check(await sign(timestamp), { timestamp: String(timestamp) })),
    ).toBe(false)
  })

  it('rejects a missing or unparsable timestamp', async () => {
    for (const timestamp of ['', 'gestern']) {
      expect(await verifySignature(check(await sign(NOW), { timestamp }))).toBe(false)
    }
  })

  it('rejects an empty signature, an absent header must never pass', async () => {
    expect(await verifySignature(check(''))).toBe(false)
  })
})
