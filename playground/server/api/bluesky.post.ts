export default defineEventHandler(async (event) => {
  const { text, facets, mediaUrl, alt, cardUrl, cardTitle, cardDescription } = await readBody<{
    text: string
    facets: boolean
    mediaUrl: string
    alt: string
    cardUrl: string
    cardTitle: string
    cardDescription: string
  }>(event)

  try {
    const record = await bluesky.post(text, {
      facets: facets ? undefined : false,
      // Both are handed over exactly as entered. Deciding between them is the
      // channel's job, and it says in the server log what it did.
      media: mediaUrl ? [{ url: mediaUrl, alt: alt || undefined }] : undefined,
      external: cardUrl
        ? {
            uri: cardUrl,
            // Nothing here is read from the linked page, Bluesky builds no card itself.
            title: cardTitle,
            description: cardDescription,
          }
        : undefined,
    })

    return {
      ok: true as const,
      uri: record.id,
      url: record.url,
      // The handle: deleteRecord wants exactly these three.
      repo: record.repo,
      collection: record.collection,
      rkey: record.rkey,
    }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
