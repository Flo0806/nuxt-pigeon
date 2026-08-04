import { describe, it, expect } from 'vitest'
import { resolveEndpoint } from '../src/runtime/endpoint'

const NONE = {}

describe('resolveEndpoint without a name', () => {
  it('takes the configured url', () => {
    expect(resolveEndpoint({ url: 'https://config.dev' }, NONE).url).toBe('https://config.dev')
  })

  it('falls back to the environment', () => {
    expect(resolveEndpoint({}, { PIGEON_WEBHOOK_URL: 'https://env.dev' }).url).toBe(
      'https://env.dev',
    )
  })

  it('lets the config win over the environment', () => {
    const resolved = resolveEndpoint(
      { url: 'https://config.dev' },
      { PIGEON_WEBHOOK_URL: 'https://env.dev' },
    )

    expect(resolved.url).toBe('https://config.dev')
  })

  it('has no url when nothing is set anywhere', () => {
    expect(resolveEndpoint({}, NONE).url).toBeUndefined()
  })

  it('reads the secret only from the environment side', () => {
    expect(resolveEndpoint({}, { PIGEON_WEBHOOK_SECRET: 'geheim' }).secret).toBe('geheim')
  })
})

describe('resolveEndpoint with a name', () => {
  const config = {
    url: 'https://default.dev',
    headers: { 'X-Shared': 'yes' },
    endpoints: {
      chat: { url: 'https://chat.dev' },
      n8n: { headers: { 'X-Demo': 'automation' } },
      'my-hook': {},
    },
  }

  it('uses the url of the endpoint', () => {
    expect(resolveEndpoint(config, NONE, 'chat').url).toBe('https://chat.dev')
  })

  it('falls back to the endpoint specific environment variable', () => {
    const resolved = resolveEndpoint(config, { PIGEON_WEBHOOK_N8N_URL: 'https://n8n.dev' }, 'n8n')

    expect(resolved.url).toBe('https://n8n.dev')
  })

  it('turns a hyphen in the name into an underscore', () => {
    // `my-hook` is not a legal shell variable name, so it becomes MY_HOOK.
    const resolved = resolveEndpoint(
      config,
      { PIGEON_WEBHOOK_MY_HOOK_URL: 'https://x.dev' },
      'my-hook',
    )

    expect(resolved.url).toBe('https://x.dev')
  })

  it('falls back to the shared url when the endpoint has none', () => {
    expect(resolveEndpoint(config, NONE, 'n8n').url).toBe('https://default.dev')
  })

  it('inherits the shared headers and adds its own', () => {
    expect(resolveEndpoint(config, NONE, 'n8n').headers).toEqual({
      'X-Shared': 'yes',
      'X-Demo': 'automation',
    })
  })

  it('lets the endpoint secret win over the shared one', () => {
    const env = { PIGEON_WEBHOOK_SECRET: 'shared', PIGEON_WEBHOOK_CHAT_SECRET: 'own' }

    expect(resolveEndpoint(config, env, 'chat').secret).toBe('own')
    expect(resolveEndpoint(config, env, 'n8n').secret).toBe('shared')
  })

  it('names the known endpoints when the name is wrong', () => {
    // A typo would otherwise post to the default url, which is the worse failure.
    expect(() => resolveEndpoint(config, NONE, 'gibtsnicht')).toThrow('Known: chat, n8n, my-hook')
  })

  it('says so when no endpoint is configured at all', () => {
    expect(() => resolveEndpoint({}, NONE, 'chat')).toThrow('Known: none')
  })
})
