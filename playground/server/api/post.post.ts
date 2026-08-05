import { post } from '../../../src/runtime/server/core/post'
import { headersToObject } from '../../../src/runtime/server/core/result'

/** What httpbingo mirrors back, which is the point of this route. */
interface Mirror {
  headers?: Record<string, string[]>
  json?: unknown
  form?: Record<string, string[]>
  data?: string
}

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
    const response = await post<Mirror>(url || 'https://httpbingo.org/post', payload, {
      secret: secret || undefined,
      retries: 0,
    })

    // Status and headers come back too now, not only the body.
    return {
      ok: true as const,
      mirrored: response._data,
      status: response.status,
      headers: headersToObject(response.headers),
    }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
