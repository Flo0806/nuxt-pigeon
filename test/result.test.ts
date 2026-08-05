import { describe, it, expect } from 'vitest'
import { headersToObject, toResult } from '../src/runtime/server/core/result'

describe('headersToObject', () => {
  it('lower cases the names, because HTTP does not care about the case', () => {
    const headers = new Headers({
      'X-RateLimit-Remaining': '4',
      'Content-Type': 'application/json',
    })

    expect(headersToObject(headers)).toEqual({
      'x-ratelimit-remaining': '4',
      'content-type': 'application/json',
    })
  })

  it('joins a repeated name instead of losing one of them', () => {
    const headers = new Headers()
    headers.append('link', '<https://a>; rel="next"')
    headers.append('link', '<https://b>; rel="prev"')

    expect(headersToObject(headers).link).toBe('<https://a>; rel="next", <https://b>; rel="prev"')
  })

  it('is empty for an answer without headers, never undefined', () => {
    expect(headersToObject(new Headers())).toEqual({})
  })
})

describe('toResult', () => {
  it('keeps the body untouched and puts status and headers beside it', () => {
    const result = toResult('mastodon', {
      status: 200,
      headers: new Headers({ 'X-RateLimit-Remaining': '299' }),
      _data: { id: '42', content: '<p>hi</p>' },
    })

    expect(result).toEqual({
      channel: 'mastodon',
      raw: { id: '42', content: '<p>hi</p>' },
      response: { status: 200, headers: { 'x-ratelimit-remaining': '299' } },
    })
  })

  it('carries an answer that is only a string, which is all Slack sends', () => {
    const result = toResult('slack', { status: 200, headers: new Headers(), _data: 'ok' })

    expect(result.raw).toBe('ok')
    expect(result.response.status).toBe(200)
  })

  it('leaves raw undefined for an empty answer instead of inventing one', () => {
    // Discord with wait: false answers 204 and no body at all.
    const result = toResult('discord', { status: 204, headers: new Headers() })

    expect(result.raw).toBeUndefined()
    expect(result.response.status).toBe(204)
  })

  it('adds no id or url on its own, the channel knows where those sit', () => {
    const result = toResult('discord', { status: 200, headers: new Headers(), _data: { id: '7' } })

    expect(result.id).toBeUndefined()
    expect(result.url).toBeUndefined()
  })
})
