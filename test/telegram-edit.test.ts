import { describe, it, expect } from 'vitest'
import {
  assertNoMediaRemoval,
  buildEditMedia,
  editMethod,
  messageKind,
} from '../src/runtime/server/channels/telegram/edit'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('messageKind', () => {
  it('is text for a message with words and nothing else', () => {
    expect(messageKind({ message_id: 1, text: 'hallo' })).toBe('text')
  })

  it('is media as soon as a file is on it, whatever the file is', () => {
    expect(messageKind({ message_id: 1, photo: [{}], caption: 'da' })).toBe('media')
    expect(messageKind({ message_id: 1, document: {} })).toBe('media')
    expect(messageKind({ message_id: 1, video_note: {} })).toBe('media')
  })

  it('is text when there is nothing to look at, which is the safer guess', () => {
    // Only editMessageText can then still work, editMessageCaption would fail.
    expect(messageKind(undefined)).toBe('text')
  })
})

describe('editMethod', () => {
  it('changes the text of a text message', () => {
    expect(editMethod({ text: 'neu', kind: 'text' })).toBe('editMessageText')
  })

  it('changes the caption when the words live under a picture', () => {
    expect(editMethod({ text: 'neu', kind: 'media' })).toBe('editMessageCaption')
  })

  it('replaces the file when one is passed', () => {
    expect(editMethod({ text: 'neu', media: [{}], kind: 'media' })).toBe('editMessageMedia')
  })

  it('adds a file to a message that was text only, which Bot API 7.11 allows', () => {
    expect(editMethod({ text: 'neu', media: [{}], kind: 'text' })).toBe('editMessageMedia')
  })

  it('touches only the buttons when no new words are given', () => {
    expect(editMethod({ kind: 'text' })).toBe('editMessageReplyMarkup')
    expect(editMethod({ kind: 'media' })).toBe('editMessageReplyMarkup')
  })

  it('treats an empty string as words, because clearing a caption is a real wish', () => {
    expect(editMethod({ text: '', kind: 'media' })).toBe('editMessageCaption')
  })
})

describe('assertNoMediaRemoval', () => {
  it('refuses an empty media, which elsewhere means away with the picture', () => {
    // Without this the call falls through to a caption edit and the picture stays,
    // which looks like success and is not.
    expect(() => assertNoMediaRemoval([])).toThrow('cannot remove media')
  })

  it('says nothing when media is left out or actually holds something', () => {
    expect(() => assertNoMediaRemoval(undefined)).not.toThrow()
    expect(() => assertNoMediaRemoval([{}])).not.toThrow()
  })
})

describe('buildEditMedia', () => {
  it('hands a url straight over, Telegram fetches it itself', async () => {
    const body = await buildEditMedia(
      { url: 'https://example.com/a.png' },
      { chat_id: 7, message_id: 42 },
      { caption: 'neu' },
    )

    expect(body).toEqual({
      chat_id: 7,
      message_id: 42,
      // The caption sits **inside** the descriptor here, unlike when sending.
      media: { type: 'photo', media: 'https://example.com/a.png', caption: 'neu' },
    })
  })

  it('sends bytes as multipart with the descriptor pointing at the part', async () => {
    const body = await buildEditMedia({ data: PNG }, { chat_id: 7, message_id: 42 }, {})

    expect(body).toBeInstanceOf(FormData)

    const form = body as FormData
    expect(JSON.parse(String(form.get('media')))).toEqual({
      type: 'photo',
      media: 'attach://file0',
    })
    expect(form.get('file0')).toBeInstanceOf(Blob)
    expect(form.get('chat_id')).toBe('7')
  })
})
