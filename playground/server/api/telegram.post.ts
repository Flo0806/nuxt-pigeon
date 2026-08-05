export default defineEventHandler(async (event) => {
  const { text, parseMode, escape, mediaUrl } = await readBody<{
    text: string
    parseMode: string
    escape: boolean
    mediaUrl: string
  }>(event)

  try {
    const message = await telegram.send(escape ? telegram.escapeHtml(text) : text, {
      parseMode: (parseMode || undefined) as 'HTML' | undefined,
      // A url goes to Telegram untouched, it fetches the file itself.
      media: mediaUrl ? [{ url: mediaUrl }] : undefined,
    })

    return {
      ok: true as const,
      sent: message.raw?.result?.text ?? message.raw?.result?.caption,
      id: message.id,
      url: message.url,
      // The handle, so the page can change this exact message afterwards.
      chatId: message.chatId,
      messageId: message.messageId,
      kind: message.kind,
    }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
