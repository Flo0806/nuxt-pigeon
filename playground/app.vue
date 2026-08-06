<template>
  <main>
    <header>
      <h1>nuxt-pigeon</h1>
      <p class="hint">
        Every channel the module speaks, one card each: send, change what you sent, and receive. The
        awkward parts of each service are spelled out rather than hidden, because those are the
        parts that cost an evening when you meet them for the first time.
      </p>
    </header>

    <TelegramCard />
    <DiscordCard />
    <SlackCard />
    <NtfyCard />
    <MastodonCard />
    <BlueskyCard />
    <WebhookCard />
    <RetryCard />
  </main>
</template>

<style scoped>
main {
  display: flex;
  max-width: 40rem;
  flex-direction: column;
  margin: 3rem auto;
  gap: 1.5rem;
  padding: 0 1rem;
}

header {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
