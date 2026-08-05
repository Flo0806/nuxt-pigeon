<script setup lang="ts">
/**
 * Everything Discord, in one file: sending, attachments and spoilers, embeds that
 * point at an attachment, editing with its attachment rule, deleting.
 *
 * No receiving section, and that is not an omission. A webhook can only send.
 * Reading a channel needs the Gateway, a WebSocket held open, plus the privileged
 * MESSAGE_CONTENT intent, so it cannot run on a serverless deployment at all.
 */

// --- sending ---------------------------------------------------------------

const LIMIT = 2000

const text = ref('*Deploy failed* on `main`')
const escape = ref(false)
const mediaUrl = ref('')
const mediaOk = ref(true)
const alt = ref('The failing step')
const spoiler = ref(false)
const withEmbed = ref(false)
const pending = ref(false)
const error = ref('')

/** What `send` handed back. `attachmentIds` is the half people forget. */
const sent = ref<{ id: string; attachmentIds: string[]; sent?: string } | null>(null)

const tooLong = computed(() => text.value.length > LIMIT)

async function send() {
  pending.value = true
  error.value = ''
  sent.value = null

  const answer = await $fetch('/api/discord', {
    method: 'POST',
    body: {
      text: text.value,
      escape: escape.value,
      mediaUrl: mediaUrl.value,
      alt: alt.value,
      spoiler: spoiler.value,
      withEmbed: withEmbed.value,
    },
  })

  pending.value = false

  if (!answer.ok) {
    error.value = answer.error
    return
  }

  sent.value = {
    id: answer.id!,
    attachmentIds: answer.attachmentIds ?? [],
    sent: answer.sent ?? undefined,
  }
}

// --- editing and deleting --------------------------------------------------

const editText = ref('Deploy fixed')
const editMediaUrl = ref('')
const editMediaOk = ref(true)
const keepImages = ref(true)

/**
 * What the request will carry. Discord drops **every** attachment the `attachments`
 * array does not name, so a text only edit would empty the message of its images.
 * The channel turns that around, and this line says what it is about to do.
 */
const plan = computed(() => {
  if (!sent.value) return ''
  if (!keepImages.value) return 'attachments: [] · the images are removed'
  if (editMediaUrl.value) return 'the old ids plus the new file'

  return `attachments: ${sent.value.attachmentIds.length} kept`
})

async function change(action: 'edit' | 'delete') {
  if (!sent.value) return

  pending.value = true
  error.value = ''

  const answer = await $fetch('/api/discord-edit', {
    method: 'POST',
    body: {
      action,
      id: sent.value.id,
      attachmentIds: sent.value.attachmentIds,
      text: editText.value,
      mediaUrl: editMediaUrl.value,
      keepImage: keepImages.value,
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

  if ('id' in answer && answer.id) {
    sent.value = {
      id: answer.id,
      attachmentIds: answer.attachmentIds ?? [],
      sent: answer.sent ?? undefined,
    }
  }
}
</script>

<template>
  <ChannelCard
    name="Discord"
    color="#5865f2"
    icon="discord.svg"
    hint="A webhook url, no bot. That alone carries embeds, files, polls and components."
  >
    <template #status>
      <span class="dot off" />
      <span class="hint">send only</span>
    </template>

    <!-- Sending ------------------------------------------------------------ -->

    <form @submit.prevent="send">
      <label>
        Text
        <textarea v-model="text" rows="2" />
      </label>

      <p class="hint">
        {{ text.length }} of {{ LIMIT }} characters.
        <span v-if="tooLong" class="fail">Too long, the channel refuses this before sending.</span>
      </p>

      <label class="inline">
        <input v-model="escape" type="checkbox" />
        Run it through <code>escapeMarkdown</code> first
      </label>

      <MediaUrl v-model="mediaUrl" v-model:valid="mediaOk" />

      <template v-if="mediaUrl">
        <label>
          Alt text
          <input v-model="alt" />
        </label>

        <label class="inline">
          <input v-model="spoiler" type="checkbox" />
          Spoiler, hidden behind a click
        </label>

        <p class="hint">
          Discord takes <strong>no url</strong> for an attachment, so this is fetched and sent as
          multipart. A spoiler works <strong>only</strong> that way, through a
          <code>SPOILER_</code> filename, never through an image url in an embed.
        </p>
      </template>

      <label class="inline">
        <input v-model="withEmbed" type="checkbox" />
        Wrap it in an embed that points at the attachment
      </label>

      <button type="submit" :disabled="pending || !text.trim() || tooLong || !mediaOk">
        {{ pending ? 'Sending…' : 'Send' }}
      </button>
    </form>

    <p v-if="error" class="fail">{{ error }}</p>

    <!-- Editing ------------------------------------------------------------ -->

    <div v-if="sent" class="zone linked">
      <p class="label">Change what you just sent</p>

      <div class="handle">
        <span class="mono">message {{ sent.id }}</span>
        <span class="kind">{{ sent.attachmentIds.length }} attachment(s)</span>
      </div>

      <p class="hint">
        A <code>PATCH</code> that does not name its attachments <strong>drops them</strong>. That is
        turned around here, so an edit keeps them unless you say otherwise:
        <code>{{ plan }}</code>
      </p>

      <label>
        New text
        <input v-model="editText" />
      </label>

      <MediaUrl
        v-model="editMediaUrl"
        v-model:valid="editMediaOk"
        label="Add another image, optional"
      />

      <label class="inline">
        <input v-model="keepImages" type="checkbox" />
        Keep the images that are on it
      </label>

      <div class="row">
        <button type="button" :disabled="pending || !editMediaOk" @click="change('edit')">
          Edit it
        </button>
        <button type="button" class="ghost" :disabled="pending" @click="change('delete')">
          Delete it
        </button>
      </div>
    </div>

    <!-- Receiving ---------------------------------------------------------- -->

    <p class="note">
      <strong>No receiving.</strong> A webhook can only send. Reading a channel needs the Gateway, a
      WebSocket held open plus the privileged <code>MESSAGE_CONTENT</code> intent, so it cannot run
      on a serverless deployment at all.
    </p>
  </ChannelCard>
</template>

<style scoped>
form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
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

/* Where the other cards have a receiving zone, this one says why it has none. */
.note {
  margin: 0;
  padding: 0.6rem 0.7rem;
  border-left: 3px solid var(--line);
  color: var(--muted);
  font-size: 0.8rem;
}
</style>
