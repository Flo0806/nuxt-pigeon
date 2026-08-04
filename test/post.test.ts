import { describe, it, expect } from 'vitest'
import { mergeHeaders, serialise, signature, targetName } from '../src/runtime/server/core/post'

describe('serialise', () => {
  it('turns a plain object into json and says so', () => {
    expect(serialise({ text: 'hi' })).toEqual({
      body: '{"text":"hi"}',
      contentType: 'application/json',
    })
  })

  it('sends a string as text, not as json', () => {
    // ofetch would label this application/json, which lies about a plain text body.
    expect(serialise('hi')).toEqual({ body: 'hi', contentType: 'text/plain;charset=UTF-8' })
  })

  it('leaves URLSearchParams alone, which is how form encoded receivers are reached', () => {
    const params = new URLSearchParams({ value1: 'hi' })
    expect(serialise(params)).toEqual({ body: params })
  })

  it('leaves FormData and binary alone', () => {
    const form = new FormData()
    const bytes = new Uint8Array([1, 2, 3])

    expect(serialise(form)).toEqual({ body: form })
    expect(serialise(bytes)).toEqual({ body: bytes })
  })

  it('serialises arrays, a receiver may want a list at the top level', () => {
    expect(serialise([1, 2]).body).toBe('[1,2]')
  })
})

describe('mergeHeaders', () => {
  it('lets the later source win', () => {
    expect(mergeHeaders({ a: '1' }, { a: '2' })).toEqual({ a: '2' })
  })

  it('matches case insensitively, because http headers are', () => {
    // Without this the request would carry both spellings.
    expect(
      mergeHeaders({ 'Content-Type': 'application/json' }, { 'content-type': 'text/csv' }),
    ).toEqual({ 'content-type': 'text/csv' })
  })

  it('removes a header set to an empty value instead of sending it blank', () => {
    expect(mergeHeaders({ 'Content-Type': 'application/json' }, { 'Content-Type': '' })).toEqual({})
  })

  it('ignores sources that are not there', () => {
    expect(mergeHeaders(undefined, { a: '1' }, undefined)).toEqual({ a: '1' })
  })
})

describe('targetName', () => {
  const discord = 'https://discord.com/api/webhooks/1534079055/YHJ31FgWHcy7N_DjAeyttw9tut'

  it('uses the label when there is one', () => {
    expect(targetName(discord, 'Discord')).toBe('Discord')
  })

  it('shows the host but never the path, which is the credential', () => {
    expect(targetName(discord)).toBe('discord.com')
    expect(targetName(discord)).not.toContain('YHJ31FgW')
  })

  it('drops query strings too', () => {
    expect(targetName('https://example.com/hook?token=GEHEIM')).toBe('example.com')
  })

  it('says something useful even for an unparsable url', () => {
    expect(targetName('kaputt')).toBe('url')
  })
})

describe('signature', () => {
  const ID = 'msg_123'
  const TIMESTAMP = '1700000000'
  const BODY = '{"text":"hi"}'

  it('produces the Standard Webhooks format', async () => {
    expect(await signature('geheim', ID, TIMESTAMP, BODY)).toMatch(/^v1,[A-Za-z0-9+/]+=*$/)
  })

  it('changes when any part changes', async () => {
    const base = await signature('geheim', ID, TIMESTAMP, BODY)

    expect(await signature('geheim', 'msg_other', TIMESTAMP, BODY)).not.toBe(base)
    expect(await signature('geheim', ID, '1700000001', BODY)).not.toBe(base)
    expect(await signature('geheim', ID, TIMESTAMP, '{"text":"ho"}')).not.toBe(base)
    expect(await signature('anderes', ID, TIMESTAMP, BODY)).not.toBe(base)
  })

  it('treats a whsec_ secret as base64 bytes, not as its characters', async () => {
    // Comparing the characters instead would silently produce a different key.
    const asBytes = await signature(`whsec_${btoa('abc')}`, ID, TIMESTAMP, BODY)
    const asText = await signature(`whsec_${btoa('abc')}`.slice(6), ID, TIMESTAMP, BODY)

    expect(asBytes).not.toBe(asText)
  })
})
