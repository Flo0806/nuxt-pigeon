import type { DiscordResult } from '../../../src/runtime/server/channels/discord/types'

/**
 * Editing and deleting take the result of `send` as their handle. Here it comes back
 * from the browser, which is why only the two fields that matter are rebuilt: in real
 * code you either keep the result around or store `id` and `attachmentIds` yourself.
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

  const handle = { channel: 'discord', id, attachmentIds } as DiscordResult

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
