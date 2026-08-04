/**
 * Layer 1 with config. `webhook` is auto imported, the url and the secret come from
 * nuxt.config and .env, so nothing but the payload is passed here.
 */
export default defineEventHandler(async (event) => {
  const { to, text } = await readBody<{ to: string; text: string }>(event)

  try {
    const mirrored = await webhook.send({ text }, { to: to || undefined, retries: 0 })

    return { ok: true as const, mirrored }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
