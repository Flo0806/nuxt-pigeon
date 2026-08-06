<script setup lang="ts">
import { countCharacters } from '../../src/runtime/server/channels/mastodon/format'

/**
 * Everything Mastodon, in one file. A **broadcast** channel, so the verb is `post` and
 * not `send`, and what goes out is public unless you say otherwise.
 *
 * Two things are worth watching here:
 *
 * - the character count is **not** `.length`. A link costs a flat 23 whatever its
 *   length, and the domain of a remote mention costs nothing
 * - the limit is per instance. 500 is only the default, so the card asks yours
 */

const { data: info } = await useFetch('/api/mastodon-info')
const { data: pollers, refresh: refreshPollers } = await useFetch('/api/pollers')

// --- sending ---------------------------------------------------------------

const text = ref('Release 1.0 is out: https://example.com/a/very/long/path/that/still/costs/23')
const visibility = ref('direct')
const spoiler = ref('')
const mediaUrl = ref('')
const mediaOk = ref(true)
const pending = ref(false)
const error = ref('')
const url = ref('')

const sent = ref<{ id: string; mediaIds: string[] } | null>(null)

/** The same function the channel uses, so this is the number that decides. */
const counted = computed(() =>
  countCharacters(text.value, {
    maxCharacters: info.value?.limits.maxCharacters ?? 500,
    charactersReservedPerUrl: info.value?.limits.charactersReservedPerUrl ?? 23,
  }),
)

const limit = computed(() => info.value?.limits.maxCharacters ?? 500)
const tooLong = computed(() => counted.value > limit.value)

async function post() {
  pending.value = true
  error.value = ''
  sent.value = null
  url.value = ''

  const answer = await $fetch('/api/mastodon', {
    method: 'POST',
    body: {
      text: text.value,
      visibility: visibility.value,
      spoilerText: spoiler.value,
      mediaUrl: mediaUrl.value,
    },
  })

  pending.value = false

  if (!answer.ok) {
    error.value = answer.error
    return
  }

  url.value = answer.url ?? ''
  if (answer.id) {
    sent.value = { id: answer.id, mediaIds: answer.mediaIds ?? [] }
  }
}

// --- editing and deleting --------------------------------------------------

const editText = ref('Release 1.0 is out, now with one typo less')
const editMediaUrl = ref('')
const editMediaOk = ref(true)
const keepImages = ref(true)
const redraft = ref('')

/** What the attachments will look like afterwards, spelled out before you press. */
const plan = computed(() => {
  if (!keepImages.value) return 'media: [] → detaches everything'
  if (editMediaUrl.value) return 'media: [one more] → the old ones stay, this is added'

  return 'no media → media_ids is left out, so nothing is touched'
})

async function change(action: 'edit' | 'delete') {
  if (!sent.value) return

  pending.value = true
  error.value = ''
  redraft.value = ''

  const answer = await $fetch('/api/mastodon-edit', {
    method: 'POST',
    body: {
      action,
      id: sent.value.id,
      mediaIds: sent.value.mediaIds,
      text: editText.value,
      mediaUrl: editMediaUrl.value,
      keepImages: keepImages.value,
    },
  })

  pending.value = false

  if (!answer.ok) {
    error.value = answer.error
    return
  }

  if (action === 'delete') {
    sent.value = null
    url.value = ''
    redraft.value = ('redraft' in answer && answer.redraft) || ''
    return
  }

  if ('id' in answer && answer.id) {
    sent.value = { id: answer.id, mediaIds: answer.mediaIds ?? [] }
    url.value = answer.url ?? url.value
  }
}

// --- receiving -------------------------------------------------------------

const { messages, connected } = usePigeon({ channel: 'mastodon', limit: 20 })
</script>

<template>
  <ChannelCard
    name="Mastodon"
    color="#6364ff"
    icon="mastodon.svg"
    hint="Broadcast, so the verb is post. Public unless you pick otherwise, and the limits come from your instance."
  >
    <template #status>
      <span class="dot" :class="info?.token ? 'on' : 'off'" />
      <span class="hint">{{ info?.instance || 'no instance' }}</span>
    </template>

    <!-- Sending ------------------------------------------------------------ -->

    <form @submit.prevent="post">
      <label>
        Text
        <textarea v-model="text" rows="3" />
      </label>

      <p class="hint">
        {{ text.length }} raw characters, <strong>{{ counted }} counted</strong> of {{ limit }}. A
        link costs a flat <strong>23</strong> whatever its length, and the domain of a remote
        mention costs nothing. Shorten the url in the text and watch only the left number move.
        <span v-if="tooLong" class="fail">Too long, the channel refuses this before posting.</span>
      </p>

      <p v-if="!info?.reachable" class="hint">
        Your instance could not be asked for its limits, so these are Mastodon's defaults. The
        channel behaves the same way: it falls back rather than blocking, and the instance decides
        in the end anyway.
      </p>

      <div class="two">
        <label>
          Visibility
          <select v-model="visibility">
            <option value="direct">direct, only mentioned accounts</option>
            <option value="private">private, followers only</option>
            <option value="unlisted">unlisted, not in public timelines</option>
            <option value="">public, the instance default</option>
          </select>
        </label>

        <label>
          Content warning
          <input v-model="spoiler" placeholder="collapses the post behind this" />
        </label>
      </div>

      <MediaUrl v-model="mediaUrl" v-model:valid="mediaOk" />

      <p v-if="mediaUrl" class="hint">
        Mastodon takes <strong>no url</strong>, so this one is really downloaded and uploaded again.
        A large file answers <code>202</code> while it is still being processed, and the post waits
        for that instead of failing.
      </p>

      <button type="submit" :disabled="pending || !text.trim() || tooLong || !mediaOk">
        {{ pending ? 'Posting…' : 'Post' }}
      </button>
    </form>

    <p v-if="error" class="fail">{{ error }}</p>
    <p v-if="url">
      <a :href="url" target="_blank">{{ url }}</a>
    </p>

    <!-- Editing ------------------------------------------------------------ -->

    <div v-if="sent" class="zone linked">
      <p class="label">Change what you just posted</p>

      <div class="handle">
        <span class="mono">status {{ sent.id }}</span>
        <span class="kind">{{ sent.mediaIds.length }} attachment(s)</span>
      </div>

      <p class="hint">
        Everyone sees that it changed: Mastodon keeps a version history and clients show an
        <strong>edited</strong> marker. This is not a quiet fix.
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

      <p class="hint">
        Whether leaving <code>media_ids</code> out keeps or drops the attachments is
        <strong>not in the docs</strong>. It is in the source: the update only touches them when the
        field is present, which is the exact opposite of Discord's rule. For you it reads the same
        either way: <code>{{ plan }}</code>
      </p>

      <div class="row">
        <button type="button" :disabled="pending || !editMediaOk" @click="change('edit')">
          Edit it
        </button>
        <button type="button" class="ghost" :disabled="pending" @click="change('delete')">
          Delete it
        </button>
      </div>
    </div>

    <div v-if="redraft" class="zone">
      <p class="label">What deleting handed back</p>
      <p class="hint">
        A <code>DELETE</code> here is not an empty 204. Mastodon answers with the deleted status,
        plain text included, so a client can offer <strong>delete and redraft</strong>. Its
        attachments are kept for about 24 hours so they can go into the new post.
      </p>
      <pre>{{ redraft }}</pre>
    </div>

    <!-- Receiving ---------------------------------------------------------- -->

    <details class="zone" open>
      <summary>
        Receiving
        <span class="dot" :class="pollers?.mastodon ? 'on' : 'off'" />
        <span class="mono lower">{{ pollers?.mastodon ? 'poller running' : 'no poller' }}</span>
        <button type="button" class="ghost small" @click="refreshPollers()">Check</button>
      </summary>

      <div class="zone-body">
        <p class="hint">
          <strong>Polled, not pushed.</strong> There is no webhook for your own account, so this
          needs a process that stays alive and does not work on serverless. The first round only
          marks where we are, so trigger something <strong>after</strong> the server started.
        </p>

        <p class="hint">
          Two things have to work for anything to show up below, and they fail separately: the
          poller on the server, and the stream to this page. The stream is
          <strong :class="connected ? 'ok' : 'fail'">{{ connected ? 'open' : 'closed' }}</strong
          >. A closed one usually means a development tunnel: quick tunnels throttle server sent
          events, so open the page on <code>localhost</code> and keep the tunnel for incoming
          traffic only.
        </p>

        <p class="hint">
          Mastodon never notifies you about your own doing, so a second account has to mention or
          follow you. Polling uses <code>min_id</code> and not <code>since_id</code>: the first
          walks forward from what you hold, the second returns the newest and silently drops
          whatever did not fit.
        </p>

        <MessageFeed
          :messages="messages"
          empty="Nothing yet. Have another account mention or follow you."
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

.small {
  padding: 0.1rem 0.5rem;
  font-size: 0.75rem;
}
</style>
