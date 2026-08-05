export default defineNuxtConfig({
  modules: ['nuxt-pigeon'],
  devtools: { enabled: true },
  css: ['~/assets/pigeon.css'],
  compatibilityDate: 'latest',
  nuxtPigeon: {
    channels: {
      // url comes from PIGEON_DISCORD_WEBHOOK_URL
      discord: true,
      // token and chat id come from PIGEON_TELEGRAM_*
      telegram: { receive: true },
      // url comes from PIGEON_SLACK_WEBHOOK_URL
      slack: { receive: true },
      // server defaults to ntfy.sh, topic comes from PIGEON_NTFY_TOPIC
      ntfy: true,
      // token comes from PIGEON_MASTODON_TOKEN
      mastodon: { instance: 'https://mastodon.social', receive: true },
      // identifier and app password come from PIGEON_BLUESKY_*
      bluesky: { receive: true },
    },
    webhook: {
      // Registers POST /api/_pigeon/webhook
      receive: true,
      // Everything a receiver needs, in the config. Secrets stay in .env.
      endpoints: {
        // A url in the config, because httpbingo is no secret.
        chat: { url: 'https://httpbingo.org/post' },
        // No url here, this one comes from PIGEON_WEBHOOK_N8N_URL.
        n8n: { headers: { 'X-Demo': 'automation' } },
      },
    },
  },
})
