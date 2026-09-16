import { defineNitroPlugin } from 'nitropack/runtime'
import { useRuntimeConfig } from '#imports'
import { registerReceiver, startReceiver, stopReceiver } from '../../core/lifecycle'
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

/**
 * One run of the poller, from a blank position. A function rather than the plugin
 * body so `configure()` can call it again: every start gets its own `newest`, which
 * is what makes a restart forget the old account.
 */
function start() {
  const { intervalMs } = useRuntimeConfig().pigeon.channels.bluesky

  /** The newest `indexedAt` we have handed on. Anything above it is unseen. */
  let newest: string | undefined

  startPolling('bluesky', { intervalMs }, async () => {
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
}

export default defineNitroPlugin((nitro) => {
  registerReceiver('bluesky', start)

  // Without credentials the poller would only fail to log in every round. It waits
  // for `configure()` instead, and says so once when that is not the plan.
  if (bluesky.status().configured) {
    startReceiver('bluesky')
  } else if (useRuntimeConfig().pigeon.channels.bluesky.credentials === 'static') {
    console.info(
      '[nuxt-pigeon] bluesky: no credentials, not polling. Set PIGEON_BLUESKY_IDENTIFIER ' +
        'and _PASSWORD, or call bluesky.configure()',
    )
  }

  nitro.hooks.hook('close', () => stopReceiver('bluesky'))
})
