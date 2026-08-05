import {
  addImports,
  addServerHandler,
  addServerImports,
  addServerPlugin,
  createResolver,
  defineNuxtModule,
  useLogger,
} from '@nuxt/kit'

/** Prefixed so they cannot collide with a route the user wrote. */
const DEFAULT_ROUTE = '/api/_pigeon/webhook'
const DEFAULT_STREAM_ROUTE = '/api/_pigeon/stream'
const DEFAULT_TELEGRAM_ROUTE = '/api/_pigeon/telegram'
const DEFAULT_SLACK_ROUTE = '/api/_pigeon/slack'

/** Generous against Mastodon's 300 requests per five minutes. */
const DEFAULT_POLL_MS = 30_000

/** No long running process, so a poller would start per request and never finish. */
const SERVERLESS_PRESET = /^(cloudflare|vercel|netlify|deno|edge)/

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
   * Falls back to `PIGEON_SLACK_BOT_TOKEN`, an `xoxb-` token. **Set it and Slack can
   * do everything the other channels can**: pick a channel per message, reply in a
   * thread, edit, delete. Without it only the incoming webhook is available, which
   * answers `ok` and gives no message id.
   *
   * The app that already receives your events has one, under OAuth & Permissions.
   * Scopes: `chat:write`, plus `chat:write.public` to post without being invited.
   */
  botToken?: string
  /**
   * Default destination for the bot token, a channel **id** like `C01ABC2DEF`, not a
   * name. Falls back to `PIGEON_SLACK_CHANNEL`, and every call can override it.
   */
  channel?: string
  /**
   * Registers the Events API route. Slack has no polling, so this needs a publicly
   * reachable address even in development.
   */
  receive?: boolean
  route?: string
}

export interface NtfyOptions {
  /** Defaults to `https://ntfy.sh`. Point it at your own instance if you run one. */
  server?: string
  /** Falls back to `PIGEON_NTFY_TOPIC`. **A public topic is readable by anyone who
   * knows its name**, so pick something unguessable or protect it with a token. */
  topic?: string
}

export interface MastodonOptions {
  /** Required, there is no sensible default. Form `https://mastodon.social`. */
  instance?: string
  /**
   * Polls for notifications. Mastodon has no webhook for your own account, so this
   * needs a **long running process**: it does not work on serverless presets.
   */
  receive?: boolean
  /** Rate limit is 300 requests per five minutes, so this is generous. */
  intervalMs?: number
}

export interface BlueskyOptions {
  /** Defaults to `https://bsky.social`. Your own PDS if you run one. */
  service?: string
  /** Falls back to `PIGEON_BLUESKY_IDENTIFIER`, the handle or email. */
  identifier?: string
  /**
   * Polls for notifications. Bluesky has no webhook, so this needs a **long running
   * process**: it does not work on serverless presets.
   */
  receive?: boolean
  intervalMs?: number
}

export interface ChannelOptions {
  discord?: boolean | DiscordOptions
  telegram?: boolean | TelegramOptions
  slack?: boolean | SlackOptions
  ntfy?: boolean | NtfyOptions
  mastodon?: boolean | MastodonOptions
  bluesky?: boolean | BlueskyOptions
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
        slack: { webhookUrl: string; signingSecret: string; botToken: string; channel: string }
        ntfy: { server: string; topic: string; token: string }
        mastodon: { instance: string; token: string; intervalMs: number }
        bluesky: {
          service: string
          identifier: string
          password: string
          intervalMs: number
        }
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
    const ntfy = options.channels?.ntfy
    const ntfyOptions = typeof ntfy === 'object' ? ntfy : {}
    const mastodon = options.channels?.mastodon
    const mastodonOptions = typeof mastodon === 'object' ? mastodon : {}
    const bluesky = options.channels?.bluesky
    const blueskyOptions = typeof bluesky === 'object' ? bluesky : {}
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
        slack: {
          webhookUrl: slackOptions.webhookUrl || '',
          signingSecret: '',
          botToken: slackOptions.botToken || '',
          channel: slackOptions.channel || '',
        },
        ntfy: { server: ntfyOptions.server || '', topic: ntfyOptions.topic || '', token: '' },
        mastodon: {
          instance: mastodonOptions.instance || '',
          token: '',
          intervalMs: mastodonOptions.intervalMs ?? DEFAULT_POLL_MS,
        },
        bluesky: {
          service: blueskyOptions.service || '',
          identifier: blueskyOptions.identifier || '',
          // The app password never belongs in a config file, only the placeholder.
          password: '',
          intervalMs: blueskyOptions.intervalMs ?? DEFAULT_POLL_MS,
        },
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

    if (ntfy) {
      addServerImports({
        name: 'ntfy',
        from: resolver.resolve('./runtime/server/channels/ntfy/ntfy'),
      })
    }

    if (mastodon) {
      addServerImports({
        name: 'mastodon',
        from: resolver.resolve('./runtime/server/channels/mastodon/mastodon'),
      })
      logger.info('mastodon posts publicly, it uses post() not send()')

      if (mastodonOptions.receive) {
        addServerPlugin(resolver.resolve('./runtime/server/channels/mastodon/plugin'))

        const preset = nuxt.options.nitro.preset
        if (preset && SERVERLESS_PRESET.test(preset)) {
          logger.warn(
            `mastodon can only be polled, and preset "${preset}" has no long running ` +
              'process. Nothing will be received there.',
          )
        }
      }
    }

    if (bluesky) {
      addServerImports({
        name: 'bluesky',
        from: resolver.resolve('./runtime/server/channels/bluesky/bluesky'),
      })
      logger.info('bluesky posts publicly, it uses post() not send()')

      if (blueskyOptions.receive) {
        addServerPlugin(resolver.resolve('./runtime/server/channels/bluesky/plugin'))

        const preset = nuxt.options.nitro.preset
        if (preset && SERVERLESS_PRESET.test(preset)) {
          logger.warn(
            `bluesky can only be polled, and preset "${preset}" has no long running ` +
              'process. Nothing will be received there.',
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
