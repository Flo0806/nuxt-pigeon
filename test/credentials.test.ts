import { describe, it, expect, beforeEach } from 'vitest'
import {
  forgetWarnings,
  getOverride,
  notConfigured,
  resolveCredentials,
  setOverride,
} from '../src/runtime/server/core/credentials'

interface Creds {
  token?: string
  chatId?: string
}

const configured = (values: Partial<Creds>) => !!values.token

function resolve(input: {
  mode: 'static' | 'runtime'
  static?: Creds
  override?: Partial<Creds>
  warn?: (message: string) => void
}) {
  return resolveCredentials<Creds>({
    channel: 'test',
    mode: input.mode,
    static: input.static ?? { token: '', chatId: '' },
    override: input.override,
    configured,
    warn: input.warn ?? (() => {}),
  })
}

beforeEach(() => {
  forgetWarnings()
  setOverride('test', undefined)
})

describe('resolveCredentials, static mode', () => {
  it('takes the environment as it is', () => {
    const result = resolve({ mode: 'static', static: { token: 't', chatId: '1' } })

    expect(result).toEqual({
      values: { token: 't', chatId: '1' },
      source: 'static',
      configured: true,
    })
  })

  it('is "none" when the environment has nothing usable, but still hands it over', () => {
    const result = resolve({ mode: 'static', static: { token: '', chatId: '1' } })

    expect(result.source).toBe('none')
    expect(result.configured).toBe(false)
    expect(result.values.chatId).toBe('1')
  })

  it('lets an override fill only the field it names, the rest stays from the environment', () => {
    const result = resolve({
      mode: 'static',
      static: { token: 'env', chatId: '1' },
      override: { token: 'db' },
    })

    expect(result).toEqual({
      values: { token: 'db', chatId: '1' },
      source: 'runtime',
      configured: true,
    })
  })

  it('treats an empty string in the override as not given', () => {
    const result = resolve({
      mode: 'static',
      static: { token: 'env', chatId: '1' },
      override: { token: '', chatId: '2' },
    })

    expect(result.values).toEqual({ token: 'env', chatId: '2' })
  })

  it('never warns', () => {
    const warnings: string[] = []
    resolve({ mode: 'static', static: { token: 't' }, warn: (m) => warnings.push(m) })

    expect(warnings).toEqual([])
  })
})

describe('resolveCredentials, runtime mode', () => {
  it('ignores the environment completely', () => {
    const result = resolve({ mode: 'runtime', static: { token: 'env', chatId: '1' } })

    expect(result).toEqual({ values: {}, source: 'none', configured: false })
  })

  it('takes the override as the whole truth, no gaps filled from the environment', () => {
    const result = resolve({
      mode: 'runtime',
      static: { token: 'env', chatId: '1' },
      override: { token: 'db' },
    })

    expect(result.values).toEqual({ token: 'db' })
    expect(result.values.chatId).toBeUndefined()
    expect(result.source).toBe('runtime')
  })

  it('warns once when the environment has values that are being ignored', () => {
    const warnings: string[] = []
    const warn = (m: string) => warnings.push(m)

    resolve({ mode: 'runtime', static: { token: 'env' }, warn })
    resolve({ mode: 'runtime', static: { token: 'env' }, warn })

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("credentials: 'runtime'")
    expect(warnings[0]).toContain('test.configure()')
  })

  it('does not warn on an empty environment, that is the expected case', () => {
    const warnings: string[] = []
    resolve({ mode: 'runtime', static: { token: '', chatId: '' }, warn: (m) => warnings.push(m) })

    expect(warnings).toEqual([])
  })

  it('does not count an empty object as a set value', () => {
    const warnings: string[] = []
    resolveCredentials<{ headers?: Record<string, string> }>({
      channel: 'test',
      mode: 'runtime',
      static: { headers: {} },
      override: undefined,
      configured: () => false,
      warn: (m) => warnings.push(m),
    })

    expect(warnings).toEqual([])
  })
})

describe('overrides', () => {
  it('stores per channel and clears on undefined', () => {
    setOverride('test', { token: 'a' })
    expect(getOverride<Creds>('test')).toEqual({ token: 'a' })

    setOverride('test', undefined)
    expect(getOverride('test')).toBeUndefined()
  })
})

describe('notConfigured', () => {
  it('points at the variable in static mode', () => {
    const error = notConfigured(
      'discord',
      'static',
      'Discord webhook url',
      'PIGEON_X',
      'webhookUrl',
    )

    expect(error.message).toContain('Set PIGEON_X')
    expect(error.message).toContain('discord.configure({ webhookUrl })')
  })

  it('points at the call in runtime mode, and not at the variable', () => {
    const error = notConfigured(
      'discord',
      'runtime',
      'Discord webhook url',
      'PIGEON_X',
      'webhookUrl',
    )

    expect(error.message).not.toContain('PIGEON_X')
    expect(error.message).toContain('discord.configure({ webhookUrl })')
  })
})
