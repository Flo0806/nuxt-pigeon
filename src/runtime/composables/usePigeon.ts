import { onScopeDispose, ref, shallowRef } from 'vue'
import { useRuntimeConfig } from '#imports'
import type { PigeonMessage } from '../types'

export interface UsePigeonOptions {
  /** Only this channel. Without it every channel arrives. */
  channel?: string
  /** How many messages to keep. Newest first. */
  limit?: number
}

/**
 * Live messages from the server. Opens one `EventSource` per call and closes it when
 * the component goes away.
 *
 * Browser only: the connection is opened after mount, so a server rendered page just
 * starts out empty instead of hanging on a stream that never ends.
 */
export function usePigeon(options: UsePigeonOptions = {}) {
  const messages = shallowRef<PigeonMessage[]>([])
  const connected = ref(false)
  const limit = options.limit ?? 50

  let source: EventSource | undefined

  function close() {
    source?.close()
    source = undefined
    connected.value = false
  }

  const { streamRoute, streaming } = useRuntimeConfig().public.pigeon

  // Off in production unless switched on, so nothing tries to reach a missing route.
  if (import.meta.client && streaming) {
    source = new EventSource(streamRoute)

    source.onopen = () => (connected.value = true)
    // EventSource retries on its own, so a drop is not an error to report.
    source.onerror = () => (connected.value = false)

    source.onmessage = (payload: MessageEvent<string>) => {
      const message = JSON.parse(payload.data) as PigeonMessage
      if (options.channel && message.channel !== options.channel) {
        return
      }

      messages.value = [message, ...messages.value].slice(0, limit)
    }

    onScopeDispose(close)
  }

  return { messages, connected, close }
}
