export default defineEventHandler(async (event) => {
  const { repo, collection, rkey } = await readBody<{
    repo: string
    collection: string
    rkey: string
  }>(event)

  try {
    const gone = await bluesky.delete({ repo, collection, rkey })

    return { ok: true as const, status: gone.response.status, uri: gone.id }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
