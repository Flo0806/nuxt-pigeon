// Every server file reads its config through `#pigeon/config`, so this is the one place
// that knows which server API it runs on. The Nitro v2 twin lives in `legacy/core/config`.
export { useRuntimeConfig } from 'nuxt/server'
