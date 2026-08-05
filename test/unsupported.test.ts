import { describe, it, expect } from 'vitest'
import { unsupported } from '../src/runtime/server/core/unsupported'

describe('unsupported', () => {
  it('names the channel, the verb and the reason, in that order', () => {
    const edit = unsupported('ntfy', 'edit', 'The publish API only publishes.')

    expect(edit).toThrow('ntfy cannot edit. The publish API only publishes.')
  })

  it('throws rather than returning something that looks like success', () => {
    // The whole point: a quiet no-op is worse than a loud refusal, because it
    // only shows up as a missing message somewhere else.
    expect(() => unsupported('slack', 'delete', 'No message id.')()).toThrow(Error)
  })

  it('builds the function without calling it, so wiring one up is free', () => {
    expect(typeof unsupported('a', 'b', 'c')).toBe('function')
  })
})
