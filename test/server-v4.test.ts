import { fileURLToPath } from 'node:url'
import { describe } from 'vitest'
import { setup } from '@nuxt/test-utils/e2e'
import { serverCases, TELEGRAM_SECRET } from './server-cases'

process.env.PIGEON_TELEGRAM_SECRET_TOKEN = TELEGRAM_SECRET

describe('server routes on nuxt 4', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/server', import.meta.url)),
    build: true,
    setupTimeout: 300_000,
  })

  serverCases()
})
