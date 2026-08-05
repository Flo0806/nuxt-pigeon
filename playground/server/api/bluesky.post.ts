export default defineEventHandler(async (event) => {
  const { text, facets } = await readBody<{ text: string; facets: boolean }>(event)

  try {
    const record = await bluesky.post(text, { facets: facets ? undefined : false })

    return { ok: true as const, uri: record.uri }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
