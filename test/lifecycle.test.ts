import { describe, it, expect, beforeEach } from 'vitest'
import {
  forgetWarnings,
  getOverride,
  resolveCredentials,
  setOverride,
} from '../src/runtime/server/core/credentials'
import {
  defineLifecycle,
  registerReceiver,
  startReceiver,
  stopReceiver,
} from '../src/runtime/server/core/lifecycle'
import { isPolling, startPolling } from '../src/runtime/server/core/poller'

interface Creds {
  token?: string
}

/** A poller that does nothing and waits until it is stopped. */
function idle() {
  startPolling(
    'test',
    {
      intervalMs: 1,
      wait: (_, signal) => new Promise((r) => signal.addEventListener('abort', () => r())),
    },
    async () => {},
  )
}

function channel(input: {
  mode: 'static' | 'runtime'
  env?: string
  warn?: (m: string) => void
  reset?: () => void
}) {
  const resolve = () =>
    resolveCredentials<Creds>({
      channel: 'test',
      mode: input.mode,
      static: { token: input.env ?? '' },
      override: getOverride('test'),
      configured: (v) => !!v.token,
      warn: () => {},
    })

  return defineLifecycle<Creds>({
    channel: 'test',
    mode: () => input.mode,
    resolve,
    assert: () => {
      if (!resolve().configured) {
        throw new Error('test is not configured')
      }
    },
    reset: input.reset,
    warn: input.warn ?? (() => {}),
  })
}

beforeEach(() => {
  forgetWarnings()
  setOverride('test', undefined)
  stopReceiver('test')
  registerReceiver('test', idle)
})

describe('configure', () => {
  it('sets the values and starts the receiver', async () => {
    const test = channel({ mode: 'runtime' })
    expect(test.status()).toEqual({ running: false, source: 'none', configured: false })

    const status = await test.configure({ token: 'db' })

    expect(status).toEqual({ running: true, source: 'runtime', configured: true })
    expect(getOverride('test')).toEqual({ token: 'db' })
  })

  it('restarts the receiver, so state from the old account is gone', async () => {
    let starts = 0
    registerReceiver('test', () => {
      starts++
      idle()
    })
    const test = channel({ mode: 'runtime' })

    await test.configure({ token: 'a' })
    await test.configure({ token: 'b' })

    expect(starts).toBe(2)
    expect(test.status().running).toBe(true)
  })

  it('runs reset on every stop, which is where a session gets dropped', async () => {
    let resets = 0
    const test = channel({ mode: 'runtime', reset: () => resets++ })

    await test.configure({ token: 'a' })
    await test.stop()

    expect(resets).toBe(2)
  })

  it('without an argument goes back to the environment in static mode', async () => {
    const test = channel({ mode: 'static', env: 'env' })
    await test.configure({ token: 'db' })
    expect(test.status().source).toBe('runtime')

    const status = await test.configure()

    expect(status).toEqual({ running: true, source: 'static', configured: true })
    expect(getOverride('test')).toBeUndefined()
  })

  it('without an argument means off in runtime mode', async () => {
    const test = channel({ mode: 'runtime' })
    await test.configure({ token: 'db' })

    const status = await test.configure()

    expect(status).toEqual({ running: false, source: 'none', configured: false })
  })

  it('throws the channel sentence when the values are not enough', async () => {
    const test = channel({ mode: 'runtime' })

    await expect(test.configure({ token: '' })).rejects.toThrow('test is not configured')
    expect(test.status().running).toBe(false)
  })

  it('warns when it replaces credentials the environment had, once per call', async () => {
    const warnings: string[] = []
    const test = channel({ mode: 'static', env: 'env', warn: (m) => warnings.push(m) })

    await test.configure({ token: 'db' })
    await test.configure({ token: 'db2' })

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("credentials: 'runtime'")
  })

  it('does not warn when the environment had nothing to replace', async () => {
    const warnings: string[] = []
    const test = channel({ mode: 'static', warn: (m) => warnings.push(m) })

    await test.configure({ token: 'db' })

    expect(warnings).toEqual([])
  })
})

describe('restart and stop', () => {
  it('restart keeps the values and starts fresh', async () => {
    let starts = 0
    registerReceiver('test', () => {
      starts++
      idle()
    })
    const test = channel({ mode: 'static', env: 'env' })

    await test.restart()
    await test.restart()

    expect(starts).toBe(2)
    expect(test.status()).toEqual({ running: true, source: 'static', configured: true })
  })

  it('restart without credentials throws instead of starting a poller that can only fail', async () => {
    const test = channel({ mode: 'static' })

    await expect(test.restart()).rejects.toThrow('not configured')
    expect(isPolling('test')).toBe(false)
  })

  it('stop stops, and status says so', async () => {
    const test = channel({ mode: 'static', env: 'env' })
    await test.restart()

    const status = await test.stop()

    expect(status.running).toBe(false)
    expect(status.configured).toBe(true)
  })
})

describe('receivers', () => {
  it('a receiver that starts nothing is never running, configure still sets', async () => {
    stopReceiver('test')
    registerReceiver('test', () => {})
    const test = channel({ mode: 'runtime' })

    const status = await test.configure({ token: 'db' })

    expect(status).toEqual({ running: false, source: 'runtime', configured: true })
  })

  it('startReceiver says whether there was one', () => {
    expect(startReceiver('nobody-registered-this')).toBe(false)
    expect(startReceiver('test')).toBe(true)
  })
})
