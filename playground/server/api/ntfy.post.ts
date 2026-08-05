import type { NtfyPriority } from '../../../src/runtime/server/channels/ntfy/types'

export default defineEventHandler(async (event) => {
  const { text, title, priority, tags, click, mediaUrl } = await readBody<{
    text: string
    title: string
    priority: number
    tags: string
    click: string
    mediaUrl: string
  }>(event)

  try {
    const published = await ntfy.send(text, {
      title: title || undefined,
      priority: (priority || undefined) as NtfyPriority | undefined,
      tags: tags ? tags.split(',').map((tag) => tag.trim()) : undefined,
      click: click || undefined,
      // A url stays a url, ntfy fetches it itself.
      media: mediaUrl ? { url: mediaUrl } : undefined,
    })

    return { ok: true as const, id: published.id }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
