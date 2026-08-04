import { describe, it, expect } from 'vitest'
import { createRequest, retryAfterMs } from '../src/runtime/request'

/** Answers a scripted list, one entry per attempt, and records what it was asked. */
function fake(...answers: (number | Error | { status: number; retryAfter: string })[]) {
  const calls: RequestInit[] = []

  const fetch = (async (_url: string | URL, init: RequestInit = {}) => {
    const answer = answers[calls.length] ?? answers.at(-1)!
    calls.push(init)

    if (answer instanceof Error) {
      throw answer
    }

    const status = typeof answer === 'number' ? answer : answer.status
    const headers: Record<string, string> =
      typeof answer === 'number' ? {} : { 'retry-after': answer.retryAfter }

    return new Response('{}', {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    })
  }) as unknown as typeof globalThis.fetch

  return { fetch, calls }
}

/** Real waits would make the suite slow, the delay itself is tested separately. */
const fast = { retryDelayMs: 1 }

describe('createRequest', () => {
  it('returns the answer when the first attempt works', async () => {
    const { fetch, calls } = fake(200)
    await createRequest(fast, fetch)('https://x.dev')

    expect(calls).toHaveLength(1)
  })

  it('retries a 500 and returns once it works', async () => {
    const { fetch, calls } = fake(500, 200)
    await createRequest(fast, fetch)('https://x.dev')

    expect(calls).toHaveLength(2)
  })

  it('retries a 429, the case that matters with rate limits', async () => {
    const { fetch, calls } = fake(429, 200)
    await createRequest(fast, fetch)('https://x.dev')

    expect(calls).toHaveLength(2)
  })

  it('does not retry a 400, asking again changes nothing', async () => {
    const { fetch, calls } = fake(400)

    await expect(createRequest(fast, fetch)('https://x.dev')).rejects.toThrow()
    expect(calls).toHaveLength(1)
  })

  it('gives up after the configured number of tries', async () => {
    const { fetch, calls } = fake(500)

    await expect(createRequest({ ...fast, retries: 2 }, fetch)('https://x.dev')).rejects.toThrow()
    expect(calls).toHaveLength(3)
  })

  it('does not retry at all when retries is 0', async () => {
    const { fetch, calls } = fake(500)

    await expect(createRequest({ ...fast, retries: 0 }, fetch)('https://x.dev')).rejects.toThrow()
    expect(calls).toHaveLength(1)
  })

  it('does not retry a network error, the message may already have arrived', async () => {
    const { fetch, calls } = fake(new TypeError('fetch failed'))

    await expect(createRequest(fast, fetch)('https://x.dev')).rejects.toThrow('fetch failed')
    expect(calls).toHaveLength(1)
  })

  it('retries a network error when the caller accepts duplicates', async () => {
    const { fetch, calls } = fake(new TypeError('fetch failed'), new TypeError('x'), 200)
    await createRequest({ ...fast, retryOnNetworkError: true }, fetch)('https://x.dev')

    expect(calls).toHaveLength(3)
  })

  it('waits as long as the service asks, not as long as we planned', async () => {
    const { fetch } = fake({ status: 429, retryAfter: '0' }, 200)
    const started = Date.now()

    // A configured delay of 200ms must lose against a Retry-After of 0.
    await createRequest({ retryDelayMs: 200 }, fetch)('https://x.dev')

    expect(Date.now() - started).toBeLessThan(150)
  })

  it('grows the delay between attempts', async () => {
    const { fetch } = fake(500, 500, 200)
    const started = Date.now()

    // 20ms then 40ms, so anything under 60ms means the doubling is missing.
    await createRequest({ retryDelayMs: 20 }, fetch)('https://x.dev')

    expect(Date.now() - started).toBeGreaterThanOrEqual(60)
  })

  it('errors carry the status, so a caller can react to it', async () => {
    const { fetch } = fake(404)

    await expect(createRequest(fast, fetch)('https://x.dev')).rejects.toMatchObject({ status: 404 })
  })
})

describe('retryAfterMs', () => {
  it('reads plain seconds', () => {
    expect(retryAfterMs('30')).toBe(30_000)
  })

  it('reads an http date', () => {
    const now = Date.parse('2026-08-05T12:00:00Z')
    expect(retryAfterMs('Wed, 05 Aug 2026 12:00:30 GMT', now)).toBe(30_000)
  })

  it('ignores a missing or unusable value', () => {
    expect(retryAfterMs(null)).toBeUndefined()
    expect(retryAfterMs('bald')).toBeUndefined()
  })

  it('ignores a date in the past instead of waiting a negative time', () => {
    const now = Date.parse('2026-08-05T12:00:00Z')
    expect(retryAfterMs('Wed, 05 Aug 2026 11:59:00 GMT', now)).toBeUndefined()
  })

  it('trims a wait nobody wants to sit out', () => {
    expect(retryAfterMs('3600')).toBe(60_000)
  })
})
