const channels = { telegram, discord, slack, ntfy, mastodon, bluesky, webhook }

type Channel = keyof typeof channels

/**
 * The four verbs, driven from the card. `configure` with values is what a settings
 * page does after saving, `configure` without goes back to the environment, and the
 * two others are the "docker down, docker up" without the docker.
 *
 * Values arrive as a JSON object from a textarea. Fine here, this is the playground.
 */
export default defineEventHandler(async (event) => {
  const { channel, action, values } = await readBody<{
    channel: Channel
    action: 'configure' | 'reset' | 'restart' | 'stop'
    values?: Record<string, unknown>
  }>(event)

  const target = channels[channel]

  try {
    const status =
      action === 'configure'
        ? await target.configure(values as never)
        : action === 'reset'
          ? await target.configure()
          : action === 'restart'
            ? await target.restart()
            : await target.stop()

    return { ok: true as const, status }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
