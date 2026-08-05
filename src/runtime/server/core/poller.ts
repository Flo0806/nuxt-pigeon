/**
 * Survives HMR. Without it every reload would start another loop next to the old one,
 * and after three saves four of them hammer the same api.
 */
const POLLERS = Symbol.for('nuxt-pigeon:pollers')

type Store = Record<symbol, Map<string, AbortController> | undefined>

function running(): Map<string, AbortController> {
  const store = globalThis as Store

  return (store[POLLERS] ??= new Map())
}

export interface PollOptions {
  /** How long to wait **after** a round finished, so a slow api cannot stack up. */
  intervalMs: number
  /** Injectable for tests, so a case does not have to sit through real waits. */
  wait?: (ms: number, signal: AbortSignal) => Promise<void>
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

/**
 * Runs `tick` over and over until it is stopped. One poller per name: starting a
 * second one stops the first, which is what makes a hot reload safe.
 *
 * A failing round is logged and the loop continues. A poller that gives up on the
 * first network hiccup would be worse than useless, because nobody restarts it.
 */
export function startPolling(
  name: string,
  options: PollOptions,
  tick: (signal: AbortSignal) => Promise<void>,
): () => void {
  stopPolling(name)

  const controller = new AbortController()
  running().set(name, controller)

  const wait = options.wait ?? sleep

  void (async () => {
    while (!controller.signal.aborted) {
      try {
        await tick(controller.signal)
      } catch (error) {
        // Not thrown on: the next round may well work, and there is nobody to catch
        // it out here anyway.
        console.error(`[nuxt-pigeon] ${name} poll failed:`, error)
      }

      if (controller.signal.aborted) {
        break
      }

      await wait(options.intervalMs, controller.signal)
    }
  })()

  return () => stopPolling(name)
}

export function stopPolling(name: string): void {
  const controller = running().get(name)

  if (controller) {
    controller.abort()
    running().delete(name)
  }
}

export function isPolling(name: string): boolean {
  return running().has(name)
}
