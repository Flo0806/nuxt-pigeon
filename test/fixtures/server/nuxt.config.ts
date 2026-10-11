import pigeon from '../../../src/module.ts'

// The server side every Nuxt version has to serve the same way. `server-v5` extends it.
export default defineNuxtConfig({
  modules: [pigeon],
  nuxtPigeon: {
    channels: {
      telegram: { receive: true },
    },
    webhook: { receive: true },
    stream: { enabled: true },
  },
})
