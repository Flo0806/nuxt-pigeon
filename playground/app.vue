<script setup lang="ts">
import { countCharacters } from '../src/runtime/server/channels/mastodon/format'
import {
  byteLength,
  detectRanges,
  graphemeLength,
} from '../src/runtime/server/channels/bluesky/format'

interface Probe {
  ok: boolean
  status: number | null
  elapsedMs: number
  error?: string
}

const status = ref(500)
const retries = ref(2)
const retryDelayMs = ref(500)
const pending = ref(false)
const result = ref<Probe | null>(null)

/** What the transport should do, so the measurement can be checked against it. */
const expected = computed(() => {
  if (status.value < 400) return '1 attempt, no waiting'
  if (![408, 409, 425, 429].includes(status.value) && status.value < 500) {
    return '1 attempt, this status is not worth retrying'
  }

  const waits = Array.from({ length: retries.value }, (_, i) => retryDelayMs.value * 2 ** i)
  const total = waits.reduce((sum, ms) => sum + ms, 0)

  return `${retries.value + 1} attempts, waiting ${waits.join(' + ') || '0'} = ${total}ms`
})

interface Mirror {
  ok: boolean
  mirrored?: {
    headers?: Record<string, string[]>
    json?: unknown
    data?: string
    form?: Record<string, unknown>
    url?: string
  }
  error?: string
}

const kind = ref<'json' | 'text' | 'form'>('json')
const text = ref('Deploy failed')
const secret = ref('')
const url = ref('')
const posting = ref(false)
const mirror = ref<Mirror | null>(null)

/** Only the headers we are responsible for. The rest comes from fetch and the CDN. */
const ours = computed(() => {
  const headers = mirror.value?.mirrored?.headers ?? {}
  const keep = ['Content-Type', 'Webhook-Id', 'Webhook-Timestamp', 'Webhook-Signature']

  return Object.fromEntries(
    Object.entries(headers)
      .filter(([key]) => keep.includes(key))
      .map(([k, v]) => [k, v[0]]),
  )
})

/** httpbingo fills json, form and data, and leaves the unused ones empty rather than absent. */
const arrived = computed(() => {
  const m = mirror.value?.mirrored
  if (!m) return null
  if (m.json !== null && m.json !== undefined) return m.json
  if (m.form && Object.keys(m.form).length) return m.form

  return m.data
})

async function send() {
  posting.value = true
  mirror.value = null
  try {
    mirror.value = await $fetch('/api/post', {
      method: 'POST',
      body: { kind: kind.value, text: text.value, secret: secret.value, url: url.value },
    })
  } finally {
    posting.value = false
  }
}

const to = ref('chat')
const configText = ref('Deploy failed')
const sending = ref(false)
const configured = ref<Mirror | null>(null)

async function sendConfigured() {
  sending.value = true
  configured.value = null
  try {
    configured.value = await $fetch('/api/send', {
      method: 'POST',
      body: { to: to.value, text: configText.value },
    })
  } finally {
    sending.value = false
  }
}

/** No polling and no reload button: the messages arrive on their own. */
const { messages: inbox, connected } = usePigeon()

const selfText = ref('an mich selbst')
const selfSecret = ref('')
const selfPending = ref(false)
const selfError = ref('')

/** The full ISO stamp is noise in a list, the time of day is what you compare. */
function time(at: string) {
  return at.slice(11, 19)
}

/** A GitHub push payload is 20kb, so the page shows the beginning and the size. */
function preview(raw: string, limit = 400) {
  return raw.length > limit ? `${raw.slice(0, limit)}\n... ${raw.length - limit} more` : raw
}

async function selfSend() {
  selfPending.value = true
  selfError.value = ''
  try {
    const sent = await $fetch('/api/self-send', {
      method: 'POST',
      body: { text: selfText.value, secret: selfSecret.value },
    })
    if (!sent.ok) selfError.value = sent.error ?? ''
  } finally {
    selfPending.value = false
  }
}

interface Sent {
  ok: boolean
  sent?: string
  error?: string
}

const discordText = ref('*Deploy failed* on `main`')
const discordEscape = ref(false)
const discordMediaUrl = ref('')
const discordAlt = ref('Ein Screenshot')
const discordSpoiler = ref(false)
const discordEmbed = ref(false)
const discordPending = ref(false)
const discordResult = ref<Sent | null>(null)

/** The handle from the last send, which is all editing and deleting need. */
const discordSent = ref<{ id: string; attachmentIds: string[] } | null>(null)
const discordEditText = ref('Deploy fixed')
const discordEditMediaUrl = ref('')
const discordKeepImage = ref(true)

async function sendDiscord() {
  discordPending.value = true
  discordResult.value = null
  discordSent.value = null
  try {
    const answer = await $fetch('/api/discord', {
      method: 'POST',
      body: {
        text: discordText.value,
        escape: discordEscape.value,
        mediaUrl: discordMediaUrl.value,
        alt: discordAlt.value,
        spoiler: discordSpoiler.value,
        withEmbed: discordEmbed.value,
      },
    })

    discordResult.value = answer
    if (answer.ok && answer.id) {
      discordSent.value = { id: answer.id, attachmentIds: answer.attachmentIds ?? [] }
    }
  } finally {
    discordPending.value = false
  }
}

async function changeDiscord(action: 'edit' | 'delete') {
  if (!discordSent.value) return

  discordPending.value = true
  try {
    const answer = await $fetch('/api/discord-edit', {
      method: 'POST',
      body: {
        action,
        id: discordSent.value.id,
        attachmentIds: discordSent.value.attachmentIds,
        text: discordEditText.value,
        mediaUrl: discordEditMediaUrl.value,
        keepImage: discordKeepImage.value,
      },
    })

    discordResult.value = answer
    if (action === 'delete') {
      // Gone means there is nothing left to point at.
      discordSent.value = null
    } else if (answer.ok && 'id' in answer && answer.id) {
      discordSent.value = { id: answer.id, attachmentIds: answer.attachmentIds ?? [] }
    }
  } finally {
    discordPending.value = false
  }
}

const slackText = ref('*Deploy failed* on `main`')
const slackMrkdwn = ref(true)
const slackEscape = ref(false)
const slackPending = ref(false)
const slackResult = ref<Sent | null>(null)

async function sendSlack() {
  slackPending.value = true
  slackResult.value = null
  try {
    slackResult.value = await $fetch('/api/slack', {
      method: 'POST',
      body: { text: slackText.value, mrkdwn: slackMrkdwn.value, escape: slackEscape.value },
    })
  } finally {
    slackPending.value = false
  }
}

const bskyText = ref('Release 1.0 ist da: https://example.com #nuxt')
const bskyFacets = ref(true)
const bskyMediaUrl = ref('')
const bskyAlt = ref('Ein Screenshot')
const bskyCardUrl = ref('')
const bskyCardTitle = ref('nuxt-pigeon')
const bskyCardDescription = ref('Nothing here is read from the linked page.')
const bskyPending = ref(false)
const bskyResult = ref<{ ok: boolean; uri?: string; error?: string } | null>(null)

/** Both limits apply, and neither of them is `.length`. */
const bskyGraphemes = computed(() => graphemeLength(bskyText.value))
const bskyBytes = computed(() => byteLength(bskyText.value))

/** What would be linked, and at which byte offsets. Nothing is sent for this. */
const bskyRanges = computed(() => detectRanges(bskyText.value))

/** `deleteRecord` wants these three, and nothing else. There is no `edit` to go with it. */
const bskySent = ref<{ repo: string; collection: string; rkey: string } | null>(null)

async function sendBluesky() {
  bskyPending.value = true
  bskyResult.value = null
  bskySent.value = null
  try {
    const answer = await $fetch('/api/bluesky', {
      method: 'POST',
      body: {
        text: bskyText.value,
        facets: bskyFacets.value,
        mediaUrl: bskyMediaUrl.value,
        alt: bskyAlt.value,
        cardUrl: bskyCardUrl.value,
        cardTitle: bskyCardTitle.value,
        cardDescription: bskyCardDescription.value,
      },
    })

    bskyResult.value = answer
    if (answer.ok && answer.repo && answer.rkey) {
      bskySent.value = { repo: answer.repo, collection: answer.collection, rkey: answer.rkey }
    }
  } finally {
    bskyPending.value = false
  }
}

async function deleteBluesky() {
  if (!bskySent.value) return

  bskyPending.value = true
  try {
    bskyResult.value = await $fetch('/api/bluesky-delete', {
      method: 'POST',
      body: bskySent.value,
    })
    bskySent.value = null
  } finally {
    bskyPending.value = false
  }
}

const pollers = ref<Record<string, boolean>>({})

async function checkPollers() {
  pollers.value = await $fetch('/api/pollers')
}
onMounted(checkPollers)

const mastoText = ref(
  'Release 1.0 ist da: https://example.com/ein/sehr/langer/pfad/der/nicht/zaehlt',
)
const mastoVisibility = ref('direct')
const mastoSpoiler = ref('')
const mastoMediaUrl = ref('')
const mastoPending = ref(false)
const mastoResult = ref<{ ok: boolean; url?: string; error?: string } | null>(null)

/**
 * The same function the channel uses, so the number here is the number that decides.
 * A link costs a flat 23 no matter how long it is.
 */
const mastoCount = computed(() =>
  countCharacters(mastoText.value, { maxCharacters: 500, charactersReservedPerUrl: 23 }),
)

/** The handle from the last post: the status id and the files on it. */
const mastoSent = ref<{ id: string; mediaIds: string[] } | null>(null)
const mastoEditText = ref('Release 1.0 ist da, jetzt mit Tippfehler weniger')
const mastoEditMediaUrl = ref('')
const mastoKeepImages = ref(true)
const mastoRedraft = ref('')

function keepMasto(answer: { ok: boolean; id?: string; mediaIds?: string[] }) {
  mastoSent.value =
    answer.ok && answer.id ? { id: answer.id, mediaIds: answer.mediaIds ?? [] } : null
}

async function sendMastodon() {
  mastoPending.value = true
  mastoResult.value = null
  mastoSent.value = null
  mastoRedraft.value = ''
  try {
    const answer = await $fetch('/api/mastodon', {
      method: 'POST',
      body: {
        text: mastoText.value,
        visibility: mastoVisibility.value,
        spoilerText: mastoSpoiler.value,
        mediaUrl: mastoMediaUrl.value,
      },
    })

    mastoResult.value = answer
    keepMasto(answer)
  } finally {
    mastoPending.value = false
  }
}

async function changeMastodon(action: 'edit' | 'delete') {
  if (!mastoSent.value) return

  mastoPending.value = true
  try {
    const answer = await $fetch('/api/mastodon-edit', {
      method: 'POST',
      body: {
        action,
        id: mastoSent.value.id,
        mediaIds: mastoSent.value.mediaIds,
        text: mastoEditText.value,
        mediaUrl: mastoEditMediaUrl.value,
        keepImages: mastoKeepImages.value,
      },
    })

    mastoResult.value = answer
    if (action === 'delete') {
      mastoSent.value = null
      // Mastodon hands the plain text back so a client can offer a redraft.
      mastoRedraft.value = ('redraft' in answer && answer.redraft) || ''
    } else {
      keepMasto(answer)
    }
  } finally {
    mastoPending.value = false
  }
}

interface Published {
  ok: boolean
  id?: string
  topic?: string
  error?: string
}

const ntfyText = ref('Deploy failed on main')
const ntfyTitle = ref('nuxt-pigeon')
const ntfyPriority = ref(0)
const ntfyTags = ref('warning')
const ntfyClick = ref('')
const ntfyMediaUrl = ref('')
const ntfyPending = ref(false)
const ntfyResult = ref<Published | null>(null)

/** The limit is in bytes, so this is what actually counts against 4096. */
const ntfyBytes = computed(() => new TextEncoder().encode(ntfyText.value).length)

/** Topic plus id. The id may be ntfy's, or one you chose yourself. */
const ntfySent = ref<{ topic: string; id: string } | null>(null)
const ntfyEditText = ref('Deploy fixed on main')
const ntfyEditTitle = ref('nuxt-pigeon')

async function sendNtfy() {
  ntfyPending.value = true
  ntfyResult.value = null
  ntfySent.value = null
  try {
    ntfyResult.value = await $fetch('/api/ntfy', {
      method: 'POST',
      body: {
        text: ntfyText.value,
        title: ntfyTitle.value,
        priority: ntfyPriority.value,
        tags: ntfyTags.value,
        click: ntfyClick.value,
        mediaUrl: ntfyMediaUrl.value,
      },
    })
  } finally {
    ntfyPending.value = false
  }

  if (ntfyResult.value?.ok && ntfyResult.value.id && ntfyResult.value.topic) {
    ntfySent.value = { topic: ntfyResult.value.topic, id: ntfyResult.value.id }
  }
}

async function changeNtfy(action: 'edit' | 'delete') {
  if (!ntfySent.value) return

  ntfyPending.value = true
  try {
    const answer = await $fetch('/api/ntfy-edit', {
      method: 'POST',
      body: {
        action,
        topic: ntfySent.value.topic,
        id: ntfySent.value.id,
        text: ntfyEditText.value,
        title: ntfyEditTitle.value,
      },
    })

    ntfyResult.value = answer
    if (action === 'delete') {
      ntfySent.value = null
    }
  } finally {
    ntfyPending.value = false
  }
}

const tgText = ref('<b>Deploy failed</b> on main')
const tgParseMode = ref('HTML')
const tgEscape = ref(false)
const tgMediaUrl = ref('')
const tgPending = ref(false)
const tgResult = ref<Sent | null>(null)

/** The handle from the last send: chat, message and what it is made of. */
const tgSent = ref<{ chatId: string | number; messageId: number; kind: 'text' | 'media' } | null>(
  null,
)
const tgEditText = ref('Deploy fixed')
const tgEditMediaUrl = ref('')
const tgButtonsOnly = ref(false)

function keepHandle(answer: {
  ok: boolean
  chatId?: string | number
  messageId?: number
  kind?: string
}) {
  tgSent.value =
    answer.ok && answer.chatId !== undefined && answer.messageId
      ? {
          chatId: answer.chatId,
          messageId: answer.messageId,
          kind: (answer.kind ?? 'text') as 'text' | 'media',
        }
      : null
}

async function sendTelegram() {
  tgPending.value = true
  tgResult.value = null
  tgSent.value = null
  try {
    const answer = await $fetch('/api/telegram', {
      method: 'POST',
      body: {
        text: tgText.value,
        parseMode: tgParseMode.value,
        escape: tgEscape.value,
        mediaUrl: tgMediaUrl.value,
      },
    })

    tgResult.value = answer
    keepHandle(answer)
  } finally {
    tgPending.value = false
  }
}

async function changeTelegram(action: 'edit' | 'delete') {
  if (!tgSent.value) return

  tgPending.value = true
  try {
    const answer = await $fetch('/api/telegram-edit', {
      method: 'POST',
      body: {
        action,
        chatId: tgSent.value.chatId,
        messageId: tgSent.value.messageId,
        kind: tgSent.value.kind,
        text: tgEditText.value,
        mediaUrl: tgEditMediaUrl.value,
        buttonsOnly: tgButtonsOnly.value,
      },
    })

    tgResult.value = answer
    if (action === 'delete') {
      tgSent.value = null
    } else {
      // The kind can flip here: adding a picture turns a text message into a media one.
      keepHandle(answer)
    }
  } finally {
    tgPending.value = false
  }
}

interface HookInfo {
  ok: boolean
  info?: { url: string; pending_update_count: number; last_error_message?: string }
  error?: string
}

const baseUrl = ref('')
const hookPending = ref(false)
const hookInfo = ref<HookInfo | null>(null)

async function manageWebhook(action: 'set' | 'delete' | 'info') {
  hookPending.value = true
  try {
    hookInfo.value = await $fetch('/api/telegram-webhook', {
      method: 'POST',
      body: { action, baseUrl: baseUrl.value },
    })
  } finally {
    hookPending.value = false
  }
}

async function probe() {
  pending.value = true
  result.value = null
  try {
    result.value = await $fetch('/api/probe', {
      method: 'POST',
      body: { status: status.value, retries: retries.value, retryDelayMs: retryDelayMs.value },
    })
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <main>
    <h1>nuxt-pigeon</h1>
    <h2>Layer 0: transport</h2>
    <p class="hint">
      One request to <code>httpbingo.org</code>. Nothing else exists yet, no channel and no config.
      The elapsed time is the proof: retries cost waiting, and the waits double.
    </p>

    <form @submit.prevent="probe">
      <label>
        Status the service should answer with
        <select v-model.number="status">
          <option :value="200">200, works right away</option>
          <option :value="500">500, broken, worth retrying</option>
          <option :value="429">429, rate limited, worth retrying</option>
          <option :value="404">404, not worth retrying</option>
        </select>
      </label>

      <label>
        Retries
        <select v-model.number="retries">
          <option :value="0">0, off</option>
          <option :value="1">1</option>
          <option :value="2">2, the default</option>
          <option :value="3">3</option>
        </select>
      </label>

      <label>
        Base delay in ms
        <select v-model.number="retryDelayMs">
          <option :value="200">200</option>
          <option :value="500">500, the default</option>
          <option :value="1000">1000</option>
        </select>
      </label>

      <p class="hint">Expected: {{ expected }}</p>

      <button type="submit" :disabled="pending">
        {{ pending ? 'Running...' : 'Send' }}
      </button>
    </form>

    <template v-if="result">
      <p :class="result.ok ? 'ok' : 'fail'">
        {{ result.ok ? `Answered ${result.status}` : `Failed with ${result.status}` }}
        after <strong>{{ result.elapsedMs }}ms</strong>
      </p>
      <pre v-if="result.error">{{ result.error }}</pre>
    </template>
    <section>
      <h2>Layer 1: post</h2>
      <p class="hint">
        One POST to a url. Nothing is added to the payload and only
        <code>Content-Type</code> is set by us. With a secret, three signature headers come along.
        The receiver is <code>httpbingo.org</code>, which mirrors the request back.
      </p>

      <form @submit.prevent="send">
        <fieldset>
          <legend>Payload</legend>
          <label class="inline">
            <input v-model="kind" type="radio" value="json" />
            object
          </label>
          <label class="inline">
            <input v-model="kind" type="radio" value="text" />
            string
          </label>
          <label class="inline">
            <input v-model="kind" type="radio" value="form" />
            URLSearchParams
          </label>
        </fieldset>

        <label>
          Text
          <input v-model="text" />
        </label>

        <label>
          Secret, empty sends unsigned
          <input v-model="secret" placeholder="whsec_... or any passphrase" />
        </label>

        <label>
          Url, empty uses httpbingo
          <input v-model="url" placeholder="https://httpbingo.org/post" />
        </label>

        <button type="submit" :disabled="posting || !text.trim()">
          {{ posting ? 'Sending...' : 'Send' }}
        </button>
      </form>

      <template v-if="mirror">
        <p v-if="!mirror.ok" class="fail">{{ mirror.error }}</p>
        <template v-else>
          <p class="hint">Headers we are responsible for:</p>
          <pre>{{ JSON.stringify(ours, null, 2) }}</pre>
          <p class="hint">What arrived as the body:</p>
          <pre>{{ JSON.stringify(arrived, null, 2) }}</pre>
        </template>
      </template>
    </section>
    <section>
      <h2>Layer 1: webhook.send with config</h2>
      <p class="hint">
        The same <code>post</code>, but the url now comes from <code>nuxt.config</code> and
        <code>.env</code> instead of the form. <code>chat</code> has its url in the config,
        <code>n8n</code> gets it from <code>PIGEON_WEBHOOK_N8N_URL</code> and adds a header of its
        own.
      </p>

      <form @submit.prevent="sendConfigured">
        <label>
          Endpoint
          <select v-model="to">
            <option value="">none, uses PIGEON_WEBHOOK_URL</option>
            <option value="chat">chat, url from nuxt.config</option>
            <option value="n8n">n8n, url from .env plus X-Demo</option>
            <option value="gibtsnicht">gibtsnicht, a typo</option>
          </select>
        </label>

        <label>
          Text
          <input v-model="configText" />
        </label>

        <button type="submit" :disabled="sending">
          {{ sending ? 'Sending...' : 'Send' }}
        </button>
      </form>

      <template v-if="configured">
        <p v-if="!configured.ok" class="fail">{{ configured.error }}</p>
        <template v-else>
          <p class="hint">Where it went and what it carried:</p>
          <pre>{{
            JSON.stringify(
              {
                url: configured.mirrored?.url,
                body: configured.mirrored?.json,
                demoHeader: configured.mirrored?.headers?.['X-Demo']?.[0] ?? null,
              },
              null,
              2,
            )
          }}</pre>
        </template>
      </template>
    </section>
    <section>
      <h2>Layer 3: usePigeon</h2>
      <p class="hint">
        Stream is
        <strong :class="connected ? 'ok' : 'fail'">{{
          connected ? 'connected' : 'not connected'
        }}</strong
        >. Nothing below is fetched: messages arrive on their own, whether they come from the button
        here, from Telegram through the tunnel, or from a second browser tab.
      </p>

      <form @submit.prevent="selfSend">
        <label>
          Text
          <input v-model="selfText" />
        </label>

        <label>
          Secret, only to see the signature headers arrive
          <input v-model="selfSecret" placeholder="empty sends unsigned" />
        </label>

        <button type="submit" :disabled="selfPending">
          {{ selfPending ? 'Sending...' : 'Send to myself' }}
        </button>
      </form>

      <p v-if="selfError" class="fail">{{ selfError }}</p>

      <p v-if="!inbox.length" class="hint">Nothing yet.</p>

      <template v-else>
        <p class="hint">Live, newest first:</p>
        <ul>
          <li v-for="message in inbox" :key="message.at">
            <strong>{{ message.channel }}</strong>
            <!-- The event name in the channel's own words. Two deliveries of one
                 message differ here and nowhere else. -->
            <code v-if="message.type">{{ message.type }}</code>
            <!-- Slack hands out a user id and no name, so the id has to do. -->
            <span v-if="message.from" class="hint">
              from {{ message.from.name ?? message.from.id }}</span
            >
            <span class="hint"> - {{ time(message.at) }} - {{ message.raw.length }} bytes</span>
            <!-- Channels that know their shape fill `text`, the generic webhook does not. -->
            <div v-if="message.text" class="quote">{{ message.text }}</div>

            <!-- Slack retries a delivery it considers failed, and says so. Not a
                 second subscription, the very same event arriving twice. -->
            <p v-if="message.headers['x-slack-retry-num']" class="fail">
              retry {{ message.headers['x-slack-retry-num'] }}, reason
              {{ message.headers['x-slack-retry-reason'] }}
            </p>

            <details>
              <summary>body, this is where the identifying fields live</summary>
              <pre>{{ preview(JSON.stringify(message.body, null, 2), 1200) }}</pre>
            </details>
            <details>
              <summary>headers</summary>
              <pre>{{ JSON.stringify(message.headers, null, 2) }}</pre>
            </details>
          </li>
        </ul>
      </template>
    </section>
    <section>
      <h2>Layer 2: discord</h2>
      <p class="hint">
        The first channel, and it is deliberately thin: 54 lines. It contributes its field names,
        its 2000 character limit and an escaping helper. Retry, timeout, headers and the error that
        never carries the url all come from below.
      </p>

      <form @submit.prevent="sendDiscord">
        <label>
          Text
          <textarea v-model="discordText" rows="3" />
        </label>

        <label class="inline">
          <input v-model="discordEscape" type="checkbox" />
          Run it through <code>escapeMarkdown</code> first
        </label>

        <label>
          Image url, empty sends text only
          <input v-model="discordMediaUrl" placeholder="https://…/something.png" />
        </label>

        <label>
          Alt text
          <input v-model="discordAlt" />
        </label>

        <label class="inline">
          <input v-model="discordSpoiler" type="checkbox" />
          Spoiler. Only works on a real attachment, never on an embed image url
        </label>

        <label class="inline">
          <input v-model="discordEmbed" type="checkbox" />
          Wrap it in an embed that points at the attachment
        </label>

        <button type="submit" :disabled="discordPending || !discordText.trim()">
          {{ discordPending ? 'Sending...' : 'Send to Discord' }}
        </button>
      </form>

      <template v-if="discordResult">
        <p :class="discordResult.ok ? 'ok' : 'fail'">
          {{ discordResult.ok ? 'Sent' : discordResult.error }}
        </p>
        <!-- What Discord stored, so escaping is visible rather than claimed. -->
        <pre v-if="discordResult.sent">{{ discordResult.sent }}</pre>
      </template>

      <template v-if="discordSent">
        <h3>Change it again</h3>
        <p class="hint">
          The result of <code>send</code> is the handle: id <code>{{ discordSent.id }}</code
          >, {{ discordSent.attachmentIds.length }} attachment(s). Editing keeps them unless you say
          otherwise, because Discord would silently drop every file the request does not name.
        </p>

        <label>
          New text
          <input v-model="discordEditText" />
        </label>

        <label>
          Add another image, optional
          <input v-model="discordEditMediaUrl" placeholder="https://…/second.png" />
        </label>

        <label class="inline">
          <input v-model="discordKeepImage" type="checkbox" />
          Keep the images that are on it. Off means the message loses them
        </label>

        <div class="row">
          <button type="button" :disabled="discordPending" @click="changeDiscord('edit')">
            {{ discordPending ? 'Working...' : 'Edit it' }}
          </button>
          <button type="button" :disabled="discordPending" @click="changeDiscord('delete')">
            Delete it
          </button>
        </div>
      </template>
    </section>
    <section>
      <h2>Layer 2: telegram, receiving</h2>
      <p class="hint">
        Telegram cannot reach localhost, so this needs <code>--tunnel</code>. Paste the tunnel
        address, register it, then write to your bot. The message appears above in
        <code>usePigeon</code> without a reload, with its text already pulled out.
      </p>

      <form @submit.prevent="manageWebhook('set')">
        <label>
          Public base url
          <input v-model="baseUrl" placeholder="https://something.trycloudflare.com" />
        </label>

        <button type="submit" :disabled="hookPending || !baseUrl.trim()">Register</button>
      </form>

      <button :disabled="hookPending" @click="manageWebhook('info')">
        What does Telegram think is registered
      </button>
      <button :disabled="hookPending" @click="manageWebhook('delete')">Unregister</button>

      <template v-if="hookInfo">
        <p v-if="!hookInfo.ok" class="fail">{{ hookInfo.error }}</p>
        <!-- last_error_message is what Telegram itself saw when it tried to deliver. -->
        <pre v-else>{{ JSON.stringify(hookInfo.info, null, 2) }}</pre>
      </template>
    </section>

    <section>
      <h2>Layer 2: telegram, sending</h2>
      <p class="hint">
        The other shape of a channel: not a webhook. The method sits in the url, so this one talks
        to <code>createRequest</code> directly instead of <code>post</code>. The token sits in the
        url too, which is why its errors are rebuilt rather than passed on.
      </p>

      <form @submit.prevent="sendTelegram">
        <label>
          Text
          <textarea v-model="tgText" rows="3" />
        </label>

        <label>
          Parse mode
          <select v-model="tgParseMode">
            <option value="">none, the text stays literal</option>
            <option value="HTML">HTML</option>
            <option value="MarkdownV2">MarkdownV2</option>
          </select>
        </label>

        <label class="inline">
          <input v-model="tgEscape" type="checkbox" />
          Run it through <code>escapeHtml</code> first
        </label>

        <label>
          Image url, empty sends text only
          <input v-model="tgMediaUrl" placeholder="https://…/something.png" />
        </label>

        <p v-if="tgMediaUrl" class="hint">
          The url goes to Telegram <strong>untouched</strong>, it fetches the file itself. And the
          text becomes a caption, so the limit drops from 4096 to <strong>1024</strong>.
        </p>

        <button type="submit" :disabled="tgPending || !tgText.trim()">
          {{ tgPending ? 'Sending...' : 'Send to Telegram' }}
        </button>
      </form>

      <template v-if="tgResult">
        <p :class="tgResult.ok ? 'ok' : 'fail'">
          {{ tgResult.ok ? 'Sent' : tgResult.error }}
        </p>
        <!-- Telegram echoes the parsed message, so this is what actually arrived. -->
        <pre v-if="tgResult.sent">{{ tgResult.sent }}</pre>
      </template>

      <template v-if="tgSent">
        <h3>Change it again</h3>
        <p class="hint">
          Telegram has <strong>four</strong> ways to change a message and refuses the wrong one.
          There is one <code>edit</code>, and the handle decides: this message is
          <code>{{ tgSent.kind }}</code
          >, so new words go to
          <code>{{ tgSent.kind === 'media' ? 'editMessageCaption' : 'editMessageText' }}</code
          >. Give an image and it becomes <code>editMessageMedia</code>, give no words at all and
          only the buttons change.
        </p>

        <label>
          New text
          <input v-model="tgEditText" :disabled="tgButtonsOnly" />
        </label>

        <label>
          Image url, replaces the file or adds one to a text message
          <input v-model="tgEditMediaUrl" placeholder="https://…/second.png" />
        </label>

        <label class="inline">
          <input v-model="tgButtonsOnly" type="checkbox" />
          No new words, only a button. That is the fourth method
        </label>

        <div class="row">
          <button type="button" :disabled="tgPending" @click="changeTelegram('edit')">
            {{ tgPending ? 'Working...' : 'Edit it' }}
          </button>
          <button type="button" :disabled="tgPending" @click="changeTelegram('delete')">
            Delete it
          </button>
        </div>

        <p class="hint">
          Deleting is Telegram's own rule: only <strong>within 48 hours</strong> of sending.
        </p>
      </template>
    </section>
    <section>
      <h2>Layer 2: slack</h2>
      <p class="hint">
        Webhook shaped like Discord, so it sits on <code>post</code> too. Bold is a single
        <code>*</code> here, not two. And <code>send</code> returns nothing: Slack answers with the
        plain text <code>ok</code> and no message id, so the message can never be edited, deleted or
        linked to.
      </p>

      <form @submit.prevent="sendSlack">
        <label>
          Text
          <textarea v-model="slackText" rows="3" />
        </label>

        <label class="inline">
          <input v-model="slackMrkdwn" type="checkbox" />
          Let Slack parse it as mrkdwn
        </label>

        <label class="inline">
          <input v-model="slackEscape" type="checkbox" />
          Run it through <code>escapeMrkdwn</code> first
        </label>

        <button type="submit" :disabled="slackPending || !slackText.trim()">
          {{ slackPending ? 'Sending...' : 'Send to Slack' }}
        </button>
      </form>

      <p v-if="slackResult" :class="slackResult.ok ? 'ok' : 'fail'">
        {{ slackResult.ok ? 'Slack accepted it, look in your channel' : slackResult.error }}
      </p>
    </section>
    <section>
      <h2>Layer 2: ntfy</h2>
      <p class="hint">
        Third counting method in the module: ntfy counts <strong>bytes</strong>, not characters. An
        umlaut costs two, an emoji four. Published as JSON rather than through the
        <code>X-Title</code> headers ntfy also offers, because headers are ASCII only and an umlaut
        in a title would have to be encoded.
      </p>

      <form @submit.prevent="sendNtfy">
        <label>
          Text
          <textarea v-model="ntfyText" rows="2" />
        </label>

        <p class="hint">
          {{ ntfyText.length }} characters, <strong>{{ ntfyBytes }} bytes</strong> of 4096
        </p>

        <label>
          Title
          <input v-model="ntfyTitle" />
        </label>

        <label>
          Priority
          <select v-model.number="ntfyPriority">
            <option :value="0">default (3)</option>
            <option :value="1">1 min, silent</option>
            <option :value="4">4 high</option>
            <option :value="5">5 max, rings through do-not-disturb</option>
          </select>
        </label>

        <label>
          Tags, comma separated
          <input v-model="ntfyTags" placeholder="warning, skull, rocket" />
        </label>

        <label>
          Click url
          <input v-model="ntfyClick" placeholder="optional, opened when tapped" />
        </label>

        <label>
          Image url, empty sends text only
          <input v-model="ntfyMediaUrl" placeholder="https://…/something.png" />
        </label>

        <button type="submit" :disabled="ntfyPending || !ntfyText.trim()">
          {{ ntfyPending ? 'Publishing...' : 'Publish to ntfy' }}
        </button>
      </form>

      <p v-if="ntfyResult" :class="ntfyResult.ok ? 'ok' : 'fail'">
        {{ ntfyResult.ok ? `Published, id ${ntfyResult.id}` : ntfyResult.error }}
      </p>

      <template v-if="ntfySent">
        <h3>Change it again</h3>
        <p class="hint">
          Topic <code>{{ ntfySent.topic }}</code
          >, id <code>{{ ntfySent.id }}</code
          >. An update is not a separate endpoint: ntfy ties messages together through a
          <strong>sequence id</strong>, and publishing again with the same one replaces the
          notification on your phone instead of adding a second one. Needs an ntfy server of
          <strong>2.16.0</strong> or newer.
        </p>

        <label>
          New text
          <input v-model="ntfyEditText" />
        </label>

        <label>
          Title
          <input v-model="ntfyEditTitle" />
        </label>

        <div class="row">
          <button type="button" :disabled="ntfyPending" @click="changeNtfy('edit')">
            {{ ntfyPending ? 'Working...' : 'Edit it' }}
          </button>
          <button type="button" :disabled="ntfyPending" @click="changeNtfy('delete')">
            Delete it
          </button>
        </div>
      </template>
    </section>
    <section>
      <h2>Layer 2: mastodon</h2>
      <p class="hint">
        Broadcast, so the verb is <code>post</code> and not <code>send</code>.
        <strong>This goes out publicly</strong> unless you pick another visibility. Receiving is
        polled, there is no webhook for your own account.
      </p>

      <p class="hint">
        Poller is
        <strong :class="pollers.mastodon ? 'ok' : 'fail'">
          {{ pollers.mastodon ? 'running' : 'not running' }}</strong
        >. The first round only marks where we are, so trigger something <strong>after</strong> the
        server started. Mastodon never notifies you about your own actions, so a second account has
        to mention or follow you.
      </p>

      <form @submit.prevent="sendMastodon">
        <label>
          Text
          <textarea v-model="mastoText" rows="3" />
        </label>

        <!-- The point of the whole counting function, visible side by side. -->
        <p class="hint">
          {{ mastoText.length }} raw characters, <strong>{{ mastoCount }} counted</strong> of 500. A
          link costs 23 whatever its length, and the domain of a remote mention costs nothing.
        </p>

        <label>
          Visibility
          <select v-model="mastoVisibility">
            <option value="direct">direct, only mentioned accounts see it</option>
            <option value="private">private, followers only</option>
            <option value="unlisted">unlisted, not in public timelines</option>
            <option value="">public, the instance default</option>
          </select>
        </label>

        <label>
          Content warning
          <input v-model="mastoSpoiler" placeholder="optional, collapses the post" />
        </label>

        <label>
          Image url, empty posts text only
          <input v-model="mastoMediaUrl" placeholder="https://…/something.png" />
        </label>

        <p v-if="mastoMediaUrl" class="hint">
          Mastodon takes <strong>no url</strong>, so this is downloaded and uploaded again. A large
          file answers 202 while it is still being processed, and the post waits for that before it
          goes out.
        </p>

        <button type="submit" :disabled="mastoPending || !mastoText.trim()">
          {{ mastoPending ? 'Posting...' : 'Post' }}
        </button>
      </form>

      <template v-if="mastoResult">
        <p :class="mastoResult.ok ? 'ok' : 'fail'">
          {{ mastoResult.ok ? 'Posted' : mastoResult.error }}
        </p>
        <a v-if="mastoResult.url" :href="mastoResult.url" target="_blank">{{ mastoResult.url }}</a>
      </template>

      <template v-if="mastoSent">
        <h3>Change it again</h3>
        <p class="hint">
          Status <code>{{ mastoSent.id }}</code
          >, {{ mastoSent.mediaIds.length }} attachment(s). Everyone sees that it was changed:
          Mastodon keeps a version history and clients show an <strong>edited</strong> marker.
        </p>

        <label>
          New text
          <input v-model="mastoEditText" />
        </label>

        <label>
          Add another image, optional
          <input v-model="mastoEditMediaUrl" placeholder="https://…/second.png" />
        </label>

        <label class="inline">
          <input v-model="mastoKeepImages" type="checkbox" />
          Keep the images that are on it. Off detaches them
        </label>

        <div class="row">
          <button type="button" :disabled="mastoPending" @click="changeMastodon('edit')">
            {{ mastoPending ? 'Working...' : 'Edit it' }}
          </button>
          <button type="button" :disabled="mastoPending" @click="changeMastodon('delete')">
            Delete it
          </button>
        </div>
      </template>

      <template v-if="mastoRedraft">
        <p class="hint">
          Deleted, and Mastodon handed the plain text back. That is what clients use for their
          delete and redraft, and it is the reason this is not just a 204:
        </p>
        <pre>{{ mastoRedraft }}</pre>
      </template>
    </section>
    <section>
      <h2>Layer 2: bluesky</h2>
      <p class="hint">
        Poller is
        <strong :class="pollers.bluesky ? 'ok' : 'fail'">
          {{ pollers.bluesky ? 'running' : 'not running' }}</strong
        >. Broadcast, so the verb is <code>post</code>. <strong>This goes out publicly</strong>,
        Bluesky has no private posting.
      </p>

      <form @submit.prevent="sendBluesky">
        <label>
          Text
          <textarea v-model="bskyText" rows="3" />
        </label>

        <!-- Two limits, and `.length` matches neither. -->
        <p class="hint">
          {{ bskyText.length }} in the string, <strong>{{ bskyGraphemes }} graphemes</strong> of
          300, <strong>{{ bskyBytes }} bytes</strong> of 3000
        </p>

        <label class="inline">
          <input v-model="bskyFacets" type="checkbox" />
          Detect facets, so links, tags and mentions become clickable
        </label>

        <!-- Bluesky links nothing on its own, and the offsets are bytes. -->
        <p v-if="bskyFacets" class="hint">Would linkify, byte ranges:</p>
        <pre v-if="bskyFacets">{{ JSON.stringify(bskyRanges, null, 2) }}</pre>

        <label>
          Image url, empty posts text only
          <input v-model="bskyMediaUrl" placeholder="https://…/something.png" />
        </label>

        <label>
          Alt text
          <input v-model="bskyAlt" />
        </label>

        <label>
          Link card for this address, empty attaches the image on its own
          <input v-model="bskyCardUrl" placeholder="https://nuxt.fyi" />
        </label>

        <template v-if="bskyCardUrl">
          <label>
            Card title
            <input v-model="bskyCardTitle" />
          </label>

          <label>
            Card description
            <input v-model="bskyCardDescription" />
          </label>

          <!-- The point of the two fields above. -->
          <p class="hint">
            Change these and look at the post: the card shows exactly what you typed. Bluesky reads
            <strong>nothing</strong> from the linked page.
          </p>
        </template>

        <p class="hint">
          Bluesky takes <strong>no url</strong>, both are uploaded as a blob first, and a blob may
          be <strong>about 1 MB</strong>. Give an image and a card together and the channel decides,
          and <strong>says so in the server log</strong>: one embed per post, so the card wins and
          your image becomes its thumbnail.
        </p>

        <button type="submit" :disabled="bskyPending || !bskyText.trim()">
          {{ bskyPending ? 'Posting...' : 'Post publicly' }}
        </button>
      </form>

      <p v-if="bskyResult" :class="bskyResult.ok ? 'ok' : 'fail'">
        {{ bskyResult.ok ? `Posted, ${bskyResult.uri}` : bskyResult.error }}
      </p>

      <template v-if="bskySent">
        <h3>Remove it again</h3>
        <p class="hint">
          <strong>Only deleting.</strong> There is no <code>bluesky.edit</code>, and that is not a
          gap here: <code>putRecord</code> on a post answers with a 200 and the appview ignores the
          change. An edit would look like it worked and do nothing, which is worse than not offering
          it.
        </p>

        <button type="button" :disabled="bskyPending" @click="deleteBluesky">
          {{ bskyPending ? 'Working...' : 'Delete it' }}
        </button>
      </template>
    </section>
  </main>
</template>

<style>
main {
  max-width: 34rem;
  margin: 4rem auto;
  font-family: system-ui, sans-serif;
}

h2 {
  font-size: 1rem;
}

form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: #666;
}

fieldset {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  border: 1px solid #ddd;
  padding: 0.5rem 0.75rem;
}

legend,
label.inline {
  font-size: 0.85rem;
  color: #666;
}

label.inline {
  flex-direction: row;
  align-items: center;
  gap: 0.35rem;
  color: inherit;
  font-size: 1rem;
}

section {
  margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: 1px solid #ddd;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

input,
select,
button {
  padding: 0.5rem;
  font: inherit;
  font-size: 1rem;
}

.hint {
  margin: 0;
  font-size: 0.85rem;
  color: #666;
}

.row {
  display: flex;
  gap: 0.5rem;
}

.ok {
  color: #157f3d;
}

.fail {
  color: #b3261e;
}

ul {
  margin: 0;
  padding-left: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.quote {
  margin-top: 0.3rem;
  padding-left: 0.6rem;
  border-left: 2px solid #ddd;
  color: #444;
}

summary {
  font-size: 0.85rem;
  color: #666;
  cursor: pointer;
}

pre {
  padding: 0.75rem;
  background: #f4f4f5;
  white-space: pre-wrap;
}
</style>
