import { createEventStream, defineEventHandler, setResponseHeaders } from 'h3'
import { addListener, ANY } from '../core/listeners'

/**
 * Server sent events, not a WebSocket: everything flows one way, from us to the
 * browser, and `EventSource` reconnects on its own when the connection drops.
 *
 * Subscribes to every channel and unsubscribes as soon as the browser goes away.
 * Without that every reloaded tab would leave a handler behind.
 */
/**
 * Proxies close a connection that stays silent. Cloudflare gives up after 100
 * seconds, an AWS load balancer after 60 by default, so 30 clears both with room.
 */
const HEARTBEAT_MS = 30_000

export default defineEventHandler((event) => {
  // Anything that buffers breaks a stream. nginx and several proxies honour this.
  setResponseHeaders(event, { 'x-accel-buffering': 'no' })

  const stream = createEventStream(event)

  // No named event: a named one would need addEventListener on the client and
  // onmessage would stay silent. The channel travels inside the data instead.
  const stop = addListener(ANY, (message) => stream.push(JSON.stringify(message)))

  // Named on purpose, the opposite reason: `onmessage` must **not** see the beat.
  const beat = setInterval(() => stream.push({ event: 'ping', data: '' }), HEARTBEAT_MS)

  stream.onClosed(async () => {
    stop()
    clearInterval(beat)
    await stream.close()
  })

  return stream.send()
})
