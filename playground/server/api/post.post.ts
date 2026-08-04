import { post } from '../../../src/runtime/post'

/**
 * Layer 1 sending. Posts to httpbingo, which mirrors the request back, so the body
 * and the headers we produced are visible exactly as they arrived.
 */
export default defineEventHandler(async (event) => {
  const { kind, text, secret, url } = await readBody<{
    kind: 'json' | 'text' | 'form'
    text: string
    secret: string
    url: string
  }>(event)

  const payload =
    kind === 'json' ? { text } : kind === 'form' ? new URLSearchParams({ value1: text }) : text

  try {
    const mirrored = await post(url || 'https://httpbingo.org/post', payload, {
      secret: secret || undefined,
      retries: 0,
    })

    return { ok: true as const, mirrored }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
