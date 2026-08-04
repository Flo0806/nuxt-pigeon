import { post } from '../../../src/runtime/server/core/post'

/** Sends to our own route, so the whole way out and back in is visible. */
export default defineEventHandler(async (event) => {
  const { text, secret } = await readBody<{ text: string; secret: string }>(event)
  const url = `${getRequestURL(event).origin}/api/_pigeon/webhook`

  try {
    await post(url, { text }, { secret: secret || undefined, retries: 0 })

    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
