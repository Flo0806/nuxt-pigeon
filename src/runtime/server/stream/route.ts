import { createEventStream, defineEventHandler } from 'h3'
import { addListener, ANY } from '../core/listeners'

/**
 * Server sent events, not a WebSocket: everything flows one way, from us to the
 * browser, and `EventSource` reconnects on its own when the connection drops.
 *
 * Subscribes to every channel and unsubscribes as soon as the browser goes away.
 * Without that every reloaded tab would leave a handler behind.
 */
export default defineEventHandler((event) => {
  const stream = createEventStream(event)

  // No named event: a named one would need addEventListener on the client and
  // onmessage would stay silent. The channel travels inside the data instead.
  const stop = addListener(ANY, (message) => stream.push(JSON.stringify(message)))

  stream.onClosed(async () => {
    stop()
    await stream.close()
  })

  return stream.send()
})
