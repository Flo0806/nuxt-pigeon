import { detectRanges } from '../../../src/runtime/server/channels/bluesky/format'

/** Shows what would be linked and where, without posting anything. */
export default defineEventHandler(async (event) => {
  const { text } = await readBody<{ text: string }>(event)

  return detectRanges(text)
})
