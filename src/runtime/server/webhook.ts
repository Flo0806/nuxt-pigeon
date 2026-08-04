import { useRuntimeConfig } from '#imports'
import { resolveEndpoint } from '../endpoint'
import { post, type PostOptions } from '../post'

export interface WebhookSendOptions extends PostOptions {
  /** Name of a configured endpoint. Without one the default url is used. */
  to?: string
  /** Overrides the endpoint url, or supplies one for a call with no config at all. */
  url?: string
}

/**
 * The layer a user can reach for directly. Sends whatever you give it to whatever url
 * you point it at, and adds nothing of its own.
 *
 * Everything below this is the same for every channel, so a channel that is itself a
 * webhook, like Discord or Slack, can sit on the very same function.
 */
async function send(payload: unknown, options: WebhookSendOptions = {}) {
  const target = resolveEndpoint(useRuntimeConfig().pigeon.webhook, process.env, options.to)
  const url = options.url || target.url

  if (!url) {
    throw new Error(
      options.to
        ? `Webhook endpoint "${options.to}" has no url`
        : 'Webhook url is not defined. Set PIGEON_WEBHOOK_URL or pass one per call',
    )
  }

  return post(url, payload, {
    ...options,
    secret: options.secret ?? target.secret,
    headers: { ...target.headers, ...options.headers },
    label: options.label || (options.to ? `Webhook endpoint "${options.to}"` : undefined),
  })
}

export const webhook = { send }
