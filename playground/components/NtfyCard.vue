<script setup lang="ts">
/**
 * Everything ntfy, in one file. Two things make this channel different from the rest:
 *
 * - it counts **bytes**, not characters. An umlaut costs two, an emoji four
 * - an update is not a separate endpoint. Messages are tied together by a **sequence
 *   id**, and publishing again with the same one replaces the notification instead of
 *   adding a second one
 *
 * There is no receiving: the module publishes, it does not subscribe.
 */

const LIMIT = 4096

const { data: info } = await useFetch('/api/ntfy-info')

// --- sending ---------------------------------------------------------------

const text = ref('Deploy failed on main')
const title = ref('nuxt-pigeon')
const priority = ref(0)
const tags = ref('')
const click = ref('')
const mediaUrl = ref('')
const mediaOk = ref(true)
const sequenceId = ref('')
const pending = ref(false)
const error = ref('')

const sent = ref<{ topic: string; id: string } | null>(null)

/** The reason this card shows two numbers: `.length` is not what ntfy measures. */
const bytes = computed(() => new TextEncoder().encode(text.value).length)
const tooLong = computed(() => bytes.value > LIMIT)

/** Up to 64 of these characters, which is ntfy's own rule for a topic name too. */
const badSequenceId = computed(
  () => Boolean(sequenceId.value) && !/^[-_a-z0-9]{1,64}$/i.test(sequenceId.value),
)

async function send() {
  pending.value = true
  error.value = ''
  sent.value = null

  const answer = await $fetch('/api/ntfy', {
    method: 'POST',
    body: {
      text: text.value,
      title: title.value,
      priority: priority.value,
      tags: tags.value,
      click: click.value,
      mediaUrl: mediaUrl.value,
      sequenceId: sequenceId.value,
    },
  })

  pending.value = false

  if (!answer.ok) {
    error.value = answer.error
    return
  }

  if (answer.topic && answer.id) {
    sent.value = { topic: answer.topic, id: answer.id }
  }
}

// --- editing and deleting --------------------------------------------------

const editText = ref('Deploy fixed on main')
const editTitle = ref('nuxt-pigeon')

async function change(action: 'edit' | 'delete') {
  if (!sent.value) return

  pending.value = true
  error.value = ''

  const answer = await $fetch('/api/ntfy-edit', {
    method: 'POST',
    body: {
      action,
      topic: sent.value.topic,
      id: sent.value.id,
      text: editText.value,
      title: editTitle.value,
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
</script>

<template>
  <ChannelCard
    name="ntfy"
    color="#317f6f"
    icon="ntfy.svg"
    hint="Push to a phone with nothing to sign up for. Counts bytes, and can replace a notification it already sent."
  >
    <template #status>
      <span class="dot" :class="info?.topic ? 'on' : 'off'" />
      <span class="hint">{{ info?.topic ? 'topic set' : 'no topic' }}</span>
    </template>

    <!-- Sending ------------------------------------------------------------ -->

    <form @submit.prevent="send">
      <label>
        Text
        <textarea v-model="text" rows="2" />
      </label>

      <p class="hint">
        {{ text.length }} characters, <strong>{{ bytes }} bytes</strong> of {{ LIMIT }}. Type an
        umlaut and watch the two numbers drift apart: bytes is the one that counts here.
        <span v-if="tooLong" class="fail">Too long, the channel refuses this before sending.</span>
      </p>

      <div class="two">
        <label>
          Title
          <input v-model="title" />
        </label>

        <label>
          Priority
          <select v-model.number="priority">
            <option :value="0">default (3)</option>
            <option :value="1">1 min, silent</option>
            <option :value="4">4 high</option>
            <option :value="5">5 max, rings through do not disturb</option>
          </select>
        </label>
      </div>

      <div class="two">
        <label>
          Tags, comma separated
          <input v-model="tags" placeholder="warning, skull, rocket" />
        </label>

        <label>
          Click url
          <input v-model="click" placeholder="opened when tapped" />
        </label>
      </div>

      <MediaUrl v-model="mediaUrl" v-model:valid="mediaOk" />

      <p v-if="mediaUrl" class="hint">
        A url stays a url: ntfy fetches it itself and it travels as <code>attach</code>. Give bytes
        instead and the route changes completely, because then the body <strong>is</strong> the file
        and every option has to move into headers.
      </p>

      <label>
        Your own sequence id, optional
        <input v-model="sequenceId" placeholder="deploy-status" />
      </label>

      <p class="hint">
        <strong>The most useful thing ntfy has.</strong> Publish twice with the same id and the
        notification on your phone is <em>replaced</em>, not repeated. One entry that counts up
        instead of seven that pile up. Leave it empty and ntfy assigns one, which works just as well
        as a handle.
        <span v-if="badSequenceId" class="fail">
          Only letters, digits, <code>-</code> and <code>_</code>, up to 64.
        </span>
      </p>

      <button
        type="submit"
        :disabled="pending || !text.trim() || tooLong || !mediaOk || badSequenceId"
      >
        {{ pending ? 'Publishing…' : 'Publish' }}
      </button>
    </form>

    <p v-if="error" class="fail">{{ error }}</p>

    <!-- Editing ------------------------------------------------------------ -->

    <div v-if="sent" class="zone linked">
      <p class="label">Change what you just sent</p>

      <div class="handle">
        <span class="mono">topic {{ sent.topic }}</span>
        <span class="kind">id {{ sent.id }}</span>
      </div>

      <p class="hint">
        Editing is not a different endpoint here: it publishes again with the same sequence id. That
        is why <strong>every send option works</strong>, title, priority, tags and all. Needs an
        ntfy server of <strong>2.16.0</strong> or newer, and yours is <code>{{ info?.server }}</code
        >. An older one does not know the field and simply publishes a
        <strong>second</strong> notification instead of replacing the first.
      </p>

      <div class="two">
        <label>
          New text
          <input v-model="editText" />
        </label>

        <label>
          Title
          <input v-model="editTitle" />
        </label>
      </div>

      <div class="row">
        <button type="button" :disabled="pending" @click="change('edit')">Edit it</button>
        <button type="button" class="ghost" :disabled="pending" @click="change('delete')">
          Delete it
        </button>
      </div>
    </div>

    <!-- Receiving ---------------------------------------------------------- -->

    <details class="zone">
      <summary>
        Receiving
        <span class="dot off" />
        <span class="mono lower">not offered</span>
      </summary>

      <div class="zone-body">
        <p class="hint">
          ntfy can be listened to, over SSE or a long poll on <code>/&lt;topic&gt;/json</code>, but
          that is a process that has to stay alive. It is not in the module yet, and the honest
          reason is that nobody has asked. The publishing side is complete.
        </p>

        <p class="hint">
          Worth knowing either way: on a public instance <strong>a topic is a password</strong>.
          Anyone who knows the name can read along, and publish to it.
        </p>
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

.two > label {
  flex: 1 1 12rem;
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

.lower {
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
}
</style>
