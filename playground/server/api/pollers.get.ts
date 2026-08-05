import { isPolling } from '../../../src/runtime/server/core/poller'

/** So a silent poller can be told apart from one that never started. */
export default defineEventHandler(() => ({
  mastodon: isPolling('mastodon'),
}))
