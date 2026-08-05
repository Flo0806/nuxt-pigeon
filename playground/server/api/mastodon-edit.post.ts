/**
 * The handle is the id plus the ids of the files on it. The instance is not part of
 * it: the token belongs to one instance, so it comes from the config either way.
 */
export default defineEventHandler(async (event) => {
  const { action, id, mediaIds, text, mediaUrl, keepImages } = await readBody<{
    action: 'edit' | 'delete'
    id: string
    mediaIds: string[]
    text: string
    mediaUrl: string
    keepImages: boolean
  }>(event)

  const handle = { id, mediaIds }

  try {
    if (action === 'delete') {
      const gone = await mastodon.delete(handle)

      // Mastodon answers with the deleted status, plain text included. That is what
      // clients use for their delete and redraft.
      return { ok: true as const, redraft: gone.raw?.text as string | undefined }
    }

    const status = await mastodon.edit(handle, text, {
      media: keepImages ? (mediaUrl ? [{ url: mediaUrl }] : undefined) : [],
    })

    return {
      ok: true as const,
      url: status.url,
      id: status.id,
      mediaIds: status.mediaIds,
      editedAt: status.raw?.edited_at,
    }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
