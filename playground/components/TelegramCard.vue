<script setup lang="ts">
/**
 * Everything Telegram, in one file you can read from top to bottom: sending, the
 * media path, the four ways to edit, deleting, and the receiving side.
 *
 * The pieces around it (the card shell, the url preview, the message list) hold no
 * Telegram knowledge at all, so nothing you need is hidden in another component.
 */

// --- sending ---------------------------------------------------------------

const text = ref('<b>Deploy failed</b> on main')
const parseMode = ref('HTML')
const escape = ref(false)
const mediaUrl = ref('')
const mediaOk = ref(true)
const pending = ref(false)
const error = ref('')

/** What `send` handed back. It is the handle for editing and deleting. */
const sent = ref<{
  chatId: string | number
  messageId: number
  kind: 'text' | 'media'
  url?: string
  sent?: string
} | null>(null)

/** A caption allows 1024 characters, a text 4096. The limit moves with the image. */
const limit = computed(() => (mediaUrl.value ? 1024 : 4096))
const tooLong = computed(() => text.value.length > limit.value)

async function send() {
  pending.value = true
  error.value = ''
  sent.value = null

  const answer = await $fetch('/api/telegram', {
    method: 'POST',
    body: {
      text: text.value,
      parseMode: parseMode.value,
      escape: escape.value,
      mediaUrl: mediaUrl.value,
    },
  })

  pending.value = false

  if (!answer.ok) {
    error.value = answer.error
    return
  }

  sent.value = {
    chatId: answer.chatId!,
    messageId: answer.messageId!,
    kind: (answer.kind ?? 'text') as 'text' | 'media',
    url: answer.url ?? undefined,
    sent: answer.sent ?? undefined,
  }
}

// --- editing and deleting --------------------------------------------------

const editText = ref('Deploy fixed')
const editMediaUrl = ref('')
const editMediaOk = ref(true)
const buttonsOnly = ref(false)

/**
 * Which of Telegram's four methods will run. The channel decides this itself, this
 * is only here so you can see the decision before you press the button.
 */
const method = computed(() => {
  if (!sent.value) return ''
  if (editMediaUrl.value) return 'editMessageMedia'
  if (buttonsOnly.value) return 'editMessageReplyMarkup'

  return sent.value.kind === 'media' ? 'editMessageCaption' : 'editMessageText'
})

async function change(action: 'edit' | 'delete') {
  if (!sent.value) return

  pending.value = true
  error.value = ''

  const answer = await $fetch('/api/telegram-edit', {
    method: 'POST',
    body: {
      action,
      chatId: sent.value.chatId,
      messageId: sent.value.messageId,
      kind: sent.value.kind,
      text: editText.value,
      mediaUrl: editMediaUrl.value,
      buttonsOnly: buttonsOnly.value,
    },
  })

  pending.value = false

  if (!answer.ok) {
    error.value = answer.error
    return
  }

  if (action === 'delete') {
    sent.value = null
    return
  }

  // Adding a picture turns a text message into a media one, and the next edit
  // takes a different method because of it.
  if ('kind' in answer && answer.kind) {
    sent.value = { ...sent.value, kind: answer.kind, sent: answer.sent ?? undefined }
  }
}

// --- receiving -------------------------------------------------------------

/** Only Telegram messages. One stream for the whole page, filtered here. */
const { messages, connected } = usePigeon({ channel: 'telegram', limit: 20 })

const baseUrl = ref('')
const hook = ref<{ ok: boolean; error?: string; info?: Record<string, unknown> } | null>(null)

/**
 * Telegram cannot reach localhost, so receiving needs a public address even in
 * development. Registering it is a write to the outside, so it never happens on its
 * own: only you know your tunnel.
 */
async function webhook(action: 'set' | 'delete' | 'info') {
  hook.value = await $fetch('/api/telegram-webhook', {
    method: 'POST',
    body: { action, baseUrl: baseUrl.value },
  })
}

const registered = computed(() => Boolean(hook.value?.ok && hook.value.info?.url))
</script>

<template>
  <ChannelCard
    name="Telegram"
    color="#26a5e4"
    icon="telegram.svg"
    hint="Bot API. The token sits in the url, which is why its errors are rebuilt before you ever see them."
  >
    <template #status>
      <span class="dot" :class="connected ? 'on' : 'off'" />
      <span :class="connected ? 'ok' : 'hint'">{{ connected ? 'stream open' : 'no stream' }}</span>
    </template>

    <!-- Sending ------------------------------------------------------------ -->

    <form @submit.prevent="send">
      <label>
        Text
        <textarea v-model="text" rows="2" />
      </label>

      <p class="hint">
        {{ text.length }} of {{ limit }} characters.
        <span v-if="mediaUrl">With an image the text becomes a caption, so the limit drops.</span>
        <span v-if="tooLong" class="fail">Too long, the channel refuses this before sending.</span>
      </p>

      <div class="two">
        <label>
          Parse mode
          <select v-model="parseMode">
            <option value="">none, the text stays literal</option>
            <option value="HTML">HTML</option>
            <option value="MarkdownV2">MarkdownV2</option>
          </select>
        </label>

        <label class="inline">
          <input v-model="escape" type="checkbox" />
          Run it through <code>escapeHtml</code> first
        </label>
      </div>

      <MediaUrl v-model="mediaUrl" v-model:valid="mediaOk" />

      <p v-if="mediaUrl" class="hint">
        The url goes to Telegram <strong>untouched</strong>, it fetches the file itself.
      </p>

      <button type="submit" :disabled="pending || !text.trim() || tooLong || !mediaOk">
        {{ pending ? 'Sending…' : 'Send' }}
      </button>
    </form>

    <p v-if="error" class="fail">{{ error }}</p>

    <!-- Editing ------------------------------------------------------------ -->

    <div v-if="sent" class="zone linked">
      <p class="label">Change what you just sent</p>

      <div class="handle">
        <span class="mono">chat {{ sent.chatId }} · message {{ sent.messageId }}</span>
        <span class="kind">{{ sent.kind }}</span>
        <a v-if="sent.url" :href="sent.url" target="_blank">open</a>
      </div>

      <p class="hint">
        Telegram has <strong>four</strong> ways to change a message and refuses the wrong one. There
        is one <code>edit</code>, and the handle decides which runs:
        <code>{{ method }}</code>
      </p>

      <label>
        New text
        <input v-model="editText" :disabled="buttonsOnly" />
      </label>

      <MediaUrl
        v-model="editMediaUrl"
        v-model:valid="editMediaOk"
        label="Image url, replaces the file or adds one to a text message"
      />

      <label class="inline">
        <input v-model="buttonsOnly" type="checkbox" />
        No new words, only a button. That is the fourth method
      </label>

      <div class="row">
        <button type="button" :disabled="pending || !editMediaOk" @click="change('edit')">
          Edit it
        </button>
        <button type="button" class="ghost" :disabled="pending" @click="change('delete')">
          Delete it
        </button>
      </div>

      <p class="hint">Deleting is Telegram's own rule: only within <strong>48 hours</strong>.</p>
    </div>

    <!-- Receiving ---------------------------------------------------------- -->

    <details class="zone" open>
      <summary>
        Receiving
        <span class="dot" :class="registered ? 'on' : 'off'" />
        <span class="mono lower">{{ registered ? 'webhook registered' : 'no webhook' }}</span>
      </summary>

      <div class="zone-body">
        <p class="hint">
          Telegram cannot reach <code>localhost</code>, so this needs <code>--tunnel</code>. Paste
          the public address, register it, then write to your bot.
        </p>

        <label>
          Public base url
          <input v-model="baseUrl" placeholder="https://…trycloudflare.com" />
        </label>

        <div class="row">
          <button type="button" class="ghost" :disabled="!baseUrl" @click="webhook('set')">
            Register
          </button>
          <button type="button" class="ghost" @click="webhook('info')">Check</button>
          <button type="button" class="ghost" @click="webhook('delete')">Unregister</button>
        </div>

        <p v-if="hook && !hook.ok" class="fail">{{ hook.error }}</p>
        <pre v-else-if="hook">{{ JSON.stringify(hook.info, null, 2) }}</pre>

        <MessageFeed
          :messages="messages"
          empty="Nothing yet. Write to your bot and it appears here."
        />
      </div>
    </details>
  </ChannelCard>
</template>

<style scoped>
form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.two {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 1rem;
}

.handle {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
}

.kind {
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  background: var(--green-soft);
  color: var(--green-deep);
  font-size: 0.75rem;
  font-weight: 600;
}

.handle a {
  margin-left: auto;
  color: var(--green-deep);
}

/* The summary is uppercase, this one line inside it is not. */
.lower {
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
}
</style>
