import { createRequest } from '../../core/request'

/** Survives HMR: `createSession` is rate limited, a reload must not log in again. */
const SESSION = Symbol.for('nuxt-pigeon:bluesky-session')

export interface Session {
  accessJwt: string
  refreshJwt: string
  did: string
  handle: string
}

type Store = Record<symbol, Session | undefined>

function stored(): Session | undefined {
  return (globalThis as Store)[SESSION]
}

function store(session: Session | undefined) {
  ;(globalThis as Store)[SESSION] = session
}

async function createSession(service: string, identifier: string, password: string) {
  const session = await createRequest()<Session>(
    new URL('/xrpc/com.atproto.server.createSession', service).toString(),
    { method: 'POST', body: { identifier, password } },
  )

  store(session)

  return session
}

/**
 * The access token lasts about two hours, the refresh token far longer. Refreshing
 * costs one request, logging in again costs a rate limited one, so the refresh is
 * tried first and a full login is the fallback.
 */
async function refresh(service: string, session: Session) {
  const refreshed = await createRequest()<Session>(
    new URL('/xrpc/com.atproto.server.refreshSession', service).toString(),
    { method: 'POST', headers: { Authorization: `Bearer ${session.refreshJwt}` } },
  )

  store(refreshed)

  return refreshed
}

/**
 * Runs `use` with a valid token, and retries once with a fresh one when the token
 * turned out to be expired. Bluesky answers that with 400 and `ExpiredToken`, not
 * with a 401, so the status alone is not enough to recognise it.
 */
export async function withSession<T>(
  service: string,
  identifier: string,
  password: string,
  use: (session: Session) => Promise<T>,
): Promise<T> {
  const session = stored() ?? (await createSession(service, identifier, password))

  try {
    return await use(session)
  } catch (error) {
    if (!expired(error)) {
      throw error
    }

    try {
      return await use(await refresh(service, session))
    } catch {
      // The refresh token can be revoked or too old as well, then only a new login
      // helps. Deliberately last, because it is the rate limited path.
      store(undefined)

      return use(await createSession(service, identifier, password))
    }
  }
}

function expired(error: unknown): boolean {
  const data = (error as { data?: { error?: string } }).data

  return data?.error === 'ExpiredToken' || data?.error === 'InvalidToken'
}

/** Only for tests and for `pigeon doctor` later. */
export function forgetSession(): void {
  store(undefined)
}
