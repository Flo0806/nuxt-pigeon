import { defineNitroPlugin } from 'nitropack/runtime'
import { useRuntimeConfig } from '#imports'
import { dispatch } from '../../core/listeners'
import { startPolling } from '../../core/poller'
import { bluesky } from './bluesky'
import type { BlueskyNotification } from './types'
import type { PigeonMessage } from '../../../types'

function toMessage(notification: BlueskyNotification): PigeonMessage<BlueskyNotification> {
  return {
    channel: 'bluesky',
    at: new Date().toISOString(),
    raw: JSON.stringify(notification),
    body: notification,
    headers: {},
    // `like`, `follow`, `mention`, `reply`, `quote`, `repost`.
    type: notification.reason,
    text: notification.record?.text,
    from: { id: notification.author.did, name: notification.author.handle },
    conversation: notification.reasonSubject,
  }
}

export default defineNitroPlugin((nitro) => {
  const { intervalMs } = useRuntimeConfig().pigeon.channels.bluesky

  /** The newest `indexedAt` we have handed on. Anything above it is unseen. */
  let newest: string | undefined

  const stop = startPolling('bluesky', { intervalMs }, async () => {
    // The cursor pages backwards, so there is no "since". The newest page plus a
    // comparison is the only way to find what arrived.
    const { notifications } = await bluesky.notifications({ limit: 50 })

    if (!notifications.length) {
      return
    }

    // First round only marks the position, otherwise every restart would replay the
    // whole backlog as if it had just arrived.
    if (newest) {
      const fresh = notifications.filter((entry) => entry.indexedAt > newest!)

      // Oldest first, so a handler sees them in the order they happened.
      for (const notification of fresh.reverse()) {
        await dispatch('bluesky', toMessage(notification))
      }
    }

    newest = notifications[0]!.indexedAt
  })

  nitro.hooks.hook('close', stop)
})
