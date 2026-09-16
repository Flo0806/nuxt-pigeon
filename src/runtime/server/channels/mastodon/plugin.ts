import { defineNitroPlugin } from 'nitropack/runtime'
import { useRuntimeConfig } from '#imports'
import { registerReceiver, startReceiver, stopReceiver } from '../../core/lifecycle'
import { dispatch } from '../../core/listeners'
import { startPolling } from '../../core/poller'
import { plainText } from './format'
import { mastodon } from './mastodon'
import type { MastodonNotification } from './types'
import type { PigeonMessage } from '../../../types'

function toMessage(notification: MastodonNotification): PigeonMessage<MastodonNotification> {
  return {
    channel: 'mastodon',
    at: new Date().toISOString(),
    raw: JSON.stringify(notification),
    body: notification,
    headers: {},
    type: notification.type,
    // The html stays in `body`, this is the readable view of it.
    text: notification.status?.content ? plainText(notification.status.content) : undefined,
    from: { id: notification.account.id, name: notification.account.acct },
    conversation: notification.status?.id,
  }
}

/**
 * One run of the poller, from a blank position. A function rather than the plugin
 * body so `configure()` can call it again: every start gets its own `newest`, which
 * is what makes a restart forget the old account.
 */
function start() {
  const { intervalMs } = useRuntimeConfig().pigeon.channels.mastodon

  /** Newest id we have handed on. Everything above it is unseen. */
  let newest: string | undefined
  let primed = false

  startPolling('mastodon', { intervalMs }, async () => {
    // `minId` walks forward from what we hold, so nothing in between is skipped.
    const { notifications } = await mastodon.notifications({ minId: newest, limit: 40 })

    if (!notifications.length) {
      return
    }

    // The first round only marks where we are. Without this every restart would
    // replay the whole backlog as if it had just arrived.
    if (primed) {
      // Oldest first, so a handler sees them in the order they happened.
      for (const notification of [...notifications].reverse()) {
        await dispatch('mastodon', toMessage(notification))
      }
    }

    newest = notifications[0]!.id
    primed = true
  })
}

export default defineNitroPlugin((nitro) => {
  registerReceiver('mastodon', start)

  // Without credentials the poller would only collect a 401 every round. It waits
  // for `configure()` instead, and says so once when that is not the plan.
  if (mastodon.status().configured) {
    startReceiver('mastodon')
  } else if (useRuntimeConfig().pigeon.channels.mastodon.credentials === 'static') {
    console.info(
      '[nuxt-pigeon] mastodon: no credentials, not polling. Set PIGEON_MASTODON_INSTANCE ' +
        'and _TOKEN, or call mastodon.configure()',
    )
  }

  nitro.hooks.hook('close', () => stopReceiver('mastodon'))
})
