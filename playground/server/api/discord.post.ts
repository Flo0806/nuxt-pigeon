export default defineEventHandler(async (event) => {
  const { text, escape } = await readBody<{ text: string; escape: boolean }>(event)

  try {
    const message = await discord.send(escape ? discord.escapeMarkdown(text) : text)

    return { ok: true as const, sent: (message as { content?: string })?.content }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
