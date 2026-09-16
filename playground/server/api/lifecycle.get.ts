/**
 * What every channel is running on right now. `source` is the interesting column:
 * `static` is the environment, `runtime` is a `configure()` call, `none` is neither.
 */
export default defineEventHandler(() => ({
  telegram: telegram.status(),
  discord: discord.status(),
  slack: slack.status(),
  ntfy: ntfy.status(),
  mastodon: mastodon.status(),
  bluesky: bluesky.status(),
  webhook: webhook.status(),
}))
