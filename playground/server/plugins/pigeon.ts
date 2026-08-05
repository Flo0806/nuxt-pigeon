import { received } from '../utils/received'
import type { PigeonMessage } from '../../../src/runtime/types'

/**
 * How a user registers a listener: once at startup, from a Nitro plugin. The returned
 * function unregisters again, which keeps a hot reload from stacking copies.
 */
export default defineNitroPlugin((nitro) => {
  const keep = (message: PigeonMessage) => {
    received.unshift(message)
    received.length = Math.min(received.length, 10)
  }

  const stops = [
    webhook.listen(keep),
    telegram.listen(keep),
    slack.listen(keep),
    mastodon.listen(keep),
    bluesky.listen(keep),
  ]

  nitro.hooks.hook('close', () => stops.forEach((stop) => stop()))
})
