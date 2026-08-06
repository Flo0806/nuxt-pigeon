import { defineContentConfig, defineCollection } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    // One collection, `docs`, so the navigation and the search both come from the
    // same tree and never disagree about what exists.
    docs: defineCollection({
      type: 'page',
      source: '**/*.md',
    }),
  },
})
