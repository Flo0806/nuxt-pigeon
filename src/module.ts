import {
  addImports,
  addServerHandler,
  addServerImports,
  createResolver,
  defineNuxtModule,
  useLogger,
} from '@nuxt/kit'

/** Prefixed so they cannot collide with a route the user wrote. */
const DEFAULT_ROUTE = '/api/_pigeon/webhook'
const DEFAULT_STREAM_ROUTE = '/api/_pigeon/stream'
const DEFAULT_TELEGRAM_ROUTE = '/api/_pigeon/telegram'
const DEFAULT_SLACK_ROUTE = '/api/_pigeon/slack'

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

export interface DiscordOptions {
  /** Falls back to `PIGEON_DISCORD_WEBHOOK_URL`. The url itself is the credential. */
  webhookUrl?: string
}

export interface TelegramOptions {
  /** Falls back to `PIGEON_TELEGRAM_BOT_TOKEN`. */
  token?: string
  /** Falls back to `PIGEON_TELEGRAM_CHAT_ID`. */
  chatId?: string | number
  /**
   * Registers the route Telegram delivers updates to. Telegram cannot reach
   * localhost, so development needs a tunnel as well.
   */
  receive?: boolean
  route?: string
}

export interface SlackOptions {
  /** Falls back to `PIGEON_SLACK_WEBHOOK_URL`. The url itself is the credential. */
  webhookUrl?: string
  /**
   * Registers the Events API route. Slack has no polling, so this needs a publicly
   * reachable address even in development.
   */
  receive?: boolean
  route?: string
}

export interface ChannelOptions {
  discord?: boolean | DiscordOptions
  telegram?: boolean | TelegramOptions
  slack?: boolean | SlackOptions
}

export interface ModuleOptions {
  webhook?: WebhookOptions
  stream?: StreamOptions
  channels?: ChannelOptions
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
      channels: {
        discord: { webhookUrl: string }
        telegram: { token: string; chatId: string; secretToken: string; route: string }
        slack: { webhookUrl: string; signingSecret: string }
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
    const logger = useLogger('nuxt-pigeon')
    const webhook = options.webhook ?? {}
    const discord = options.channels?.discord
    const discordOptions = typeof discord === 'object' ? discord : {}
    const telegram = options.channels?.telegram
    const telegramOptions = typeof telegram === 'object' ? telegram : {}
    const telegramRoute = telegramOptions.route || DEFAULT_TELEGRAM_ROUTE
    const slack = options.channels?.slack
    const slackOptions = typeof slack === 'object' ? slack : {}
    const slackRoute = slackOptions.route || DEFAULT_SLACK_ROUTE
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
      channels: {
        discord: { webhookUrl: discordOptions.webhookUrl || '' },
        // The token never belongs in a config file, only the placeholder does.
        telegram: {
          token: '',
          chatId: String(telegramOptions.chatId ?? ''),
          secretToken: '',
          route: telegramRoute,
        },
        slack: { webhookUrl: slackOptions.webhookUrl || '', signingSecret: '' },
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
    addServerImports({
      name: 'webhook',
      from: resolver.resolve('./runtime/server/webhook/webhook'),
    })

    // Always imported, even with the stream off: `nuxt prepare` runs with dev false,
    // so gating this would leave the type missing wherever it is typechecked.
    addImports({ name: 'usePigeon', from: resolver.resolve('./runtime/composables/usePigeon') })

    if (streaming) {
      addServerHandler({
        route: streamRoute,
        handler: resolver.resolve('./runtime/server/stream/route'),
      })
    }

    if (discord) {
      addServerImports({
        name: 'discord',
        from: resolver.resolve('./runtime/server/channels/discord/discord'),
      })
    }

    if (telegram) {
      addServerImports({
        name: 'telegram',
        from: resolver.resolve('./runtime/server/channels/telegram/telegram'),
      })

      if (telegramOptions.receive) {
        addServerHandler({
          route: telegramRoute,
          method: 'post',
          handler: resolver.resolve('./runtime/server/channels/telegram/route'),
        })

        if (nuxt.options.dev) {
          logger.warn(
            `telegram delivers to ${telegramRoute}, and it cannot reach localhost. ` +
              'Run with --tunnel and call telegram.setWebhook() with the tunnel address.',
          )
        }
      }
    }

    if (slack) {
      addServerImports({
        name: 'slack',
        from: resolver.resolve('./runtime/server/channels/slack/slack'),
      })

      if (slackOptions.receive) {
        addServerHandler({
          route: slackRoute,
          method: 'post',
          handler: resolver.resolve('./runtime/server/channels/slack/route'),
        })

        if (nuxt.options.dev) {
          logger.warn(
            `slack receives events at ${slackRoute}, and it has no polling. Run with ` +
              '--tunnel and enter the address under Event Subscriptions.',
          )
          // Cost five hours once. Slack verifies the url over HTTP either way, so the
          // setup looks finished while every event silently goes to a socket instead.
          logger.warn(
            'slack: if events never arrive, check that **Socket Mode is off**. With it ' +
              'on, Slack delivers to a websocket and the request url is only verified.',
          )
        }
      }
    }

    if (webhook.receive) {
      addServerHandler({
        route: webhook.route || DEFAULT_ROUTE,
        method: 'post',
        handler: resolver.resolve('./runtime/server/webhook/route'),
      })
    }
  },
})
