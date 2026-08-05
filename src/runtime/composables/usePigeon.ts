import { onScopeDispose, ref, shallowRef, type Ref } from 'vue'
import { useRuntimeConfig } from '#imports'
import type { PigeonMessage } from '../types'

export interface UsePigeonOptions {
  /** Only this channel. Without it every channel arrives. */
  channel?: string
  /** How many messages to keep. Newest first. */
  limit?: number
}

type Subscriber = (message: PigeonMessage) => void

interface Connection {
  source: EventSource
  subscribers: Set<Subscriber>
  connected: Ref<boolean>
}

/**
 * Survives hot reloads. Without this a reload would leave the old connection open and
 * the count would drift, which is the same class of bug the server side pollers have.
 */
const SHARED = Symbol.for('nuxt-pigeon:stream')

function store(): Map<string, Connection> {
  const global = globalThis as Record<symbol, Map<string, Connection> | undefined>

  return (global[SHARED] ??= new Map())
}

/**
 * **One connection per page**, however many components ask for messages.
 *
 * A browser allows about six connections per host over HTTP/1.1, and `nuxt dev` speaks
 * HTTP/1.1. So a page with a component per channel would open eight streams and the
 * last ones would simply hang, with nothing to see and nothing in the log. Sharing
 * costs nothing: the server already sends every channel down the same stream, and the
 * filtering happens here anyway.
 */
function connect(route: string): Connection {
  const existing = store().get(route)
  if (existing) {
    return existing
  }

  const source = new EventSource(route)
  const connection: Connection = { source, subscribers: new Set(), connected: ref(false) }

  source.onopen = () => (connection.connected.value = true)
  // EventSource retries on its own, so a drop is not an error to report.
  source.onerror = () => (connection.connected.value = false)

  source.onmessage = (payload: MessageEvent<string>) => {
    const message = JSON.parse(payload.data) as PigeonMessage
    for (const subscriber of connection.subscribers) {
      subscriber(message)
    }
  }

  store().set(route, connection)

  return connection
}

/**
 * Live messages from the server, filtered to one channel or all of them.
 *
 * Browser only: nothing is opened during server rendering, so a rendered page starts
 * out empty instead of hanging on a stream that never ends.
 *
 * `connected` says whether **the browser** is attached to the stream. Whether a given
 * channel is receiving at all is a different question and lives on the server.
 */
export function usePigeon(options: UsePigeonOptions = {}) {
  const messages = shallowRef<PigeonMessage[]>([])
  const connected = ref(false)
  const limit = options.limit ?? 50

  const { streamRoute, streaming } = useRuntimeConfig().public.pigeon

  // Off in production unless switched on, so nothing tries to reach a missing route.
  if (!import.meta.client || !streaming) {
    return { messages, connected, close: () => {} }
  }

  const connection = connect(streamRoute)

  const receive: Subscriber = (message) => {
    if (options.channel && message.channel !== options.channel) {
      return
    }

    messages.value = [message, ...messages.value].slice(0, limit)
  }

  connection.subscribers.add(receive)

  function close() {
    connection.subscribers.delete(receive)

    // The last one out turns off the light, otherwise a closed page keeps a stream.
    if (!connection.subscribers.size) {
      connection.source.close()
      connection.connected.value = false
      store().delete(streamRoute)
    }
  }

  onScopeDispose(close)

  // The shared flag, so every caller reports the same truth about one connection.
  return { messages, connected: connection.connected, close }
}
