import type { RequestEvent } from 'nuxt/server'

/**
 * Keeps work alive after the response went out. Nitro's event has `waitUntil` (it matters
 * on serverless, where the process may stop right after answering), but it is not part
 * of `nuxt/server`'s `RequestEvent`. Elsewhere the task simply runs on.
 */
export function waitUntil(event: RequestEvent, task: Promise<unknown>): void {
  const runtime = event as RequestEvent & { waitUntil?: (task: Promise<unknown>) => void }
  if (runtime.waitUntil) {
    runtime.waitUntil(task)
  } else {
    void task
  }
}
