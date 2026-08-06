/**
 * Which of the two modes Slack is in. Answers with **booleans, never values**: whether
 * a token exists is useful on a page, the token itself has no business there.
 */
export default defineEventHandler(() => {
  const config = useRuntimeConfig().pigeon.channels.slack

  const botToken = Boolean(config.botToken || process.env.PIGEON_SLACK_BOT_TOKEN)
  const webhookUrl = Boolean(config.webhookUrl || process.env.PIGEON_SLACK_WEBHOOK_URL)
  const channel = config.channel || process.env.PIGEON_SLACK_CHANNEL || ''

  return {
    // A channel id is not a secret, and without it the bot mode cannot send at all.
    channel,
    botToken,
    webhookUrl,
    mode: botToken ? ('bot' as const) : webhookUrl ? ('webhook' as const) : ('none' as const),
    // Where Slack has to deliver its events. The default, which the playground uses.
    route: '/api/_pigeon/slack',
  }
})
