import { received } from '../utils/received'

/**
 * How a user registers a listener: once at startup, from a Nitro plugin. The returned
 * function unregisters again, which keeps a hot reload from stacking copies.
 */
export default defineNitroPlugin((nitro) => {
  const stop = webhook.listen((message) => {
    received.unshift({ ...message, at: new Date().toISOString() })
    received.length = Math.min(received.length, 10)
  })

  nitro.hooks.hook('close', stop)
})
