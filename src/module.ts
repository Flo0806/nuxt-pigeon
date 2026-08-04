import {
  addImports,
  addServerHandler,
  addServerImports,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'

/** Prefixed so they cannot collide with a route the user wrote. */
const DEFAULT_ROUTE = '/api/_pigeon/webhook'
const DEFAULT_STREAM_ROUTE = '/api/_pigeon/stream'

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

export interface StreamOptions {
  /**
   * Pushes incoming messages to the browser. **Defaults to development only**: every
   * open tab would otherwise receive every message, and those can be personal data.
   * Switching it on in production means guarding the route yourself.
   */
  enabled?: boolean
  route?: string
}

export interface ModuleOptions {
  webhook?: WebhookOptions
  stream?: StreamOptions
}

declare module 'nuxt/schema' {
  interface PublicRuntimeConfig {
    pigeon: { streamRoute: string; streaming: boolean }
  }

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
    const streamRoute = options.stream?.route || DEFAULT_STREAM_ROUTE
    const streaming = options.stream?.enabled ?? nuxt.options.dev

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

    // Public because the composable runs in the browser and needs the path.
    nuxt.options.runtimeConfig.public.pigeon = { streamRoute, streaming }

    // Hands Nitro a path, never an import. Anything imported here would run in the
    // build process, which has neither the user's .env nor their cwd.
    addServerImports({ name: 'webhook', from: resolver.resolve('./runtime/server/webhook') })

    // Always imported, even with the stream off: `nuxt prepare` runs with dev false,
    // so gating this would leave the type missing wherever it is typechecked.
    addImports({ name: 'usePigeon', from: resolver.resolve('./runtime/composables/usePigeon') })

    if (streaming) {
      addServerHandler({ route: streamRoute, handler: resolver.resolve('./runtime/server/stream') })
    }

    if (webhook.receive) {
      addServerHandler({
        route: webhook.route || DEFAULT_ROUTE,
        method: 'post',
        handler: resolver.resolve('./runtime/server/webhook-route'),
      })
    }
  },
})
