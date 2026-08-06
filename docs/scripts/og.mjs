import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * One social card per page, rendered in headless Chrome from `og-template.html`.
 *
 * Generated ahead of time and committed rather than rendered on request: a card is
 * fetched by a crawler, often before the site has warmed up, and a static file cannot
 * time out. It also keeps the runtime free of a browser.
 *
 * Run it with `pnpm run og` after adding or renaming a page.
 */

const here = dirname(fileURLToPath(import.meta.url))
const contentDir = resolve(here, '../content')
const outDir = resolve(here, '../public/og')
const template = readFileSync(join(here, 'og-template.html'), 'utf8')

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']

function chrome() {
  for (const path of CHROME) {
    try {
      statSync(path)

      return path
    } catch {
      // Next candidate.
    }
  }

  throw new Error(`No Chrome found. Looked in: ${CHROME.join(', ')}`)
}

/** `content/4.channels/1.telegram.md` becomes `/channels/telegram`. */
function routeOf(file) {
  const path = file
    .slice(contentDir.length + 1)
    .replace(/\.md$/, '')
    .split('/')
    .map((part) => part.replace(/^\d+\./, ''))
    .join('/')

  return path === 'index' ? '/' : `/${path}`
}

/** The frontmatter, without pulling a parser in for two fields. */
function meta(raw) {
  const block = raw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''
  const read = (key) =>
    block
      .match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1]
      ?.trim()
      .replace(/^['"]|['"]$/g, '') ?? ''

  return { title: read('title'), description: read('description') }
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)

    if (entry.isDirectory()) return walk(full)

    return entry.name.endsWith('.md') ? [full] : []
  })
}

/** Anything that would need escaping in HTML, because titles are ours but not fixed. */
function escapeHtml(text) {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  )
}

/**
 * A meta description aims at a search result, roughly 155 characters. On a card that
 * is four lines and it starts fighting the footer, so it is cut at a word.
 */
function shorten(text, limit = 118) {
  if (text.length <= limit) return text

  return `${text.slice(0, text.lastIndexOf(' ', limit))}…`
}

const SECTIONS = {
  'getting-started': 'Getting started',
  sending: 'Sending',
  receiving: 'Receiving',
  channels: 'Channels',
  reliability: 'Reliability',
}

const browser = chrome()
const temp = resolve(here, '.og-tmp')

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
rmSync(temp, { recursive: true, force: true })
mkdirSync(temp, { recursive: true })

// The template loads the logo relatively, so it has to sit next to the html.
writeFileSync(join(temp, 'logo.svg'), readFileSync(resolve(here, '../public/logo.svg')))

for (const file of walk(contentDir)) {
  const route = routeOf(file)
  const { title, description } = meta(readFileSync(file, 'utf8'))
  const section = SECTIONS[route.split('/')[1]] ?? 'Documentation'
  const name = route === '/' ? 'index' : route.slice(1).replaceAll('/', '-')

  const html = template
    .replace(
      '<h1 id="title">Title</h1>',
      `<h1 id="title"${title.length > 22 ? ' class="long"' : ''}>${escapeHtml(title)}</h1>`,
    )
    .replace(
      '<p id="description"></p>',
      `<p id="description">${escapeHtml(shorten(description))}</p>`,
    )
    .replace('<span id="section">Documentation</span>', `<span id="section">${section}</span>`)

  const page = join(temp, `${name}.html`)
  writeFileSync(page, html)

  execFileSync(
    browser,
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=1200,630',
      `--screenshot=${join(outDir, `${name}.png`)}`,
      `file://${page}`,
    ],
    { stdio: 'ignore' },
  )

  console.log(`${route}  →  public/og/${name}.png`)
}

rmSync(temp, { recursive: true, force: true })
console.log('\nDone. Commit public/og, it is served as is.')
