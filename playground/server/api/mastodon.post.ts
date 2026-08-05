import type { MastodonVisibility } from '../../../src/runtime/server/channels/mastodon/types'

export default defineEventHandler(async (event) => {
  const { text, visibility, spoilerText } = await readBody<{
    text: string
    visibility: string
    spoilerText: string
  }>(event)

  try {
    const status = await mastodon.post(text, {
      visibility: (visibility || undefined) as MastodonVisibility | undefined,
      spoilerText: spoilerText || undefined,
    })

    return { ok: true as const, url: status.url }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
