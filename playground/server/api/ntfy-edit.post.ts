/**
 * The handle is the topic plus the id. The id may be the one ntfy handed out, or one
 * you chose yourself when publishing (`sequenceId`), which is what makes a repeatedly
 * updated status notification possible in the first place.
 */
export default defineEventHandler(async (event) => {
  const { action, topic, id, text, title } = await readBody<{
    action: 'edit' | 'delete'
    topic: string
    id: string
    text: string
    title: string
  }>(event)

  const handle = { topic, id }

  try {
    if (action === 'delete') {
      const gone = await ntfy.delete(handle)

      return { ok: true as const, status: gone.response.status }
    }

    // Every send option works here too, because an update **is** a publish that
    // carries the same sequence id.
    const published = await ntfy.edit(handle, text, { title: title || undefined })

    return { ok: true as const, id: published.id, topic: published.topic }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
