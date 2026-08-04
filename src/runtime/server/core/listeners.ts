import type { PigeonMessage } from '../../types'

/** Listeners registered under this name get every channel, which is what the stream needs. */
export const ANY = '*'

export type Handler = (message: PigeonMessage) => unknown | Promise<unknown>

/**
 * Survives HMR. Without this every reload would add another copy of the same handler
 * and a single incoming request would run it three or four times.
 */
const REGISTRY = Symbol.for('nuxt-pigeon:listeners')

type Store = Record<symbol, Map<string, Set<Handler>> | undefined>

function registry(): Map<string, Set<Handler>> {
  const store = globalThis as Store

  return (store[REGISTRY] ??= new Map())
}

/** Returns the function to unregister again, which a plugin needs on shutdown. */
export function addListener(channel: string, handler: Handler): () => void {
  const handlers = registry().get(channel) ?? new Set()
  handlers.add(handler)
  registry().set(channel, handlers)

  return () => handlers.delete(handler)
}

export function listenerCount(channel: string): number {
  return registry().get(channel)?.size ?? 0
}

/**
 * One failing handler must not stop the others, and must not turn into a failed
 * response for the sender: that would make the service retry a message we already
 * have. So every handler is awaited on its own and its error only reported.
 */
export async function dispatch(channel: string, message: PigeonMessage): Promise<void> {
  const handlers = new Set([
    ...(registry().get(channel) ?? []),
    ...(channel === ANY ? [] : (registry().get(ANY) ?? [])),
  ])

  if (!handlers.size) {
    return
  }

  // `async` matters: a handler that throws synchronously would otherwise take the
  // whole map down before allSettled ever sees it.
  const results = await Promise.allSettled([...handlers].map(async (handler) => handler(message)))

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error(`[nuxt-pigeon] ${channel} listener failed:`, result.reason)
    }
  }
}

/** Only for tests, so one case cannot leak handlers into the next. */
export function clearListeners(): void {
  registry().clear()
}
