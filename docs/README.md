# Documentation

The documentation site for [nuxt-pigeon](../), built with Nuxt Content and Nuxt UI.

```bash
pnpm run dev:docs     # from the repository root, on port 3001
pnpm run docs:build
```

Pages live in `content/`, one feature per page. The shape is deliberate and worth
keeping to:

1. **Copy this** - everything needed, in order, ending in something that runs
2. **What just happened** - so it is not magic
3. **Every option** - a table, linked to the service's own reference
4. **What will cost you an hour** - the traps, named
5. **Read more** - the real API docs

Nothing is written from memory. Every limit, option name and error message on these
pages was checked against `src/` or the service's documentation, and the quotes are
verbatim with a link.
