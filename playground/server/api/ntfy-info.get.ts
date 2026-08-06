/**
 * What the ntfy card needs to describe itself. The server is worth naming, because
 * updating and deleting needs **2.16.0 or newer** and a self hosted one may be older.
 *
 * The topic stays a boolean on purpose: on a public instance anyone who knows the name
 * can read along, so it is closer to a password than to an address.
 */
export default defineEventHandler(() => {
  const config = useRuntimeConfig().pigeon.channels.ntfy

  const server = config.server || process.env.PIGEON_NTFY_SERVER || 'https://ntfy.sh'

  return {
    server,
    topic: Boolean(config.topic || process.env.PIGEON_NTFY_TOPIC),
    token: Boolean(config.token || process.env.PIGEON_NTFY_TOKEN),
  }
})
