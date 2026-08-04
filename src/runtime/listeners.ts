/** Listeners registered under this name get every channel, which is what the stream needs. */
export const ANY = '*'

export interface WebhookMessage {
  /** Which channel it came in on. */
  channel: string
  /** When we received it, not when the sender created it. */
  at: string
  /** The untouched bytes. A signature covers these, a re-serialised body does not. */
  raw: string
  /** Parsed when the body is JSON, otherwise the same string as `raw`. */
  body: unknown
  /** Lower cased keys, which is what h3 hands out. */
  headers: Record<string, string>
}

export type WebhookHandler = (message: WebhookMessage) => unknown | Promise<unknown>

/**
 * Survives HMR. Without this every reload would add another copy of the same handler
 * and a single incoming request would run it three or four times.
 */
const REGISTRY = Symbol.for('nuxt-pigeon:listeners')

type Store = Record<symbol, Map<string, Set<WebhookHandler>> | undefined>

function registry(): Map<string, Set<WebhookHandler>> {
  const store = globalThis as Store

  return (store[REGISTRY] ??= new Map())
}

/** Returns the function to unregister again, which a plugin needs on shutdown. */
export function addListener(channel: string, handler: WebhookHandler): () => void {
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
export async function dispatch(channel: string, message: WebhookMessage): Promise<void> {
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
