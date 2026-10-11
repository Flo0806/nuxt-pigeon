<template>
  <!-- The landing page has no sidebar, so this is the way into the docs. -->
  <div class="not-prose my-8 flex flex-wrap gap-3">
    <UButton
      label="Get started"
      to="/getting-started/installation"
      size="xl"
      trailing-icon="i-lucide-arrow-right"
    />
    <UButton
      label="GitHub"
      to="https://github.com/Flo0806/nuxt-pigeon"
      target="_blank"
      size="xl"
      color="neutral"
      variant="subtle"
      icon="i-simple-icons-github"
    />
  </div>
</template>
