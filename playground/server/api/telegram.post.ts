export default defineEventHandler(async (event) => {
  const { text, parseMode, escape } = await readBody<{
    text: string
    parseMode: string
    escape: boolean
  }>(event)

  try {
    const message = await telegram.send(escape ? telegram.escapeHtml(text) : text, {
      parseMode: (parseMode || undefined) as 'HTML' | undefined,
    })

    return { ok: true as const, sent: message.text }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
