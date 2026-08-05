import type { DiscordHandle } from '../../../src/runtime/server/channels/discord/types'

/**
 * A handle is `id` plus the ids of the files on the message, and nothing else. It came
 * back from the browser here, which is exactly the case a database has too: you kept
 * two strings, and that is enough to change the message tomorrow.
 */
export default defineEventHandler(async (event) => {
  const { action, id, attachmentIds, text, mediaUrl, keepImage } = await readBody<{
    action: 'edit' | 'delete'
    id: string
    attachmentIds: string[]
    text: string
    mediaUrl: string
    keepImage: boolean
  }>(event)

  const handle: DiscordHandle = { id, attachmentIds }

  try {
    if (action === 'delete') {
      const gone = await discord.delete(handle)

      return { ok: true as const, status: gone.response.status }
    }

    const message = await discord.edit(handle, text, {
      // Undefined keeps what is on the message, an empty array is the way to say away
      // with them, and a filled one adds to what is already there.
      media: keepImage ? (mediaUrl ? [{ url: mediaUrl }] : undefined) : [],
    })

    return {
      ok: true as const,
      sent: message.raw?.content,
      id: message.id,
      attachmentIds: message.attachmentIds,
    }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
