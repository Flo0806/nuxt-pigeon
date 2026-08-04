import { createRequest } from '../../../src/runtime/request'

/**
 * Layer 0 on its own. Sends one request to httpbingo and reports how long it took,
 * so the retries are visible without any counter inside the transport.
 */
export default defineEventHandler(async (event) => {
  const { status, retries, retryDelayMs } = await readBody<{
    status: number
    retries: number
    retryDelayMs: number
  }>(event)

  const request = createRequest({ retries, retryDelayMs })
  const started = Date.now()

  try {
    await request(`https://httpbingo.org/status/${status}`)

    return { ok: true as const, status, elapsedMs: Date.now() - started }
  } catch (error) {
    return {
      ok: false as const,
      status: (error as { status?: number }).status ?? null,
      elapsedMs: Date.now() - started,
      error: (error as Error).message,
    }
  }
})
