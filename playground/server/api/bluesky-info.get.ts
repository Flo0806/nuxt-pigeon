/**
 * Booleans and the service, never the credentials. The identifier is a handle or an
 * email, and an email has no business on a page.
 */
export default defineEventHandler(() => {
  const config = useRuntimeConfig().pigeon.channels.bluesky

  return {
    service: config.service || process.env.PIGEON_BLUESKY_SERVICE || 'https://bsky.social',
    identifier: Boolean(config.identifier || process.env.PIGEON_BLUESKY_IDENTIFIER),
    password: Boolean(config.password || process.env.PIGEON_BLUESKY_PASSWORD),
  }
})
