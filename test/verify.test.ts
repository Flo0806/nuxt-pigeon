import { describe, it, expect } from 'vitest'
import { safeEqual } from '../src/runtime/server/core/verify'

describe('safeEqual', () => {
  it('accepts identical values', () => {
    expect(safeEqual('geheim', 'geheim')).toBe(true)
  })

  it('rejects a different value of the same length', () => {
    expect(safeEqual('geheim', 'geheiN')).toBe(false)
  })

  it('rejects a different length', () => {
    expect(safeEqual('geheim', 'geheim2')).toBe(false)
  })

  it('rejects an empty value against a real secret', () => {
    // The header being absent must never pass as a match.
    expect(safeEqual('', 'geheim')).toBe(false)
  })

  it('accepts two empty values, the caller decides whether that is allowed', () => {
    expect(safeEqual('', '')).toBe(true)
  })
})
