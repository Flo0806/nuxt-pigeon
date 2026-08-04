import type { WebhookMessage } from '../../../src/runtime/listeners'

/** Stand in for the bus that does not exist yet. Newest first, last ten kept. */
export const received: (WebhookMessage & { at: string })[] = []
