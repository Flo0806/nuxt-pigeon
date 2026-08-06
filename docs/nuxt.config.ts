export default defineNuxtConfig({
  modules: ['@nuxt/content', '@nuxt/ui'],
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2024-04-03',

  /**
   * The one thing to change before going live: canonical links, the sitemap and every
   * social card url are built from this. Override it per environment with
   * `NUXT_PUBLIC_SITE_URL`.
   */
  runtimeConfig: {
    public: {
      siteUrl: 'https://pigeon.fh-softdev.de',
    },
  },

  // The sidebar and the search are built from the content tree, so the tree has to
  // be readable without a build step in development.
  content: {
    build: {
      markdown: {
        toc: { depth: 3, searchDepth: 3 },
        highlight: {
          langs: ['bash', 'ts', 'js', 'vue', 'json', 'yaml', 'ini', 'md'],
        },
      },
    },
  },
})
