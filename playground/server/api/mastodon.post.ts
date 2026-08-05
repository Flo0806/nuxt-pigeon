import type { MastodonVisibility } from '../../../src/runtime/server/channels/mastodon/types'

export default defineEventHandler(async (event) => {
  const { text, visibility, spoilerText, mediaUrl } = await readBody<{
    text: string
    visibility: string
    spoilerText: string
    mediaUrl: string
  }>(event)

  try {
    const status = await mastodon.post(text, {
      visibility: (visibility || undefined) as MastodonVisibility | undefined,
      spoilerText: spoilerText || undefined,
      // Mastodon takes no url, so this one really is downloaded and uploaded again.
      media: mediaUrl ? [{ url: mediaUrl, alt: 'Vom Playground geschickt' }] : undefined,
    })

    return {
      ok: true as const,
      url: status.url,
      // The handle, so the page can change this exact status afterwards.
      id: status.id,
      mediaIds: status.mediaIds,
    }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
