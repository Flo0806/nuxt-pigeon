<script setup lang="ts">
import {
  BLUESKY_BYTE_LIMIT,
  BLUESKY_GRAPHEME_LIMIT,
  byteLength,
  detectRanges,
  graphemeLength,
} from '../../src/runtime/server/channels/bluesky/format'

/**
 * Everything Bluesky, in one file. The channel with the most to show and the fewest
 * verbs, because three of its rules have no equivalent anywhere else:
 *
 * - **two** limits at once, and `.length` is neither of them
 * - it links **nothing** on its own. A url stays plain text unless a facet points at
 *   it, with byte offsets rather than character positions
 * - a post carries **one** embed, so images and a link card compete for the same slot
 *
 * And there is no `edit`, which is not a gap here. See the delete zone.
 */

const { data: info } = await useFetch('/api/bluesky-info')
const { data: pollers, refresh: refreshPollers } = await useFetch('/api/pollers')

// --- sending ---------------------------------------------------------------

const text = ref('Release 1.0 is out: https://example.com #nuxt')
const facets = ref(true)
const mediaUrl = ref('')
const mediaOk = ref(true)
const alt = ref('A screenshot')
const cardUrl = ref('')
const cardTitle = ref('nuxt-pigeon')
const cardDescription = ref('Nothing here is read from the linked page.')
const pending = ref(false)
const error = ref('')
const url = ref('')

const sent = ref<{ repo: string; collection: string; rkey: string } | null>(null)

/** Both apply, and neither is `text.length`. Emoji move them apart fastest. */
const graphemes = computed(() => graphemeLength(text.value))
const bytes = computed(() => byteLength(text.value))
const tooLong = computed(
  () => graphemes.value > BLUESKY_GRAPHEME_LIMIT || bytes.value > BLUESKY_BYTE_LIMIT,
)

/** What would be linked and where. Computed here, nothing is sent for it. */
const ranges = computed(() => detectRanges(text.value))
const found = computed(
  () => ranges.value.links.length + ranges.value.tags.length + ranges.value.mentions.length,
)

/** Both filled is allowed, and the channel then says in the server log what it did. */
const conflict = computed(() => Boolean(mediaUrl.value && cardUrl.value))

async function post() {
  pending.value = true
  error.value = ''
  sent.value = null
  url.value = ''

  const answer = await $fetch('/api/bluesky', {
    method: 'POST',
    body: {
      text: text.value,
      facets: facets.value,
      mediaUrl: mediaUrl.value,
      alt: alt.value,
      cardUrl: cardUrl.value,
      cardTitle: cardTitle.value,
      cardDescription: cardDescription.value,
    },
  })

  pending.value = false

  if (!answer.ok) {
    error.value = answer.error
    return
  }

  url.value = answer.url ?? ''
  if (answer.repo && answer.rkey) {
    sent.value = { repo: answer.repo, collection: answer.collection, rkey: answer.rkey }
  }
}

// --- deleting --------------------------------------------------------------

async function remove() {
  if (!sent.value) return

  pending.value = true
  error.value = ''

  const answer = await $fetch('/api/bluesky-delete', { method: 'POST', body: sent.value })

  pending.value = false

  if (!answer.ok) {
    error.value = answer.error
    return
  }

  sent.value = null
  url.value = ''
}

// --- receiving -------------------------------------------------------------

const { messages, connected } = usePigeon({ channel: 'bluesky', limit: 20 })
</script>

<template>
  <ChannelCard
    name="Bluesky"
    color="#0085ff"
    icon="bluesky.svg"
    hint="Broadcast, and always public. Counts graphemes and bytes, links nothing by itself, and carries exactly one embed."
  >
    <template #status>
      <span class="dot" :class="info?.password ? 'on' : 'off'" />
      <span class="hint">{{ info?.password ? 'app password set' : 'no app password' }}</span>
    </template>

    <!-- Sending ------------------------------------------------------------ -->

    <form @submit.prevent="post">
      <label>
        Text
        <textarea v-model="text" rows="3" />
      </label>

      <p class="hint">
        {{ text.length }} in the string,
        <strong :class="graphemes > BLUESKY_GRAPHEME_LIMIT ? 'fail' : ''">
          {{ graphemes }} graphemes </strong
        >of {{ BLUESKY_GRAPHEME_LIMIT }},
        <strong :class="bytes > BLUESKY_BYTE_LIMIT ? 'fail' : ''"> {{ bytes }} bytes </strong>of
        {{ BLUESKY_BYTE_LIMIT }}. Paste a family emoji and all three numbers disagree: it is one
        grapheme, several code points, and a lot of bytes.
      </p>

      <label class="inline">
        <input v-model="facets" type="checkbox" />
        Detect facets, so links, tags and mentions become clickable
      </label>

      <template v-if="facets">
        <p class="hint">
          Bluesky linkifies <strong>nothing</strong> on its own. Every client computes this before
          posting, so the channel does too. The offsets are <strong>bytes, not characters</strong>,
          which is why an umlaut earlier in the line shifts them. Turn this off and the same text
          goes out as dead plain text.
        </p>

        <p class="hint">{{ found }} would be linked:</p>
        <pre>{{ JSON.stringify(ranges, null, 2) }}</pre>
      </template>

      <MediaUrl v-model="mediaUrl" v-model:valid="mediaOk" />

      <label v-if="mediaUrl">
        Alt text
        <input v-model="alt" />
      </label>

      <p v-if="mediaUrl" class="hint">
        Bluesky takes <strong>no url</strong>, so this is fetched and uploaded as a blob, and a blob
        may be <strong>about 1 MB</strong>. A normal screenshot is three to five times that.
        Official clients resize first, we do not: resizing would be a decision about your content,
        and a dependency. You get the real number in the refusal instead.
      </p>

      <label>
        Link card for this address, empty attaches the image on its own
        <input v-model="cardUrl" placeholder="https://nuxt.fyi" />
      </label>

      <template v-if="cardUrl">
        <div class="two">
          <label>
            Card title
            <input v-model="cardTitle" />
          </label>

          <label>
            Card description
            <input v-model="cardDescription" />
          </label>
        </div>

        <p class="hint">
          Change these two and look at the post: the card shows exactly what you typed. Bluesky
          reads <strong>nothing</strong> from the linked page, there is no unfurling here.
        </p>
      </template>

      <p v-if="conflict" class="hint warn">
        Both are filled, and that is allowed. A post carries <strong>one</strong> embed, so the
        channel decides and <strong>says so in the server terminal</strong>: the card wins and your
        image becomes its thumbnail. Refusing the whole post would be worse, doing it silently would
        be worst.
      </p>

      <button type="submit" :disabled="pending || !text.trim() || tooLong || !mediaOk">
        {{ pending ? 'Posting…' : 'Post publicly' }}
      </button>
    </form>

    <p v-if="error" class="fail">{{ error }}</p>
    <p v-if="url">
      <a :href="url" target="_blank">{{ url }}</a>
    </p>

    <!-- Deleting ----------------------------------------------------------- -->

    <div v-if="sent" class="zone linked">
      <p class="label">Remove what you just posted</p>

      <div class="handle">
        <span class="mono">{{ sent.collection }}</span>
        <span class="kind">rkey {{ sent.rkey }}</span>
      </div>

      <p class="hint">
        <strong>Only deleting, and there is no edit.</strong> Not because it is missing here:
        <code>putRecord</code> on a post answers with a 200 and the appview ignores the change, so
        an edit would look like it worked and do nothing. The refusal is in the types, and
        <code>bluesky.edit</code> does not exist.
      </p>

      <p class="hint">
        The handle is an <code>at://</code> uri taken apart. Deleting is idempotent, so pressing
        this twice is not an error, unlike Discord where the second try is a 404.
      </p>

      <button type="button" class="ghost" :disabled="pending" @click="remove">Delete it</button>
    </div>

    <!-- Receiving ---------------------------------------------------------- -->

    <details class="zone" open>
      <summary>
        Receiving
        <span class="dot" :class="pollers?.bluesky ? 'on' : 'off'" />
        <span class="mono lower">{{ pollers?.bluesky ? 'poller running' : 'no poller' }}</span>
        <button type="button" class="ghost small" @click="refreshPollers()">Check</button>
      </summary>

      <div class="zone-body">
        <p class="hint">
          <strong>Polled, not pushed.</strong> There is no webhook, so this needs a process that
          stays alive and does not work on serverless. The cursor pages
          <strong>backwards into history</strong>, so finding what is new means fetching the newest
          page and comparing, not asking for everything since a marker.
        </p>

        <p class="hint">
          The stream to this page is
          <strong :class="connected ? 'ok' : 'fail'">{{ connected ? 'open' : 'closed' }}</strong
          >. Poller and stream fail separately, and a closed stream on a development tunnel is
          usually the tunnel: quick tunnels throttle server sent events.
        </p>

        <MessageFeed
          :messages="messages"
          empty="Nothing yet. Have someone like, follow or mention you."
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

/* Not a failure. Something will be dropped, and you should know before pressing. */
.warn {
  padding: 0.5rem 0.6rem;
  border-radius: var(--radius-sm);
  background: #fff4d6;
  color: var(--warn);
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

pre {
  max-height: 12rem;
  overflow: auto;
}
</style>
