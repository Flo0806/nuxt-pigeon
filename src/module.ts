import { addServerHandler, addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'

/** Prefixed so it cannot collide with a route the user wrote. */
const DEFAULT_ROUTE = '/api/_pigeon/webhook'

export interface WebhookEndpoint {
  /** Falls back to `PIGEON_WEBHOOK_<NAME>_URL`, so it can stay out of the config. */
  url?: string
  /** Static headers, typically auth. A call merges its own over these. */
  headers?: Record<string, string>
}

export interface WebhookOptions {
  /** Registers the route incoming webhooks are delivered to. */
  receive?: boolean
  /** Where that route lives. Change it if it collides with your own. */
  route?: string
  /** Target for calls that name no endpoint. */
  url?: string
  /** Headers every endpoint inherits. */
  headers?: Record<string, string>
  /**
   * Named targets, so a call reads `webhook.send(payload, { to: 'chat' })` instead of
   * repeating urls. Secrets come from `PIGEON_WEBHOOK_<NAME>_SECRET`.
   */
  endpoints?: Record<string, WebhookEndpoint>
}

export interface ModuleOptions {
  webhook?: WebhookOptions
}

declare module 'nuxt/schema' {
  interface RuntimeConfig {
    pigeon: {
      webhook: {
        url: string
        secret: string
        headers: Record<string, string>
        endpoints: Record<string, { url: string; secret: string; headers: Record<string, string> }>
      }
    }
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-pigeon',
    configKey: 'nuxtPigeon',
  },
  defaults: {},
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const webhook = options.webhook ?? {}

    // Placeholders for every key, filled or not. Nuxt only applies a NUXT_ env
    // override to keys that already exist, and empty strings cost nothing.
    const pigeon = {
      webhook: {
        url: webhook.url || '',
        secret: '',
        headers: webhook.headers ?? {},
        endpoints: Object.fromEntries(
          Object.entries(webhook.endpoints ?? {}).map(([name, endpoint]) => [
            name,
            { url: endpoint.url || '', secret: '', headers: endpoint.headers ?? {} },
          ]),
        ),
      },
    }

    nuxt.options.runtimeConfig.pigeon = {
      ...pigeon,
      ...nuxt.options.runtimeConfig.pigeon,
    }

    // Hands Nitro a path, never an import. Anything imported here would run in the
    // build process, which has neither the user's .env nor their cwd.
    addServerImports({ name: 'webhook', from: resolver.resolve('./runtime/server/webhook') })

    if (webhook.receive) {
      addServerHandler({
        route: webhook.route || DEFAULT_ROUTE,
        method: 'post',
        handler: resolver.resolve('./runtime/server/webhook-route'),
      })
    }
  },
})
