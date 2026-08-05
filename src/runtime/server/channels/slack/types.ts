/**
 * The fields worth knowing about, the rest stays reachable through the index
 * signature. Slack documents every event and its shape at
 * https://api.slack.com/events
 */
export interface SlackEvent {
  /** `message`, `app_mention`, `reaction_added` and so on. */
  type?: string
  /** `bot_message`, `message_changed`, `channel_join` and friends. */
  subtype?: string
  text?: string
  /** The user id, never a name. Resolve it through `users.info` if you need one. */
  user?: string
  /** Channel, group or DM id. */
  channel?: string
  /**
   * Identifies the message itself and doubles as its timestamp. **The same for
   * every delivery of the same message**, so it works as a deduplication key.
   */
  ts?: string
  /** Set when the message belongs to a thread. */
  thread_ts?: string
  /** A uuid Slack gives a message a human typed. Same across deliveries. */
  client_msg_id?: string
  /** Set when a bot wrote it, which is how you avoid answering yourself. */
  bot_id?: string
  [key: string]: unknown
}

/**
 * What Slack POSTs to the events route. See
 * https://api.slack.com/apis/events-api#receiving-events
 */
/**
 * What the Web API answers with. It is **not** an error when `ok` is false and the
 * status is still 200, which is why `assertOk` exists.
 */
export interface SlackMessage {
  ok?: boolean
  error?: string
  /** Doubles as the message id, and as the sort key in a thread. */
  ts?: string
  /** The id it actually landed in, which is not always the one that was asked for. */
  channel?: string
  message?: { text?: string; blocks?: unknown[]; [key: string]: unknown }
  [key: string]: unknown
}

export interface SlackEnvelope {
  /** `event_callback` for a real event, `url_verification` only during setup. */
  type: string
  /** Unique per **delivery**, so two subscriptions for one message differ here. */
  event_id?: string
  event_time?: number
  team_id?: string
  /** The app id, useful when several apps share an endpoint. */
  api_app_id?: string
  event?: SlackEvent
  [key: string]: unknown
}

/**
 * Set when Slack redelivers something it considered failed. Not a second
 * subscription, the very same event arriving twice.
 */
export interface SlackHeaders {
  'x-slack-retry-num'?: string
  'x-slack-retry-reason'?: string
  'x-slack-signature'?: string
  'x-slack-request-timestamp'?: string
}
