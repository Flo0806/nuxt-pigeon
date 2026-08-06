<script setup lang="ts">
/**
 * Everything Slack, in one file. The only channel with **two ways in**, and almost
 * everything on this card follows from which one is configured:
 *
 * - a bot token picks a channel per message, answers with a `ts`, and can edit
 * - an incoming webhook answers with the plain text `ok` and nothing to point at
 *
 * The third oddity is the upload: a file does not hang on a message here, it
 * **becomes** one, and Slack answers it without a timestamp.
 */

const LIMIT = 3000

// --- which mode are we in --------------------------------------------------

const { data: info } = await useFetch('/api/slack-info')

const bot = computed(() => info.value?.mode === 'bot')

// --- sending ---------------------------------------------------------------

const text = ref('*Deploy failed* on `main`')
const mrkdwn = ref(true)
const escape = ref(false)
const channelId = ref('')
const threadTs = ref('')
const mediaUrl = ref('')
const mediaOk = ref(true)
const pending = ref(false)
const error = ref('')

/** Only the bot mode hands one back. `id` is the `ts`, and it doubles as the sort key. */
const sent = ref<{ channelId: string; id?: string; fileIds: string[] } | null>(null)

const tooLong = computed(() => text.value.length > LIMIT)

/** An upload has no `ts`, so it can be deleted but never edited. */
const isUpload = computed(() => Boolean(sent.value && !sent.value.id))

async function send() {
  pending.value = true
  error.value = ''
  sent.value = null

  const answer = await $fetch('/api/slack', {
    method: 'POST',
    body: {
      text: text.value,
      mrkdwn: mrkdwn.value,
      escape: escape.value,
      channelId: channelId.value,
      threadTs: threadTs.value,
      mediaUrl: mediaUrl.value,
    },
  })

  pending.value = false

  if (!answer.ok) {
    error.value = answer.error
    return
  }

  if (answer.channelId && (answer.id || answer.fileIds?.length)) {
    sent.value = {
      channelId: answer.channelId,
      id: answer.id ?? undefined,
      fileIds: answer.fileIds ?? [],
    }
  }
}

// --- editing and deleting --------------------------------------------------

const editText = ref('Deploy fixed on main')

async function change(action: 'edit' | 'delete') {
  if (!sent.value) return

  pending.value = true
  error.value = ''

  const answer = await $fetch('/api/slack-edit', {
    method: 'POST',
    body: {
      action,
      channelId: sent.value.channelId,
      id: sent.value.id,
      fileIds: sent.value.fileIds,
      text: editText.value,
    },
  })

  pending.value = false

  if (!answer.ok) {
    error.value = answer.error
    return
  }

  if (action === 'delete') {
    sent.value = null
  }
}

// --- receiving -------------------------------------------------------------

/** Only Slack events. One stream for the whole page, filtered here. */
const { messages, connected } = usePigeon({ channel: 'slack', limit: 20 })
</script>

<template>
  <ChannelCard
    name="Slack"
    color="#4a154b"
    icon="slack.png"
    hint="Two ways in. With a bot token everything works, with an incoming webhook only sending."
  >
    <template #status>
      <span class="dot" :class="bot ? 'on' : 'off'" />
      <span class="hint">{{ bot ? 'bot token' : 'incoming webhook' }}</span>
    </template>

    <!-- Sending ------------------------------------------------------------ -->

    <form @submit.prevent="send">
      <label>
        Text
        <textarea v-model="text" rows="2" />
      </label>

      <p class="hint">
        {{ text.length }} of {{ LIMIT }} characters. Bold is a single <code>*</code> here, not two.
        <span v-if="tooLong" class="fail">Too long, the channel refuses this before sending.</span>
      </p>

      <div class="two">
        <label class="inline">
          <input v-model="mrkdwn" type="checkbox" />
          Let Slack parse it as <code>mrkdwn</code>
        </label>

        <label class="inline">
          <input v-model="escape" type="checkbox" />
          Run it through <code>escapeMrkdwn</code> first
        </label>
      </div>

      <template v-if="bot">
        <label>
          Channel id, empty uses the configured one
          <input v-model="channelId" :placeholder="info?.channel || 'C01ABC2DEF'" />
        </label>

        <label>
          Reply in a thread: the <code>ts</code> of the message to answer
          <input v-model="threadTs" placeholder="1503435956.000247" />
        </label>
      </template>

      <MediaUrl v-model="mediaUrl" v-model:valid="mediaOk" />

      <p v-if="mediaUrl" class="hint">
        Three steps: Slack hands out a one time url, the bytes go <strong>there</strong> and not to
        the API, then the file is shared into the channel with your text as its comment. The file
        <strong>becomes</strong> the message, and Slack answers it
        <strong>without a timestamp</strong>.
      </p>

      <button type="submit" :disabled="pending || !text.trim() || tooLong || !mediaOk">
        {{ pending ? 'Sending…' : 'Send' }}
      </button>
    </form>

    <p v-if="error" class="fail">{{ error }}</p>

    <p v-else-if="!bot" class="hint">
      An incoming webhook answers with the plain text <code>ok</code> and no message id, so there is
      nothing to point at afterwards. Set <code>PIGEON_SLACK_BOT_TOKEN</code> and this card grows an
      edit section.
    </p>

    <!-- Editing ------------------------------------------------------------ -->

    <div v-if="sent" class="zone linked">
      <p class="label">Change what you just sent</p>

      <div class="handle">
        <span class="mono">channel {{ sent.channelId }}</span>
        <span v-if="sent.id" class="kind">ts {{ sent.id }}</span>
        <span v-else class="kind warn">{{ sent.fileIds.length }} file(s), no ts</span>
      </div>

      <p v-if="isUpload" class="hint">
        This one is an upload, so there is no address for <code>chat.update</code>. Press
        <strong>Edit it</strong> to see the refusal. <strong>Delete it</strong> works anyway: it
        takes <code>files.delete</code> instead, and the message goes with the file.
      </p>
      <p v-else class="hint">
        The <code>ts</code> is both the id and the sort key, and it is what a thread reply points
        at. An edit sends the blocks along again, because <code>chat.update</code> drops them when
        only text arrives.
      </p>

      <label>
        New text
        <input v-model="editText" />
      </label>

      <div class="row">
        <button type="button" :disabled="pending" @click="change('edit')">Edit it</button>
        <button type="button" class="ghost" :disabled="pending" @click="change('delete')">
          Delete it
        </button>
      </div>
    </div>

    <!-- Receiving ---------------------------------------------------------- -->

    <details class="zone" open>
      <summary>
        Receiving
        <span class="dot" :class="connected ? 'on' : 'off'" />
        <span class="mono lower">{{ connected ? 'stream open' : 'no stream' }}</span>
      </summary>

      <div class="zone-body">
        <p class="hint">
          Events API, so Slack has to reach you: paste
          <code>https://your-tunnel{{ info?.route }}</code> into <em>Event Subscriptions</em>. The
          signature is checked against the signing secret, the challenge is answered, and the ack
          goes out inside Slack's <strong>three second</strong> deadline before your handler runs.
        </p>

        <p class="hint">
          If nothing ever arrives, check that <strong>Socket Mode is off</strong>. With it on Slack
          delivers nothing over HTTP at all.
        </p>

        <MessageFeed
          :messages="messages"
          empty="Nothing yet. Write in a channel your app is in, or mention the bot."
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

/* An upload is not a failure, but it is a message you cannot come back to. */
.kind.warn {
  background: #fff4d6;
  color: var(--warn);
}

.lower {
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
}
</style>
