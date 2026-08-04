export default defineEventHandler(async (event) => {
  const { action, baseUrl } = await readBody<{ action: string; baseUrl: string }>(event)

  try {
    if (action === 'set') {
      await telegram.setWebhook(baseUrl)
    } else if (action === 'delete') {
      await telegram.deleteWebhook()
    }

    return { ok: true as const, info: await telegram.webhookInfo() }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
