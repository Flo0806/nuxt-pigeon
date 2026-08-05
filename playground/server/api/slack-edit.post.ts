/**
 * The handle is the channel id plus the `ts`. Both only exist in bot mode: an incoming
 * webhook answers with `ok` and nothing to point at.
 */
export default defineEventHandler(async (event) => {
  const { action, channelId, id, text } = await readBody<{
    action: 'edit' | 'delete'
    channelId: string
    id: string
    text: string
  }>(event)

  const handle = { channelId, id }

  try {
    if (action === 'delete') {
      await slack.delete(handle)

      return { ok: true as const, deleted: true }
    }

    const message = await slack.edit(handle, text)

    return { ok: true as const, id: message.id, channelId: message.channelId }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
