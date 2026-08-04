import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  ANY,
  addListener,
  clearListeners,
  dispatch,
  listenerCount,
  type WebhookMessage,
} from '../src/runtime/listeners'

const message: WebhookMessage = {
  channel: 'webhook',
  at: '2026-08-05T12:00:00.000Z',
  raw: '{"a":1}',
  body: { a: 1 },
  headers: {},
}

beforeEach(() => clearListeners())

describe('addListener', () => {
  it('runs the handler on dispatch', async () => {
    const seen: WebhookMessage[] = []
    addListener('webhook', (m) => seen.push(m))

    await dispatch('webhook', message)

    expect(seen).toEqual([message])
  })

  it('runs every registered handler', async () => {
    let count = 0
    addListener('webhook', () => count++)
    addListener('webhook', () => count++)

    await dispatch('webhook', message)

    expect(count).toBe(2)
  })

  it('gives a wildcard listener every channel, which is what the stream needs', async () => {
    const seen: string[] = []
    addListener(ANY, (m) => seen.push(m.channel))

    await dispatch('webhook', message)
    await dispatch('telegram', { ...message, channel: 'telegram' })

    expect(seen).toEqual(['webhook', 'telegram'])
  })

  it('runs a channel listener and a wildcard listener exactly once each', async () => {
    let both = 0
    const handler = () => both++

    addListener('webhook', handler)
    addListener(ANY, handler)

    await dispatch('webhook', message)

    // The same function under two names is still one handler, not two calls.
    expect(both).toBe(1)
  })

  it('keeps channels apart', async () => {
    let count = 0
    addListener('telegram', () => count++)

    await dispatch('webhook', message)

    expect(count).toBe(0)
  })

  it('unregisters through the returned function', async () => {
    let count = 0
    const stop = addListener('webhook', () => count++)

    stop()
    await dispatch('webhook', message)

    expect(count).toBe(0)
    expect(listenerCount('webhook')).toBe(0)
  })

  it('survives a reload without stacking duplicates of the same handler', async () => {
    // A hot reload registers the same function again, which must not double it.
    const handler = vi.fn()
    addListener('webhook', handler)
    addListener('webhook', handler)

    await dispatch('webhook', message)

    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('dispatch', () => {
  it('does nothing when nobody listens', async () => {
    await expect(dispatch('webhook', message)).resolves.toBeUndefined()
  })

  it('runs the others when one handler throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let reached = false

    addListener('webhook', () => {
      throw new Error('kaputt')
    })
    addListener('webhook', () => {
      reached = true
    })

    await dispatch('webhook', message)

    expect(reached).toBe(true)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('never rejects, because a failed answer makes the sender deliver again', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    addListener('webhook', async () => {
      throw new Error('kaputt')
    })

    await expect(dispatch('webhook', message)).resolves.toBeUndefined()
    error.mockRestore()
  })
})
