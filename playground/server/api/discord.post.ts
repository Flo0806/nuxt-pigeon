export default defineEventHandler(async (event) => {
  const { text, escape, mediaUrl, alt, spoiler, withEmbed } = await readBody<{
    text: string
    escape: boolean
    mediaUrl: string
    alt: string
    spoiler: boolean
    withEmbed: boolean
  }>(event)

  // Fixed so the embed below can point at it by name.
  const filename = spoiler ? 'SPOILER_shot.png' : 'shot.png'

  const media = mediaUrl ? [{ url: mediaUrl, alt: alt || undefined, spoiler, filename }] : undefined

  const embeds = withEmbed
    ? [
        {
          title: 'nuxt-pigeon',
          description: 'An embed, with the attachment shown inside it.',
          color: 0x00dc82,
          // Points at the file sent alongside, which is how nuxt.fyi does it.
          ...(media ? { image: { url: `attachment://${filename}` } } : {}),
        },
      ]
    : undefined

  try {
    const message = await discord.send(escape ? discord.escapeMarkdown(text) : text, {
      media,
      embeds,
    })

    return { ok: true as const, sent: message.raw?.content, id: message.id }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
