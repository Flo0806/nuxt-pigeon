import { useRuntimeConfig } from '#imports'
import { getOverride, resolveCredentials, type CredentialsMode } from '../core/credentials'
import { resolveEndpoint, type WebhookConfig } from '../core/endpoint'
import { defineLifecycle } from '../core/lifecycle'
import { addListener, type Handler } from '../core/listeners'
import { post, type PostOptions } from '../core/post'
import { toResult } from '../core/result'
import { unsupported } from '../core/unsupported'

export interface WebhookSendOptions extends PostOptions {
  /** Name of a configured endpoint. Without one the default url is used. */
  to?: string
  /** Overrides the endpoint url, or supplies one for a call with no config at all. */
  url?: string
}

function mode() {
  // Generated runtime config types widen the literal to `string`.
  return useRuntimeConfig().pigeon.webhook.credentials as CredentialsMode
}

/**
 * The webhook is the one channel whose "credentials" are a whole map: a default url,
 * a secret, headers, and named endpoints with the same three each. `configure()`
 * takes that same shape, and in `runtime` mode the environment is not consulted for
 * any of it, so `resolveEndpoint` gets an empty one.
 */
function settings() {
  const config = useRuntimeConfig().pigeon.webhook

  return resolveCredentials<WebhookConfig>({
    channel: 'webhook',
    mode: mode(),
    static: {
      url: config.url || process.env.PIGEON_WEBHOOK_URL,
      secret: config.secret || process.env.PIGEON_WEBHOOK_SECRET,
      headers: config.headers,
      endpoints: config.endpoints,
    },
    override: getOverride('webhook'),
    // A call can always name its own url, so "configured" only means a default exists.
    configured: (values) => !!(values.url || Object.keys(values.endpoints ?? {}).length),
  })
}

function resolveTarget(name?: string) {
  const { values } = settings()

  // In `runtime` mode the environment stays out, including the per endpoint variables.
  return resolveEndpoint(values, mode() === 'runtime' ? {} : process.env, name)
}

/**
 * The layer a user can reach for directly. Sends whatever you give it to whatever url
 * you point it at, and adds nothing of its own.
 *
 * Everything below this is the same for every channel, so a channel that is itself a
 * webhook, like Discord or Slack, can sit on the very same function.
 */
async function send(payload: unknown, options: WebhookSendOptions = {}) {
  const target = resolveTarget(options.to)
  const url = options.url || target.url

  if (!url) {
    throw new Error(
      options.to
        ? `Webhook endpoint "${options.to}" has no url`
        : mode() === 'runtime'
          ? "Webhook url is not defined. `credentials: 'runtime'` is set, so call " +
            'webhook.configure({ url }) first, or pass one per call'
          : 'Webhook url is not defined. Set PIGEON_WEBHOOK_URL, call ' +
            'webhook.configure({ url }), or pass one per call',
    )
  }

  const response = await post(url, payload, {
    ...options,
    secret: options.secret ?? target.secret,
    headers: { ...target.headers, ...options.headers },
    label: options.label || (options.to ? `Webhook endpoint "${options.to}"` : undefined),
  })

  // No id and no link: the receiver is whatever you pointed at, and it owes us no
  // shape at all. `endpoint` is where it went, which is the one thing we do know.
  return { ...toResult('webhook', response), channel: 'webhook' as const, endpoint: url }
}

/**
 * Runs the handler for every request that reaches the configured route. Register it
 * from a Nitro plugin, so it happens once at startup instead of per request.
 *
 * Returns the function to unregister, which matters during development: without it a
 * hot reload would stack another copy of the same handler.
 */
function listen(handler: Handler): () => void {
  return addListener('webhook', handler)
}

/**
 * Nothing runs for the webhook, so `configure` only sets. It takes the config shape:
 * `{ url, secret, headers, endpoints: { name: { url, secret, headers } } }`.
 */
const lifecycle = defineLifecycle<WebhookConfig>({
  channel: 'webhook',
  mode,
  resolve: settings,
  // Never throws: a call with its own url is fine without any default.
  assert: () => {},
})

/**
 * Nothing is missing here, the concept is: you point this at any url, so only you know
 * whether the thing on the other end can be changed and how. `send` already carries
 * `method` and `url`, so a PATCH or a DELETE is one call.
 */
const api = {
  send,
  listen,
  ...lifecycle,
  edit: unsupported(
    'webhook',
    'edit',
    'You decide what the receiver is, so only you know how it is changed. `send` takes ' +
      "a method: webhook.send(payload, { method: 'PATCH', url }).",
  ),
  delete: unsupported(
    'webhook',
    'delete',
    'You decide what the receiver is, so only you know how it is removed. `send` takes ' +
      "a method: webhook.send(undefined, { method: 'DELETE', url }).",
  ),
}

export const webhook: Omit<typeof api, 'edit' | 'delete'> = api
