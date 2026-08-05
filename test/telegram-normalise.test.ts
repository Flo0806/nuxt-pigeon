import { describe, it, expect } from 'vitest'
import { normalise } from '../src/runtime/server/channels/telegram/normalise'

const from = { id: 4711, username: 'flo', first_name: 'Florian' }

describe('normalise', () => {
  it('pulls text, sender and chat out of a message', () => {
    expect(
      normalise({
        update_id: 1,
        message: { message_id: 1, text: 'hallo', from, chat: { id: -100 } },
      }),
    ).toEqual({
      type: 'message',
      text: 'hallo',
      from: { id: '4711', name: 'flo' },
      conversation: '-100',
    })
  })

  it('falls back to the first name when there is no username', () => {
    const message = { message_id: 1, text: 'hallo', from: { id: 1, first_name: 'Florian' } }

    expect(normalise({ update_id: 1, message }).from).toEqual({ id: '1', name: 'Florian' })
  })

  it('reads the caption of a photo, which carries no text field', () => {
    expect(normalise({ update_id: 1, message: { message_id: 1, caption: 'ein Bild' } }).text).toBe(
      'ein Bild',
    )
  })

  it('handles an edit and a channel post the same way, but says which it was', () => {
    const edited = normalise({
      update_id: 1,
      edited_message: { message_id: 1, text: 'korrigiert' },
    })
    const channel = normalise({ update_id: 1, channel_post: { message_id: 1, text: 'im Kanal' } })

    expect(edited).toMatchObject({ type: 'edited_message', text: 'korrigiert' })
    expect(channel).toMatchObject({ type: 'channel_post', text: 'im Kanal' })
  })

  it('returns nothing for an update it does not know', () => {
    // Better empty than a wrong guess, the full update stays in raw either way.
    expect(normalise({ update_id: 1 })).toEqual({})
  })

  it('turns numeric ids into strings, they exceed the safe integer range', () => {
    const result = normalise({
      update_id: 1,
      message: { message_id: 1, from, chat: { id: -1002 } },
    })

    expect(result.from?.id).toBe('4711')
    expect(result.conversation).toBe('-1002')
  })
})
