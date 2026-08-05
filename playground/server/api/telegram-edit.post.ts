import type { TelegramHandle } from '../../../src/runtime/server/channels/telegram/types'

/**
 * A handle is `chatId`, `messageId` and what the message is made of, nothing more.
 * `send` hands it over as part of its result, and it survives a trip through the
 * browser, which is what happens here.
 */
export default defineEventHandler(async (event) => {
  const { action, chatId, messageId, kind, text, mediaUrl, buttonsOnly } = await readBody<{
    action: 'edit' | 'delete'
    chatId: string | number
    messageId: number
    kind: 'text' | 'media'
    text: string
    mediaUrl: string
    buttonsOnly: boolean
  }>(event)

  const handle: TelegramHandle = { chatId, messageId, kind }

  try {
    if (action === 'delete') {
      const gone = await telegram.delete(handle)

      return { ok: true as const, deleted: gone.raw?.result === true }
    }

    const message = await telegram.edit(
      handle,
      // No text at all means only the buttons change, which is the fourth method.
      buttonsOnly ? undefined : text,
      {
        media: mediaUrl ? [{ url: mediaUrl }] : undefined,
        replyMarkup: buttonsOnly
          ? { inline_keyboard: [[{ text: 'nuxt-pigeon', url: 'https://nuxt.com' }]] }
          : undefined,
      },
    )

    return {
      ok: true as const,
      sent: message.raw?.result?.text ?? message.raw?.result?.caption,
      // Changes from text to media the moment a picture is added.
      kind: message.kind,
      messageId: message.messageId,
      chatId: message.chatId,
    }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
