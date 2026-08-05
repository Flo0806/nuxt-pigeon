import type { NtfyPriority } from '../../../src/runtime/server/channels/ntfy/types'

export default defineEventHandler(async (event) => {
  const { text, title, priority, tags, click } = await readBody<{
    text: string
    title: string
    priority: number
    tags: string
    click: string
  }>(event)

  try {
    const published = await ntfy.send(text, {
      title: title || undefined,
      priority: (priority || undefined) as NtfyPriority | undefined,
      tags: tags ? tags.split(',').map((tag) => tag.trim()) : undefined,
      click: click || undefined,
    })

    return { ok: true as const, id: (published as { id?: string })?.id }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
