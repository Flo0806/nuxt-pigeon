export default defineNuxtConfig({
  modules: ['nuxt-pigeon'],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  nuxtPigeon: {
    channels: {
      // url comes from PIGEON_DISCORD_WEBHOOK_URL
      discord: true,
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
