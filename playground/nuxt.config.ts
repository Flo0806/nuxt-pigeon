export default defineNuxtConfig({
  modules: ['nuxt-pigeon'],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  nuxtPigeon: {
    webhook: {
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
