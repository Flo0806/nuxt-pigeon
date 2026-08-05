import { describe, it, expect, afterEach, vi } from 'vitest'
import { isPolling, startPolling, stopPolling } from '../src/runtime/server/core/poller'

afterEach(() => stopPolling('test'))

/**
 * Yields a macrotask instead of sleeping. A wait that resolves immediately would spin
 * the loop in microtasks and starve everything else, which hung this suite once.
 */
const fast = { intervalMs: 0, wait: () => new Promise<void>((resolve) => setTimeout(resolve, 1)) }

/** Resolves once the tick has run the given number of times. */
function counter(rounds: number) {
  let count = 0
  let done: () => void
  const reached = new Promise<void>((resolve) => (done = resolve))

  return {
    reached,
    get count() {
      return count
    },
    tick: async () => {
      count += 1
      if (count >= rounds) done()
    },
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

describe('startPolling', () => {
  it('runs the tick over and over', async () => {
    const rounds = counter(3)
    const stop = startPolling('test', fast, rounds.tick)

    await rounds.reached
    stop()

    expect(rounds.count).toBeGreaterThanOrEqual(3)
  })

  it('stops when the returned function is called', async () => {
    const rounds = counter(1)
    const stop = startPolling('test', fast, rounds.tick)

    await rounds.reached
    stop()
    expect(isPolling('test')).toBe(false)

    const before = rounds.count
    await settle()
    expect(rounds.count).toBe(before)
  })

  it('replaces a running poller instead of adding a second one', async () => {
    // What makes a hot reload safe: three saves must not leave three loops running.
    const first = counter(1)
    startPolling('test', fast, first.tick)
    await first.reached

    const second = counter(1)
    startPolling('test', fast, second.tick)
    await second.reached

    const before = first.count
    await settle()

    expect(first.count).toBe(before)
    expect(second.count).toBeGreaterThan(1)
  })

  it('keeps going after a failing round', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let count = 0
    let done: () => void
    const twice = new Promise<void>((resolve) => (done = resolve))

    startPolling('test', fast, async () => {
      count += 1
      if (count === 1) throw new Error('kaputt')
      if (count >= 2) done()
    })

    await twice
    stopPolling('test')

    expect(count).toBeGreaterThanOrEqual(2)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('hands the tick a signal, so a long request can be cut off', async () => {
    let seen: AbortSignal | undefined
    let done: () => void
    const once = new Promise<void>((resolve) => (done = resolve))

    const stop = startPolling('test', fast, async (signal) => {
      seen = signal
      done()
    })

    await once
    expect(seen?.aborted).toBe(false)

    stop()
    expect(seen?.aborted).toBe(true)
  })
})
