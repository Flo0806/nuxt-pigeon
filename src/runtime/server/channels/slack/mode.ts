/**
 * Slack is the only channel here with two ways in, and they are not two flavours of
 * the same thing: an incoming webhook is a url with a channel baked into it, a bot
 * token is a credential that needs the channel named on every call.
 *
 * Everything that follows from that choice is decided here, once, and tested without
 * a network.
 */
export interface SlackCredentials {
  webhookUrl?: string
  botToken?: string
  /** Default channel id for the bot token. Every call can name another. */
  channel?: string
  /** What the route checks incoming events against. Needed to receive, not to send. */
  signingSecret?: string
}

export type SlackMode = 'bot' | 'webhook'

/**
 * The bot token wins when both are set, because it can do strictly more. It is never
 * a silent fallback though: someone who sets a token wants an id back, and dropping
 * to the webhook would quietly hand them a message they cannot touch again.
 */
export function chooseMode(credentials: SlackCredentials, channel?: string): SlackMode {
  const { webhookUrl, botToken } = credentials

  if (botToken) {
    if (!channel && !credentials.channel) {
      throw new Error(
        'Slack has a bot token but no channel. `chat.postMessage` needs one per message, ' +
          'unlike an incoming webhook, which has its channel baked in. Set ' +
          'PIGEON_SLACK_CHANNEL to a channel id like C01ABC2DEF, or pass { channel } ' +
          'per call.',
      )
    }

    return 'bot'
  }

  if (!webhookUrl) {
    throw new Error(
      'Slack is not configured. Set PIGEON_SLACK_BOT_TOKEN for the full set of ' +
        'features, or PIGEON_SLACK_WEBHOOK_URL to only send.',
    )
  }

  return 'webhook'
}

/** Reads better than repeating the sentence at three call sites. */
export function requireBot(credentials: SlackCredentials, verb: string): string {
  if (!credentials.botToken) {
    throw new Error(
      `slack cannot ${verb} through an incoming webhook: it answers with the plain text ` +
        '`ok` and gives no message id, so there is nothing to address. Set ' +
        'PIGEON_SLACK_BOT_TOKEN, and give the app the `chat:write` scope.',
    )
  }

  return credentials.botToken
}

/**
 * The Web API answers **200 even when it failed** and puts the reason in the body, so
 * the status tells us nothing. A missing scope would otherwise pass for success and
 * show up as a message that never arrived.
 */
export function assertOk(method: string, body: unknown): void {
  const answer = body as { ok?: boolean; error?: string; needed?: string } | undefined

  if (answer?.ok) {
    return
  }

  const reason = answer?.error ?? 'unknown error'
  const needed = answer?.needed ? `, needs the scope \`${answer.needed}\`` : ''

  throw new Error(`Slack ${method} failed: ${reason}${needed}`)
}
