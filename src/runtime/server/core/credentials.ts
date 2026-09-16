/**
 * Where a channel's credentials come from, and the one place that decides between
 * them.
 *
 * Two modes, chosen per channel in the module config:
 *
 * - `static`: the config and the environment, read at startup. The default, and the
 *   only thing there was before `configure()` existed
 * - `runtime`: nothing until `channel.configure(...)` hands the values over, typically
 *   from a database. The environment is ignored on purpose, so a leftover variable
 *   cannot start the channel with the wrong account before the real values arrive
 *
 * `configure()` works in both modes. In `static` it replaces what the environment
 * said, which restarts the channel once for nothing, so it warns and points at the
 * option that avoids it.
 */
export type CredentialsMode = 'static' | 'runtime'

/** What a channel is running on right now. `none` means it is not configured. */
export type CredentialsSource = 'static' | 'runtime' | 'none'

/** Survives HMR, like every other store: a reload must not lose the database values. */
const OVERRIDES = Symbol.for('nuxt-pigeon:credentials')
const WARNED = Symbol.for('nuxt-pigeon:credentials-warned')

type Store = Record<symbol, Map<string, unknown> | Set<string> | undefined>

function overrides(): Map<string, unknown> {
  const store = globalThis as Store

  return ((store[OVERRIDES] as Map<string, unknown> | undefined) ??= new Map())
}

function warned(): Set<string> {
  const store = globalThis as Store

  return ((store[WARNED] as Set<string> | undefined) ??= new Set())
}

export function getOverride<T>(channel: string): T | undefined {
  return overrides().get(channel) as T | undefined
}

/** `undefined` clears, which is how `configure()` with no argument goes back. */
export function setOverride<T>(channel: string, values: T | undefined): void {
  if (values === undefined) {
    overrides().delete(channel)
  } else {
    overrides().set(channel, values)
  }
}

/** Only for tests, so one case cannot leak its warning into the next. */
export function forgetWarnings(): void {
  warned().clear()
}

/** An empty `headers: {}` from the config placeholder is not a credential either. */
function present(value: unknown): boolean {
  if (value === undefined || value === null || value === '') {
    return false
  }

  return typeof value !== 'object' || Object.keys(value).length > 0
}

export interface ResolveInput<T extends object> {
  channel: string
  mode: CredentialsMode
  /** Config and environment already merged, with `''` or `undefined` where nothing is set. */
  static: T
  /** What `configure()` handed over, if anything. */
  override: Partial<T> | undefined
  /** Whether a set of values is enough to work with. Slack needs one of two, most need all. */
  configured: (values: Partial<T>) => boolean
  /** Injectable for tests. Defaults to the console. */
  warn?: (message: string) => void
}

export interface Resolved<T extends object> {
  values: Partial<T>
  source: CredentialsSource
  configured: boolean
}

/**
 * Merges the sources by the rules above. Pure apart from the warning, which fires
 * once per channel and process: it is meant to be read, not to fill the log.
 */
export function resolveCredentials<T extends object>(input: ResolveInput<T>): Resolved<T> {
  const warn = input.warn ?? ((message: string) => console.warn(`[nuxt-pigeon] ${message}`))
  const staticValues = input.static as Record<string, unknown>
  const staticHasAny = Object.values(staticValues).some(present)

  if (input.override) {
    const override = input.override as Record<string, unknown>
    // `runtime` takes the override as the whole truth. `static` fills the gaps from the
    // environment, so a call can replace only the token and keep the rest.
    const values =
      input.mode === 'runtime'
        ? { ...override }
        : Object.fromEntries(
            Object.keys({ ...staticValues, ...override }).map((key) => [
              key,
              present(override[key]) ? override[key] : staticValues[key],
            ]),
          )

    return {
      values: values as Partial<T>,
      source: 'runtime',
      configured: input.configured(values as Partial<T>),
    }
  }

  if (input.mode === 'runtime') {
    if (staticHasAny && !warned().has(input.channel)) {
      warned().add(input.channel)
      warn(
        `${input.channel}: credentials are set in the config or environment, but ` +
          `\`credentials: 'runtime'\` ignores them. Call ${input.channel}.configure() ` +
          'to start the channel, or drop the option to use them.',
      )
    }

    return { values: {}, source: 'none', configured: false }
  }

  const configured = input.configured(input.static)

  return { values: input.static, source: configured ? 'static' : 'none', configured }
}

/**
 * The sentence for "you cannot send yet", worded for the mode: in `static` the fix is
 * an environment variable, in `runtime` it is a call.
 */
export function notConfigured(
  channel: string,
  mode: CredentialsMode,
  what: string,
  env: string,
  field: string,
): Error {
  return new Error(
    mode === 'runtime'
      ? `${what} is not defined. \`credentials: 'runtime'\` is set, so call ` +
          `${channel}.configure({ ${field} }) before the first use`
      : `${what} is not defined. Set ${env} or pass it to ${channel}.configure({ ${field} })`,
  )
}
