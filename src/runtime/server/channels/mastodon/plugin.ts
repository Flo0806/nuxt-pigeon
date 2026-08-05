import { defineNitroPlugin } from 'nitropack/runtime'
import { useRuntimeConfig } from '#imports'
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

export default defineNitroPlugin((nitro) => {
  const { intervalMs } = useRuntimeConfig().pigeon.channels.mastodon

  /** Newest id we have handed on. Everything above it is unseen. */
  let newest: string | undefined
  let primed = false

  const stop = startPolling('mastodon', { intervalMs }, async () => {
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

  nitro.hooks.hook('close', stop)
})
