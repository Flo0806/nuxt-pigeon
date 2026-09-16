import {
  setOverride,
  type CredentialsMode,
  type CredentialsSource,
  type Resolved,
} from './credentials'
import { isPolling, stopPolling } from './poller'

/**
 * The part of a channel that can be started and stopped. Only pollers have one:
 * Telegram and Slack receive on a route, which reads its secret per request and
 * needs no restart, and Discord, ntfy and the webhook only send.
 *
 * Registered by the receive plugin at startup. `configure()` then knows whether
 * there is anything to restart without the channel having to know about plugins.
 */
const RECEIVERS = Symbol.for('nuxt-pigeon:receivers')

type Store = Record<symbol, Map<string, () => void> | undefined>

function receivers(): Map<string, () => void> {
  const store = globalThis as Store

  return (store[RECEIVERS] ??= new Map())
}

export function registerReceiver(channel: string, start: () => void): void {
  receivers().set(channel, start)
}

/** Starts the receiver if there is one. Returns whether there was. */
export function startReceiver(channel: string): boolean {
  const start = receivers().get(channel)

  if (!start) {
    return false
  }

  start()

  return true
}

export function stopReceiver(channel: string): void {
  stopPolling(channel)
}

export interface ChannelStatus {
  /** Whether the receiver is polling right now. Always `false` for a channel without one. */
  running: boolean
  source: CredentialsSource
  /** Whether sending would work, as far as the credentials go. */
  configured: boolean
}

export interface LifecycleInput<T extends object> {
  channel: string
  mode: () => CredentialsMode
  /** The current view, after every source has had its say. */
  resolve: () => Resolved<T>
  /** Throws the channel's own sentence when something is missing. */
  assert: () => void
  /** Anything cached per account, like a session. Runs on every stop. */
  reset?: () => void
  warn?: (message: string) => void
}

/**
 * The four verbs every channel gets, built once here so they behave the same
 * everywhere: `configure` sets and (re)starts, `restart` keeps the values and drops
 * the state, `stop` is off, `status` says what is going on.
 *
 * "Drops the state" is the point. A poller starts over as if the process had just
 * booted, so the next round only marks where it is and nothing is replayed.
 */
export function defineLifecycle<T extends object>(input: LifecycleInput<T>) {
  const warn = input.warn ?? ((message: string) => console.warn(`[nuxt-pigeon] ${message}`))

  function stop(): void {
    stopReceiver(input.channel)
    input.reset?.()
  }

  function start(): void {
    input.assert()
    startReceiver(input.channel)
  }

  /**
   * Hands over new credentials and restarts on them. Without an argument it goes
   * back to the config and environment, which in `runtime` mode means off.
   */
  async function configure(values?: T): Promise<ChannelStatus> {
    const before = input.resolve()

    // The channel already ran on the environment, so this is a start for nothing.
    // Not an error, the values win either way, but the option that avoids it is
    // one line and worth knowing.
    if (values && input.mode() === 'static' && before.source === 'static') {
      warn(
        `${input.channel}.configure() replaces credentials from the config or ` +
          `environment. Set \`credentials: 'runtime'\` in the module options and the ` +
          'channel waits for this call instead of starting twice.',
      )
    }

    stop()
    setOverride(input.channel, values)

    const after = input.resolve()
    if (after.configured) {
      start()
    } else if (values) {
      // Something was handed over but it is not enough. Say what, not "false".
      input.assert()
    }

    return status()
  }

  /** Same credentials, fresh state. */
  async function restart(): Promise<ChannelStatus> {
    stop()
    start()

    return status()
  }

  function status(): ChannelStatus {
    const { source, configured } = input.resolve()

    return { running: isPolling(input.channel), source, configured }
  }

  return {
    configure,
    restart,
    stop: async (): Promise<ChannelStatus> => {
      stop()

      return status()
    },
    status,
  }
}
