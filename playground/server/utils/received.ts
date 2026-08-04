import type { PigeonMessage } from '../../../src/runtime/types'

/** Stand in for the bus that does not exist yet. Newest first, last ten kept. */
export const received: (PigeonMessage & { at: string })[] = []
