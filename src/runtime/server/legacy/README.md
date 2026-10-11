# legacy/

Server code for Nuxt < 4.6 (nitropack v2, h3 v1), which has no `nuxt/server`. The tree
mirrors `runtime/server/`, and nothing outside this folder imports from it.

To drop Nuxt < 4.6:

1. Delete this folder.
2. Remove every `nitro2:` key in `src/module.ts`.
3. Point `#pigeon/config` straight at `runtime/server/core/config`.
