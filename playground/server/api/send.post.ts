/**
 * Layer 1 with config. `webhook` is auto imported, the url and the secret come from
 * nuxt.config and .env, so nothing but the payload is passed here.
 *
 * Answers in the same shape as `/api/post`, so the card can show one mirror whichever
 * way the message went out.
 */
export default defineEventHandler(async (event) => {
  const { to, text } = await readBody<{ to: string; text: string }>(event)

  try {
    const sent = await webhook.send({ text }, { to: to || undefined, retries: 0 })

    return {
      ok: true as const,
      // `raw` is whatever the receiver answered, untouched. httpbingo mirrors the
      // request back, which is exactly what makes it useful here.
      mirrored: sent.raw as {
        headers?: Record<string, string[]>
        json?: unknown
        form?: Record<string, unknown>
        data?: string
      },
      status: sent.response.status,
      endpoint: sent.endpoint,
    }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
