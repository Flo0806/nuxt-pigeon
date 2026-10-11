import { expect, it } from 'vitest'
import { fetch } from '@nuxt/test-utils/e2e'

export const TELEGRAM_SECRET = 'test-secret'

/**
 * The server routes, end to end. Shared by the Nuxt 4 and Nuxt 5 suites, so both prove the
 * same behaviour: Nuxt 4 serves the `.legacy` files, Nuxt 5 the `nuxt/server` and nitro v3 ones.
 */
export function serverCases() {
  it('accepts a webhook delivery', async () => {
    const res = await fetch('/api/_pigeon/webhook', { method: 'POST', body: '{"text":"hi"}' })
    expect(res.status).toBe(202)
  })

  it('refuses an empty webhook delivery', async () => {
    const res = await fetch('/api/_pigeon/webhook', { method: 'POST', body: '' })
    expect(res.status).toBe(400)
  })

  it('refuses a telegram update without the secret', async () => {
    const res = await fetch('/api/_pigeon/telegram', { method: 'POST', body: '{}' })
    expect(res.status).toBe(401)
  })

  it('accepts a telegram update with the secret', async () => {
    const res = await fetch('/api/_pigeon/telegram', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': TELEGRAM_SECRET },
      body: JSON.stringify({
        update_id: 1,
        message: { message_id: 1, date: 0, chat: { id: 1, type: 'private' }, text: 'hi' },
      }),
    })
    expect(res.status).toBe(200)
  })

  it('streams a delivery to the browser', async () => {
    // Some runtimes send the headers only with the first message, so the stream request is
    // not awaited before delivering. Deliver until one arrives: the listener registers
    // when the stream request reaches the route, which the test cannot observe.
    const streaming = fetch('/api/_pigeon/stream')
    const deliver = setInterval(() => {
      fetch('/api/_pigeon/webhook', { method: 'POST', body: '{"text":"streamed"}' })
    }, 200)

    try {
      const stream = await streaming
      expect(stream.headers.get('content-type')).toContain('text/event-stream')

      // The message reaches the stream after the response, through `waitUntil`.
      const reader = stream.body!.getReader()
      const decoder = new TextDecoder()
      let received = ''
      while (!received.includes('streamed')) {
        const { value, done } = await reader.read()
        if (done) break
        received += decoder.decode(value)
      }
      await reader.cancel()

      expect(received).toMatch(/^data: .*"channel":"webhook"/m)
      expect(received).toContain('streamed')
    } finally {
      clearInterval(deliver)
    }
  })
}
