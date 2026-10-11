// Every server file reads its config through `#pigeon/config`, so this is the one place
// that knows which server API it runs on. The Nitro v2 twin is `config.legacy.ts`.
export { useRuntimeConfig } from 'nuxt/server'
