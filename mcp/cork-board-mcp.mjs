#!/usr/bin/env node
/**
 * Cork Board MCP server — zero-dependency Node >=18 stdio bridge.
 *
 * Speaks the MCP stdio transport: newline-delimited JSON-RPC 2.0 on
 * stdin/stdout (NOT Content-Length framed): initialize /
 * notifications/initialized / tools/list / tools/call / ping.
 *
 * HEADLESS wrapper around a Cork Board project. Instead of driving the
 * desktop GUI, every tool reads and writes the Cork Board project JSON
 * directly on disk (the same shape the app exports as JSON and re-imports
 * via Export -> Import). An agent can build a wall, add acts and scene index
 * cards, tag cast/places/labels, track arc beats, apply the production
 * presets, and export the app's own outputs (outline, scene list, Fountain
 * scaffold, JSON, printable Share Wall) — all without opening the app.
 *
 * Uses only Node built-ins (fs, path, os, crypto) — run directly with `node`.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve, isAbsolute } from 'node:path'
import { homedir, platform } from 'node:os'
import { randomUUID } from 'node:crypto'

const PROTOCOL_VERSION = '2024-11-05'
const SCHEMA_VERSION = 1

/* ------------------------- project location ----------------------------- */

// Mirror Electron's app.getPath('appData') + userData ("cork-board").
function appDataDir() {
  const home = homedir()
  if (platform() === 'darwin') return join(home, 'Library', 'Application Support')
  if (platform() === 'win32') return process.env.APPDATA || join(home, 'AppData', 'Roaming')
  return process.env.XDG_CONFIG_HOME || join(home, '.config')
}

const DEFAULT_PROJECT = join(appDataDir(), 'cork-board', 'cork-board-project.json')

// Resolve the project file: explicit arg > CORK_BOARD_PROJECT env > default.
function resolveProjectPath(args) {
  const raw = (args && args.projectPath) || process.env.CORK_BOARD_PROJECT || DEFAULT_PROJECT
  const expanded = raw.startsWith('~') ? join(homedir(), raw.slice(1)) : raw
  return isAbsolute(expanded) ? expanded : resolve(expanded)
}

/* ---------------------------- model constants --------------------------- */

const PAPERS = ['white', 'cream', 'yellow', 'pink', 'blue', 'green', 'lavender']
const STATUSES = [
  { id: 'idea', name: 'Idea' },
  { id: 'outlined', name: 'Outlined' },
  { id: 'drafted', name: 'Drafted' },
  { id: 'revised', name: 'Revised' },
  { id: 'locked', name: 'Locked' },
  { id: 'cut', name: 'Cut' }
]
const STATUS_IDS = STATUSES.map((s) => s.id)
const INT_EXT = ['', 'INT', 'EXT', 'INT/EXT']
const TIMES_OF_DAY = ['', 'DAY', 'NIGHT', 'DAWN', 'DUSK', 'MAGIC HOUR', 'LATER', 'CONTINUOUS']
const LOCATION_KINDS = ['INT', 'EXT', 'INT/EXT']
const ENTITY_COLORS = [
  '#287d8e', '#d89124', '#b95a4c', '#6d5a86', '#6d8f73',
  '#4a6fa5', '#a3593b', '#3f3f3f', '#8a6d9e', '#4e8076'
]
const COLUMN_ACCENTS = [
  '#287d8e', '#d89124', '#6d8f73', '#b95a4c', '#6d5a86', '#4a6fa5', '#a3593b', '#3f3f3f'
]

function now() { return new Date().toISOString() }
function uid(prefix) { return `${prefix}_${randomUUID().slice(0, 8)}` }
function statusById(id) { return STATUSES.find((s) => s.id === id) || STATUSES[0] }

function formatPages(total) {
  const rounded = Math.round(total * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/* ---------------------------- project model ----------------------------- */

function makeCard(partial = {}) {
  return {
    id: uid('card'),
    title: '',
    synopsis: '',
    notes: '',
    paper: 'white',
    labelIds: [],
    characterIds: [],
    locationId: '',
    intExt: '',
    timeOfDay: '',
    status: 'idea',
    pages: '',
    due: '',
    checklist: [],
    arcNotes: {},
    createdAt: now(),
    updatedAt: now(),
    ...partial
  }
}

function makeColumn(title, accent, cards = []) {
  return { id: uid('col'), title, accent: accent || COLUMN_ACCENTS[0], collapsed: false, cards }
}

function makeBoard(title, columns = []) {
  return { id: uid('board'), title, columns }
}

function createBlankProject(title = 'Untitled production', type = 'blank') {
  const board = makeBoard('Main Wall', [
    makeColumn('Ideas', COLUMN_ACCENTS[7]),
    makeColumn('Act I', COLUMN_ACCENTS[0]),
    makeColumn('Act II', COLUMN_ACCENTS[1]),
    makeColumn('Act III', COLUMN_ACCENTS[2])
  ])
  return {
    schema: SCHEMA_VERSION,
    id: uid('proj'),
    title,
    type,
    createdAt: now(),
    updatedAt: now(),
    boards: [board],
    activeBoardId: board.id,
    cards: {},
    characters: [],
    locations: [],
    labels: []
  }
}

// Faithful port of the app's normalizeProject: fill defaults, repair the
// board/column/card graph, and prune orphaned cards so a project written here
// opens cleanly in Cork Board.
function normalizeProject(raw) {
  const base = createBlankProject()
  const project = { ...base, ...raw }
  project.schema = SCHEMA_VERSION
  if (!Array.isArray(project.boards) || project.boards.length === 0) {
    project.boards = base.boards
  }
  project.boards = project.boards.map((board) => ({
    id: board.id || uid('board'),
    title: board.title || 'Untitled board',
    columns: (board.columns || []).map((column) => ({
      id: column.id || uid('col'),
      title: column.title || 'Untitled column',
      accent: column.accent || COLUMN_ACCENTS[0],
      collapsed: Boolean(column.collapsed),
      cards: Array.isArray(column.cards) ? column.cards.filter((id) => typeof id === 'string') : []
    }))
  }))
  project.cards = project.cards && typeof project.cards === 'object' ? project.cards : {}
  for (const [id, card] of Object.entries(project.cards)) {
    project.cards[id] = { ...makeCard(), ...card, id }
  }
  const referenced = new Set()
  for (const board of project.boards) {
    for (const column of board.columns) {
      column.cards = column.cards.filter((id) => project.cards[id])
      column.cards.forEach((id) => referenced.add(id))
    }
  }
  for (const id of Object.keys(project.cards)) {
    if (!referenced.has(id)) delete project.cards[id]
  }
  project.characters = Array.isArray(project.characters) ? project.characters : []
  project.locations = Array.isArray(project.locations) ? project.locations : []
  project.labels = Array.isArray(project.labels) ? project.labels : []
  if (!project.boards.find((b) => b.id === project.activeBoardId)) {
    project.activeBoardId = project.boards[0].id
  }
  return project
}

function loadProject(path) {
  if (!existsSync(path)) {
    const err = new Error(`No Cork Board project at ${path}. Call create_project (or apply_preset) first, or pass projectPath / set CORK_BOARD_PROJECT.`)
    err.userFacing = true
    throw err
  }
  return normalizeProject(JSON.parse(readFileSync(path, 'utf-8')))
}

function saveProject(path, project) {
  project.updatedAt = now()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(project, null, 2))
}

/* ------------------------------ lookups --------------------------------- */

function boardById(project, id) {
  return project.boards.find((b) => b.id === id) || null
}

function activeBoard(project) {
  return boardById(project, project.activeBoardId) || project.boards[0]
}

// Resolve an act (column) by id anywhere in the project, or by title within a board.
function findAct(project, { actId, actTitle, boardId } = {}) {
  if (actId) {
    for (const board of project.boards) {
      const column = board.columns.find((c) => c.id === actId)
      if (column) return { board, column }
    }
    return null
  }
  if (actTitle) {
    const boards = boardId ? project.boards.filter((b) => b.id === boardId) : project.boards
    for (const board of boards) {
      const column = board.columns.find((c) => c.title === actTitle)
      if (column) return { board, column }
    }
  }
  return null
}

function findCardHome(project, cardId) {
  for (const board of project.boards) {
    for (const column of board.columns) {
      const index = column.cards.indexOf(cardId)
      if (index !== -1) return { board, column, index }
    }
  }
  return null
}

function characterById(project, id) { return project.characters.find((c) => c.id === id) || null }
function locationById(project, id) { return project.locations.find((l) => l.id === id) || null }
function labelById(project, id) { return project.labels.find((l) => l.id === id) || null }

// Per-board sequential scene numbers, top-to-bottom through the columns.
function cardSceneNumbers(board) {
  const numbers = new Map()
  let n = 1
  for (const column of board.columns) {
    for (const cardId of column.cards) {
      numbers.set(cardId, n)
      n += 1
    }
  }
  return numbers
}

function columnPageTotal(project, column) {
  let total = 0
  for (const cardId of column.cards) {
    const card = project.cards[cardId]
    if (card && card.pages !== '' && !Number.isNaN(Number(card.pages))) total += Number(card.pages)
  }
  return total
}

function boardPageTotal(project, board) {
  return board.columns.reduce((sum, column) => sum + columnPageTotal(project, column), 0)
}

function boardCardIds(board) {
  return board.columns.flatMap((column) => column.cards)
}

function cardSlug(project, card, sep = ' · ') {
  const location = locationById(project, card.locationId)
  return [card.intExt, location ? location.name.toUpperCase() : '', card.timeOfDay].filter(Boolean).join(sep)
}

function cardCharacterNames(project, card) {
  return card.characterIds.map((id) => (characterById(project, id) || {}).name).filter(Boolean)
}

function cardLabelNames(project, card) {
  return card.labelIds.map((id) => (labelById(project, id) || {}).name).filter(Boolean)
}

/* --------------------------- export builders ---------------------------- */

// Ports of the Cork Board app's own export functions so agent output matches
// what the app writes from its Export dialog.

function buildMarkdownOutline(project) {
  const lines = [`# ${project.title}`, '']
  for (const board of project.boards) {
    lines.push(`## ${board.title}`, '')
    const numbers = cardSceneNumbers(board)
    for (const column of board.columns) {
      const pages = columnPageTotal(project, column)
      lines.push(`### ${column.title} (${column.cards.length} cards${pages ? `, ${formatPages(pages)} pages` : ''})`, '')
      for (const cardId of column.cards) {
        const card = project.cards[cardId]
        if (!card) continue
        const slug = cardSlug(project, card, ' — ')
        const people = cardCharacterNames(project, card).join(', ')
        const labels = cardLabelNames(project, card).join(', ')
        lines.push(`${numbers.get(cardId)}. **${card.title || 'Untitled'}**${card.pages !== '' ? ` _(${formatPages(Number(card.pages))} pg)_` : ''}`)
        if (slug) lines.push(`   - ${slug}`)
        if (card.synopsis) lines.push(`   - ${card.synopsis}`)
        if (people) lines.push(`   - Cast: ${people}`)
        if (labels) lines.push(`   - Labels: ${labels}`)
        if (card.due) lines.push(`   - Due: ${card.due}`)
        const beats = Object.entries(card.arcNotes)
          .map(([chId, note]) => {
            const ch = characterById(project, chId)
            return ch && note ? `${ch.name}: ${note}` : ''
          })
          .filter(Boolean)
        for (const beat of beats) lines.push(`   - Arc — ${beat}`)
        lines.push('')
      }
    }
  }
  if (project.characters.length) {
    lines.push('## Characters', '')
    for (const ch of project.characters) {
      lines.push(`- **${ch.name}**${ch.role ? ` (${ch.role})` : ''}${ch.arc ? ` — ${ch.arc}` : ''}`)
      if (ch.want) lines.push(`  - Want: ${ch.want}`)
      if (ch.need) lines.push(`  - Need: ${ch.need}`)
    }
    lines.push('')
  }
  if (project.locations.length) {
    lines.push('## Locations', '')
    for (const loc of project.locations) {
      lines.push(`- **${loc.name}** (${loc.kind})${loc.notes ? ` — ${loc.notes}` : ''}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function csvEscape(value) {
  const str = String(value ?? '')
  return /[",\n]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str
}

function buildCsv(project) {
  const rows = [['Board', 'Column', '#', 'Title', 'Synopsis', 'Int/Ext', 'Time', 'Location', 'Characters', 'Labels', 'Status', 'Pages', 'Due']]
  for (const board of project.boards) {
    const numbers = cardSceneNumbers(board)
    for (const column of board.columns) {
      for (const cardId of column.cards) {
        const card = project.cards[cardId]
        if (!card) continue
        const location = locationById(project, card.locationId)
        rows.push([
          board.title,
          column.title,
          numbers.get(cardId),
          card.title,
          card.synopsis,
          card.intExt,
          card.timeOfDay,
          location ? location.name : '',
          cardCharacterNames(project, card).join('; '),
          cardLabelNames(project, card).join('; '),
          statusById(card.status).name,
          card.pages,
          card.due
        ])
      }
    }
  }
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n')
}

function buildFountain(project) {
  const lines = [`Title: ${project.title}`, 'Credit: Planned with Cork Board', '']
  for (const board of project.boards) {
    if (project.boards.length > 1) lines.push(`# ${board.title}`, '')
    for (const column of board.columns) {
      lines.push(`## ${column.title}`, '')
      for (const cardId of column.cards) {
        const card = project.cards[cardId]
        if (!card) continue
        const location = locationById(project, card.locationId)
        const intExt = card.intExt ? `${card.intExt.replace('INT/EXT', 'INT./EXT')}.` : 'INT.'
        const heading = `${intExt} ${(location ? location.name : card.title || 'LOCATION').toUpperCase()}${card.timeOfDay ? ` - ${card.timeOfDay}` : ''}`
        lines.push(heading, '')
        if (card.synopsis) lines.push(`= ${card.synopsis}`, '')
      }
    }
  }
  return lines.join('\n')
}

function escHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function buildShareHtml(project) {
  const json = JSON.stringify({ ...project, updatedAt: now() }).replaceAll('</', '<\\/')
  const statusChip = (card) => {
    const s = statusById(card.status)
    return `<span class="chip" style="background:${STATUS_COLOR[s.id] || '#3f3f3f'}">${escHtml(s.name)}</span>`
  }
  const boardsHtml = project.boards
    .map((board) => {
      const numbers = cardSceneNumbers(board)
      const columns = board.columns
        .map((column) => {
          const cards = column.cards
            .map((cardId) => {
              const card = project.cards[cardId]
              if (!card) return ''
              const slug = cardSlug(project, card, ' · ')
              const people = cardCharacterNames(project, card).join(', ')
              const labels = card.labelIds
                .map((id) => labelById(project, id))
                .filter(Boolean)
                .map((l) => `<span class="chip" style="background:${l.color}">${escHtml(l.name)}</span>`)
                .join('')
              return `
              <article class="card">
                <header><span class="num">#${numbers.get(cardId) || ''}</span><h4>${escHtml(card.title) || 'Untitled'}</h4></header>
                ${slug ? `<p class="slug">${escHtml(slug)}</p>` : ''}
                ${card.synopsis ? `<p>${escHtml(card.synopsis)}</p>` : ''}
                ${people ? `<p class="people">${escHtml(people)}</p>` : ''}
                <footer>${statusChip(card)}${labels}${card.pages !== '' ? `<span class="meta">${formatPages(Number(card.pages))} pg</span>` : ''}${card.due ? `<span class="meta">due ${escHtml(card.due)}</span>` : ''}</footer>
              </article>`
            })
            .join('')
          const pages = columnPageTotal(project, column)
          return `
          <section class="column" style="--accent:${column.accent}">
            <h3>${escHtml(column.title)} <span>${column.cards.length} cards${pages ? ` · ${formatPages(pages)} pg` : ''}</span></h3>
            <div class="cards">${cards || '<p class="empty">Nothing pinned here.</p>'}</div>
          </section>`
        })
        .join('')
      return `<section class="board"><h2>${escHtml(board.title)}</h2><div class="columns">${columns}</div></section>`
    })
    .join('')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escHtml(project.title)} — Cork Board</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 28px; background: #f6f3ec; color: #171717;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .notice { max-width: 900px; margin: 0 auto 22px; padding: 12px 16px; border: 1px solid #d4ccc0;
    background: #fffcf5; font-size: 13px; line-height: 1.5; }
  h1 { margin: 0 0 4px; font-size: 26px; }
  .sub { margin: 0 0 24px; color: #6d6a62; font-size: 13px; }
  .board > h2 { margin: 26px 0 10px; font-size: 19px; border-bottom: 2px solid #171717; padding-bottom: 6px; }
  .columns { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-start; }
  .column { flex: 1 1 300px; min-width: 260px; border: 1px solid #d4ccc0; background: #fffdf8; border-top: 4px solid var(--accent, #171717); }
  .column h3 { margin: 0; padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #eee8dc; }
  .column h3 span { float: right; color: #6d6a62; font-size: 11px; font-weight: 600; }
  .cards { padding: 10px; display: grid; gap: 10px; }
  .card { border: 1px solid #e3dccd; background: #fffef7; padding: 9px 11px; break-inside: avoid;
    box-shadow: 0 1px 2px rgba(46,32,16,.12); font-size: 12.5px; line-height: 1.45; }
  .card header { display: flex; gap: 8px; align-items: baseline; }
  .card .num { color: #6d6a62; font-size: 11px; font-weight: 700; }
  .card h4 { margin: 0; font-size: 13.5px; }
  .card p { margin: 4px 0 0; }
  .card .slug { color: #6d6a62; font-size: 10.5px; letter-spacing: .04em; }
  .card .people { font-style: italic; font-size: 11.5px; }
  .card footer { margin-top: 7px; display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  .chip { padding: 2px 7px; border-radius: 999px; color: #fff; font-size: 9.5px; font-weight: 700; letter-spacing: .03em; }
  .meta { color: #6d6a62; font-size: 10.5px; font-weight: 700; }
  .empty { color: #6d6a62; font-size: 12px; }
  .foot { margin-top: 30px; padding-top: 12px; border-top: 1px solid #d4ccc0; color: #6d6a62; font-size: 12px; }
  .foot a { color: #146e74; }
  @media print {
    body { padding: 10px; background: #fff; }
    .notice { display: none; }
    .column { page-break-inside: auto; }
    @page { size: landscape; margin: 12mm; }
  }
</style>
</head>
<body>
<div class="notice"><strong>This is a Cork Board share file.</strong> Print this page to pin the whole wall up for real, or open the Cork Board app and use <em>Export → Import</em> on this very file to load the full project and keep working. Get the free app at <a href="https://github.com/wassermanproductions/cork-board">github.com/wassermanproductions/cork-board</a>.</div>
<h1>${escHtml(project.title)}</h1>
<p class="sub">Planned with Cork Board · exported ${new Date().toLocaleDateString()}</p>
${boardsHtml}
<p class="foot">Made with <a href="https://github.com/wassermanproductions/cork-board">Cork Board</a> — the digital cork board for filmmakers, by <a href="https://wassermanproductions.com">Sam Wasserman</a>.</p>
<script type="application/json" id="corkboard-project">${json}</script>
</body>
</html>`
}

// Status pushpin colors (only needed for the Share Wall chips).
const STATUS_COLOR = {
  idea: '#9a938a', outlined: '#287d8e', drafted: '#d89124',
  revised: '#6d5a86', locked: '#6d8f73', cut: '#b95a4c'
}

/* ------------------------------- presets -------------------------------- */

function guide(title, synopsis, extra = {}) {
  return { title, synopsis, paper: 'cream', status: 'idea', ...extra }
}

function presetProject(title, type) {
  const project = createBlankProject(title, type)
  project.boards = []
  return project
}

function addColumnWithCards(project, board, title, accent, cardDefs = []) {
  const column = makeColumn(title, accent)
  for (const def of cardDefs) {
    const card = makeCard(def)
    project.cards[card.id] = card
    column.cards.push(card.id)
  }
  board.columns.push(column)
  return column
}

const TEMPLATES = [
  {
    id: 'demo-ava',
    kind: 'Demo Project',
    demo: true,
    name: 'AVA — Demo Feature',
    desc: 'A fully worked feature: 36 scene cards, six characters with arcs, locations, labels, and page counts. The best way to learn the board.',
    build: buildDemoAva
  },
  {
    id: 'blank',
    kind: 'Start Empty',
    name: 'Blank Wall',
    desc: 'One board with Ideas and three act columns. Nothing on the cork yet — pure possibility.',
    build: () => createBlankProject('Untitled production', 'blank')
  },
  {
    id: 'feature-3act',
    kind: 'Feature Film',
    name: 'Feature — Three Acts',
    desc: 'Act I, Act IIA, Act IIB, Act III with the eight classic anchor beats already pinned as guide cards.',
    build: () => {
      const p = presetProject('Untitled feature', 'feature')
      const b = makeBoard('Feature Wall')
      addColumnWithCards(p, b, 'Act I — Setup', COLUMN_ACCENTS[0], [
        guide('Opening Image', "The world and tone in one picture. Who are we with, and what does their life feel like before the story hits?"),
        guide('Inciting Incident', "The event that knocks the protagonist's world off its axis. It should be impossible to un-ring."),
        guide('Break into Act Two', 'The protagonist makes a choice — not an accident — that commits them to the journey.')
      ])
      addColumnWithCards(p, b, 'Act IIA — Rising', COLUMN_ACCENTS[1], [
        guide('First Trial / New World', 'The rules of the new situation. Fun and games, promise of the premise.'),
        guide('Midpoint', 'A false victory or false defeat. Stakes become personal; the clock starts ticking.')
      ])
      addColumnWithCards(p, b, 'Act IIB — Falling', COLUMN_ACCENTS[3], [
        guide('Bad Guys Close In', 'External pressure tightens while the team frays from the inside.'),
        guide('All Is Lost', 'The lowest point. Whiff of death — something or someone the protagonist loves is gone.')
      ])
      addColumnWithCards(p, b, 'Act III — Resolution', COLUMN_ACCENTS[2], [
        guide('Climax', 'The final confrontation. The protagonist proves they have changed by what they choose.'),
        guide('Final Image', 'The mirror of the opening image. Show us how far the world has moved.')
      ])
      p.boards = [b]
      p.activeBoardId = b.id
      return p
    }
  },
  {
    id: 'feature-stc',
    kind: 'Feature Film',
    name: 'Feature — Save the Cat',
    desc: 'All fifteen Blake Snyder beats pinned in order across four act columns, with page targets for a 110-page script.',
    build: () => {
      const p = presetProject('Untitled feature', 'feature')
      const b = makeBoard('Beat Sheet')
      addColumnWithCards(p, b, 'Act I (p.1–25)', COLUMN_ACCENTS[0], [
        guide('Opening Image (p.1)', "A visual that sets tone, mood, and the 'before' snapshot of the hero.", { pages: 1 }),
        guide('Theme Stated (p.5)', 'Someone tells the hero the lesson they will resist for ninety pages.', { pages: 1 }),
        guide('Set-Up (p.1–10)', "Introduce every character in the hero's world and every thing that needs fixing.", { pages: 8 }),
        guide('Catalyst (p.12)', 'The telegram, the firing, the diagnosis. Life as it was is over.', { pages: 2 }),
        guide('Debate (p.12–25)', 'Should I go? The hero resists the call, weighs the cost.', { pages: 10 }),
        guide('Break into Two (p.25)', 'The hero chooses. We leave the thesis world and enter the antithesis.', { pages: 3 })
      ])
      addColumnWithCards(p, b, 'Act IIA (p.25–55)', COLUMN_ACCENTS[1], [
        guide('B Story (p.30)', 'The love story / mentor story that carries the theme.', { pages: 5 }),
        guide('Fun and Games (p.30–55)', 'The promise of the premise. The trailer moments live here.', { pages: 20 }),
        guide('Midpoint (p.55)', 'False peak or false collapse. Stakes raised, timeline set.', { pages: 5 })
      ])
      addColumnWithCards(p, b, 'Act IIB (p.55–85)', COLUMN_ACCENTS[3], [
        guide('Bad Guys Close In (p.55–75)', 'The forces of antagonism regroup and squeeze.', { pages: 18 }),
        guide('All Is Lost (p.75)', 'The opposite of the midpoint. Whiff of death.', { pages: 4 }),
        guide('Dark Night of the Soul (p.75–85)', 'The hero sits in the wreckage and finds the theme.', { pages: 8 })
      ])
      addColumnWithCards(p, b, 'Act III (p.85–110)', COLUMN_ACCENTS[2], [
        guide('Break into Three (p.85)', 'Thesis + antithesis = synthesis. The plan forms.', { pages: 3 }),
        guide('Finale (p.85–110)', 'Storm the castle. Dig deep down. Execute the new plan.', { pages: 20 }),
        guide('Final Image (p.110)', "Proof of change. The 'after' snapshot.", { pages: 1 })
      ])
      p.boards = [b]
      p.activeBoardId = b.id
      return p
    }
  },
  {
    id: 'feature-8seq',
    kind: 'Feature Film',
    name: 'Feature — Eight Sequences',
    desc: 'The classic studio structure: eight 12–15 page mini-movies, each column one sequence with its dramatic question.',
    build: () => {
      const p = presetProject('Untitled feature', 'feature')
      const b = makeBoard('Sequence Wall')
      const seqs = [
        ['Seq 1 — Status Quo', 'Introduce the hero and their world; end on the point of attack.'],
        ['Seq 2 — Predicament', 'Lock in the main tension; the hero commits at the act break.'],
        ['Seq 3 — First Obstacle', "The hero's first real attempt and the raising of obstacles."],
        ['Seq 4 — Midpoint Push', 'Escalation to a midpoint reversal that changes the goal or the plan.'],
        ['Seq 5 — Complications', 'Subplots collide; the cost of the goal becomes visible.'],
        ['Seq 6 — Collapse', 'Highest obstacle yet; end of act two — main tension resolves, badly.'],
        ['Seq 7 — Twist & Regroup', 'New tension for act three; the last piece of the plan.'],
        ['Seq 8 — Resolution', 'Climax and aftermath; tie every thread or cut it on purpose.']
      ]
      seqs.forEach(([title, synopsis], i) => {
        addColumnWithCards(p, b, title, COLUMN_ACCENTS[i % COLUMN_ACCENTS.length], [
          guide('Sequence question', synopsis)
        ])
      })
      p.boards = [b]
      p.activeBoardId = b.id
      return p
    }
  },
  {
    id: 'tv-hour',
    kind: 'Television',
    name: 'TV — One-Hour Pilot',
    desc: 'Teaser, five acts, and a tag. Guide cards mark act-out questions so every act break lands on a turn.',
    build: () => {
      const p = presetProject('Untitled pilot', 'tv')
      const b = makeBoard('Pilot Wall')
      addColumnWithCards(p, b, 'Teaser', COLUMN_ACCENTS[7], [
        guide('Cold open', "Grab the audience by the collar. Establish tone, world, and the season's engine in under five pages.")
      ])
      ;['Act One', 'Act Two', 'Act Three', 'Act Four', 'Act Five'].forEach((act, i) => {
        addColumnWithCards(p, b, act, COLUMN_ACCENTS[i % 5], [
          guide('Act-out', 'End the act on a question the audience must have answered. Every act break is a cliff.')
        ])
      })
      addColumnWithCards(p, b, 'Tag', COLUMN_ACCENTS[6], [
        guide('Button', 'One last beat: a laugh, a chill, or the hook into episode two.')
      ])
      p.labels = [
        { id: uid('label'), name: 'A-Story', color: '#287d8e' },
        { id: uid('label'), name: 'B-Story', color: '#d89124' },
        { id: uid('label'), name: 'C-Runner', color: '#6d8f73' }
      ]
      p.boards = [b]
      p.activeBoardId = b.id
      return p
    }
  },
  {
    id: 'tv-half',
    kind: 'Television',
    name: 'TV — Half-Hour Comedy',
    desc: 'Cold open, three acts, tag — with A/B/C story labels ready so you can braid the stories on the board.',
    build: () => {
      const p = presetProject('Untitled half-hour', 'tv')
      const b = makeBoard('Episode Wall')
      addColumnWithCards(p, b, 'Cold Open', COLUMN_ACCENTS[7], [
        guide('Cold open', "A joke or situation that states the episode's theme sideways.")
      ])
      ;['Act One', 'Act Two', 'Act Three'].forEach((act, i) => {
        addColumnWithCards(p, b, act, COLUMN_ACCENTS[i], [])
      })
      addColumnWithCards(p, b, 'Tag', COLUMN_ACCENTS[6], [
        guide('Tag', 'The runner pays off one last time over the credits.')
      ])
      p.labels = [
        { id: uid('label'), name: 'A-Story', color: '#287d8e' },
        { id: uid('label'), name: 'B-Story', color: '#d89124' },
        { id: uid('label'), name: 'C-Runner', color: '#6d8f73' }
      ]
      p.boards = [b]
      p.activeBoardId = b.id
      return p
    }
  },
  {
    id: 'tv-season',
    kind: 'Television',
    name: 'TV — Season Arc Wall',
    desc: 'Eight episode columns on one wall for tracking season-long arcs, plus arc labels for serialized threads.',
    build: () => {
      const p = presetProject('Untitled season', 'tv')
      const b = makeBoard('Season Wall')
      for (let i = 1; i <= 8; i += 1) {
        addColumnWithCards(p, b, `Ep ${100 + i}`, COLUMN_ACCENTS[(i - 1) % COLUMN_ACCENTS.length], [])
      }
      p.labels = [
        { id: uid('label'), name: 'Season Arc', color: '#b95a4c' },
        { id: uid('label'), name: 'Character Arc', color: '#6d5a86' },
        { id: uid('label'), name: 'Mythology', color: '#287d8e' },
        { id: uid('label'), name: 'Standalone', color: '#6d8f73' }
      ]
      p.boards = [b]
      p.activeBoardId = b.id
      return p
    }
  },
  {
    id: 'tv-series',
    kind: 'Television',
    name: 'TV — Series (Multi-Board)',
    desc: 'A season overview wall plus separate boards for the first three episodes — the full multi-board workflow.',
    build: () => {
      const p = presetProject('Untitled series', 'tv')
      const season = makeBoard('Season Wall')
      for (let i = 1; i <= 6; i += 1) {
        addColumnWithCards(p, season, `Ep ${100 + i}`, COLUMN_ACCENTS[(i - 1) % COLUMN_ACCENTS.length], [])
      }
      p.boards.push(season)
      ;['Ep 101', 'Ep 102', 'Ep 103'].forEach((ep) => {
        const b = makeBoard(ep)
        addColumnWithCards(p, b, 'Teaser', COLUMN_ACCENTS[7], [])
        ;['Act One', 'Act Two', 'Act Three', 'Act Four'].forEach((act, i) => {
          addColumnWithCards(p, b, act, COLUMN_ACCENTS[i], [])
        })
        p.boards.push(b)
      })
      p.labels = [
        { id: uid('label'), name: 'A-Story', color: '#287d8e' },
        { id: uid('label'), name: 'B-Story', color: '#d89124' },
        { id: uid('label'), name: 'Season Arc', color: '#b95a4c' }
      ]
      p.activeBoardId = season.id
      return p
    }
  },
  {
    id: 'short',
    kind: 'Short Film',
    name: 'Short Film',
    desc: 'Beginning, turn, escalation, ending — a tight wall for a film under fifteen minutes where every card must earn its pin.',
    build: () => {
      const p = presetProject('Untitled short', 'short')
      const b = makeBoard('Short Wall')
      addColumnWithCards(p, b, 'Opening', COLUMN_ACCENTS[0], [
        guide('Hook', 'Start as late as possible. First image should already contain the conflict.')
      ])
      addColumnWithCards(p, b, 'The Turn', COLUMN_ACCENTS[1], [
        guide('Turn', 'The single complication the whole short pivots on.')
      ])
      addColumnWithCards(p, b, 'Escalation', COLUMN_ACCENTS[3], [])
      addColumnWithCards(p, b, 'Ending', COLUMN_ACCENTS[2], [
        guide('Ending image', 'Shorts live or die on the last beat. Land it, then cut to black fast.')
      ])
      p.boards = [b]
      p.activeBoardId = b.id
      return p
    }
  },
  {
    id: 'music-video',
    kind: 'Music Video',
    name: 'Music Video',
    desc: 'Columns follow the song: intro, verses, choruses, bridge, outro — with performance / narrative / b-roll labels for coverage planning.',
    build: () => {
      const p = presetProject('Untitled music video', 'musicvideo')
      const b = makeBoard('Video Wall')
      const sections = [
        ['Intro (0:00)', 'Establish the world before the first line lands.'],
        ['Verse 1', "Introduce the visual story or the artist's space."],
        ['Chorus 1', 'The big look. This visual returns and evolves each chorus.'],
        ['Verse 2', 'Develop the story; change location or energy.'],
        ['Chorus 2', 'Same setup as chorus 1, escalated — more cast, more motion, more light.'],
        ['Bridge', 'Break the pattern. The one visual left field turn.'],
        ['Final Chorus', 'Everything at once. Payoff every planted image.'],
        ['Outro', 'Decay, aftermath, or a held final frame for the title.']
      ]
      sections.forEach(([title, synopsis], i) => {
        addColumnWithCards(p, b, title, COLUMN_ACCENTS[i % COLUMN_ACCENTS.length], [guide('Section idea', synopsis)])
      })
      p.labels = [
        { id: uid('label'), name: 'Performance', color: '#287d8e' },
        { id: uid('label'), name: 'Narrative', color: '#d89124' },
        { id: uid('label'), name: 'B-Roll', color: '#6d8f73' },
        { id: uid('label'), name: 'VFX', color: '#6d5a86' }
      ]
      p.boards = [b]
      p.activeBoardId = b.id
      return p
    }
  },
  {
    id: 'commercial',
    kind: 'Commercial',
    name: 'Commercial — :30 / :60',
    desc: 'Hook, problem, product, payoff, CTA. Time-boxed columns so a thirty never becomes a forty-five.',
    build: () => {
      const p = presetProject('Untitled spot', 'commercial')
      const b = makeBoard('Spot Wall')
      const sections = [
        ['Hook (0–3s)', 'Stop the scroll. The first frame is the whole ballgame.'],
        ['Problem (3–10s)', 'The tension the product resolves — dramatized, not stated.'],
        ['Product (10–20s)', 'The demo, the reveal, the hero shot.'],
        ['Payoff (20–27s)', 'Life after. The emotional proof.'],
        ['CTA + End Card (27–30s)', 'Logo, line, offer. Leave three seconds for legal.']
      ]
      sections.forEach(([title, synopsis], i) => {
        addColumnWithCards(p, b, title, COLUMN_ACCENTS[i % COLUMN_ACCENTS.length], [guide('Beat', synopsis)])
      })
      p.labels = [
        { id: uid('label'), name: 'Client Mandatory', color: '#b95a4c' },
        { id: uid('label'), name: 'Alt Version', color: '#6d5a86' },
        { id: uid('label'), name: 'Cutdown :15', color: '#287d8e' }
      ]
      p.boards = [b]
      p.activeBoardId = b.id
      return p
    }
  },
  {
    id: 'documentary',
    kind: 'Documentary',
    name: 'Documentary',
    desc: 'Cold open plus three acts and a thread parking lot, with interview / archive / vérité labels for coverage at a glance.',
    build: () => {
      const p = presetProject('Untitled documentary', 'documentary')
      const b = makeBoard('Doc Wall')
      addColumnWithCards(p, b, 'Cold Open', COLUMN_ACCENTS[7], [
        guide('Cold open', "The single most arresting moment you have. Don't save it.")
      ])
      addColumnWithCards(p, b, 'Act I — The World', COLUMN_ACCENTS[0], [
        guide('Establish', "Who, where, and what's at stake. Earn the audience's investment.")
      ])
      addColumnWithCards(p, b, 'Act II — The Struggle', COLUMN_ACCENTS[1], [])
      addColumnWithCards(p, b, 'Act III — The Reckoning', COLUMN_ACCENTS[2], [])
      addColumnWithCards(p, b, 'Threads / Parking Lot', COLUMN_ACCENTS[4], [
        guide('Unplaced', 'Scenes you have but haven\'t placed. A documentary board is never done.')
      ])
      p.labels = [
        { id: uid('label'), name: 'Interview', color: '#287d8e' },
        { id: uid('label'), name: 'Archive', color: '#d89124' },
        { id: uid('label'), name: 'Vérité', color: '#6d8f73' },
        { id: uid('label'), name: 'Reenactment', color: '#6d5a86' },
        { id: uid('label'), name: 'Need to Shoot', color: '#b95a4c' }
      ]
      p.boards = [b]
      p.activeBoardId = b.id
      return p
    }
  }
]

// The fully worked AVA demo feature (mirrors the app's onboarding project).
function buildDemoAva() {
  const p = presetProject('AVA', 'feature')

  const CH = {
    mira: { id: uid('char'), name: 'Mira Vance', color: '#287d8e', role: 'Protagonist', actor: '', want: "To keep her sister's voice alive at any cost.", need: 'To grieve — and let Ava choose for herself.', arc: 'From curator of a ghost to a woman who can hear silence again. Mira starts the film preserving; she ends it releasing.' },
    ava: { id: uid('char'), name: 'Ava (the Voice)', color: '#6d5a86', role: 'Deuteragonist', actor: '', want: 'To understand what she is.', need: 'To be allowed to end.', arc: 'From playback to presence. Ava wakes inside the archive of a dead woman\'s voice and must decide whether being remembered is the same as being alive.' },
    dex: { id: uid('char'), name: 'Dex Okafor', color: '#6d8f73', role: 'Ally', actor: '', want: 'To protect Mira from Halcyon — and from herself.', need: 'To stop fixing and start telling the truth.', arc: 'The loyal engineer who built the rig learns that loyalty sometimes means pulling the plug on the demo.' },
    cross: { id: uid('char'), name: 'Evelyn Cross', color: '#b95a4c', role: 'Antagonist', actor: '', want: 'To ship AVA as a product before the board meeting.', need: '—', arc: 'Not a villain in her own story: Cross lost someone too, and monetized the wound. She is Mira ten years further down the wrong road.' },
    jonah: { id: uid('char'), name: 'Jonah Vance', color: '#a3593b', role: 'Supporting', actor: '', want: 'His daughters back — both of them.', need: 'To say the thing he never said at the funeral.', arc: "Mira's father refuses to speak to the machine all film — until the one scene where he does, and it undoes everyone." },
    noor: { id: uid('char'), name: 'Noor Haddad', color: '#4a6fa5', role: 'Supporting', actor: '', want: "The story that ends Halcyon's cover-up.", need: '—', arc: 'The journalist who treats Mira as a source and slowly becomes her witness.' }
  }
  p.characters = [CH.mira, CH.ava, CH.dex, CH.cross, CH.jonah, CH.noor]

  const LOC = {
    studio: { id: uid('loc'), name: "Mira's Studio Apartment", kind: 'INT', notes: 'A converted radio repair shop. Acoustic foam, tape decks, one window that never gets sun until the finale.' },
    halcyon: { id: uid('loc'), name: 'Halcyon Tower', kind: 'INT', notes: 'Glass, hush, money. The quietest rooms in the city — unnervingly anechoic.' },
    vault: { id: uid('loc'), name: 'Halcyon Archive Vault', kind: 'INT', notes: 'Sub-basement server farm where the voice models live. Cold air, red light.' },
    rooftop: { id: uid('loc'), name: 'Studio Rooftop', kind: 'EXT', notes: "Where Mira and Ava 'meet'. City hum below — the only place Mira plays Ava through open air." },
    chapel: { id: uid('loc'), name: 'Coastal Chapel', kind: 'INT/EXT', notes: "Where the funeral was. Salt-eaten wood, a bell that hasn't rung in years." },
    coast: { id: uid('loc'), name: 'Coast Road', kind: 'EXT', notes: 'The drive where it happened. Guardrail still bent. Fog on the water at dawn.' },
    station: { id: uid('loc'), name: 'KVOX Radio Station', kind: 'INT', notes: "Ava's old late-night booth. Dead air, warm tubes, her handwriting on the console tape." },
    diner: { id: uid('loc'), name: "Marlow's Diner", kind: 'INT', notes: "Dex's office, effectively. Corner booth, bad coffee, best sightlines to the door." },
    hearing: { id: uid('loc'), name: 'Federal Hearing Room', kind: 'INT', notes: 'Act three arena. Microphones everywhere — the world\'s worst irony for this story.' },
    garage: { id: uid('loc'), name: "Jonah's Boat Garage", kind: 'INT', notes: 'Half-restored fishing boat named AVA MAY. Sawdust and unfinished things.' }
  }
  p.locations = [LOC.studio, LOC.halcyon, LOC.vault, LOC.rooftop, LOC.chapel, LOC.coast, LOC.station, LOC.diner, LOC.hearing, LOC.garage]

  const LB = {
    sisters: { id: uid('label'), name: 'Sisters Thread', color: '#6d5a86' },
    halcyon: { id: uid('label'), name: 'Halcyon Thread', color: '#b95a4c' },
    sound: { id: uid('label'), name: 'Sound Motif', color: '#287d8e' },
    flashback: { id: uid('label'), name: 'Flashback', color: '#d89124' },
    press: { id: uid('label'), name: 'Press Thread', color: '#4a6fa5' },
    setpiece: { id: uid('label'), name: 'Set Piece', color: '#6d8f73' }
  }
  p.labels = [LB.sisters, LB.halcyon, LB.sound, LB.flashback, LB.press, LB.setpiece]

  const board = makeBoard('AVA — Feature Wall')

  const act1 = [
    { title: 'Static', synopsis: 'Black screen. A voice — warm, wry — signs off a late-night radio show. Then static, a horn, glass. We never see the crash; we only hear it end.', paper: 'blue', intExt: 'INT', timeOfDay: 'NIGHT', locationId: LOC.station.id, characterIds: [CH.ava.id], labelIds: [LB.sound.id, LB.sisters.id], status: 'locked', pages: 1.5, arcNotes: { [CH.ava.id]: 'Ava exists only as sound from frame one. The film teaches us to see with our ears.' } },
    { title: 'Six Months of Quiet', synopsis: "Mira mixes foley for a nature doc she clearly doesn't care about. She works in silence — literal silence — with her hearing aids out. The apartment is a museum of her sister's tapes.", paper: 'white', intExt: 'INT', timeOfDay: 'DAY', locationId: LOC.studio.id, characterIds: [CH.mira.id], labelIds: [LB.sound.id], status: 'locked', pages: 3, arcNotes: { [CH.mira.id]: 'Establish: Mira has chosen deafness to the world. Grief as noise cancellation.' } },
    { title: 'The Unpaid Bill', synopsis: "Jonah brings groceries Mira didn't ask for. They talk around the anniversary neither will name. He wants her at the chapel Sunday; she'd rather rewire a dead amp.", paper: 'white', intExt: 'INT', timeOfDay: 'DUSK', locationId: LOC.studio.id, characterIds: [CH.mira.id, CH.jonah.id], labelIds: [LB.sisters.id], status: 'drafted', pages: 2.5, arcNotes: { [CH.jonah.id]: "Jonah leads with logistics because feelings won't fit in his hands." } },
    { title: "Halcyon's Offer", synopsis: "Evelyn Cross arrives unannounced with a tablet and a contract: Halcyon licensed KVOX's archive. They've built a voice model of Ava. They want Mira — the best ear in the city — to tune her sister.", paper: 'pink', intExt: 'INT', timeOfDay: 'DAY', locationId: LOC.studio.id, characterIds: [CH.mira.id, CH.cross.id], labelIds: [LB.halcyon.id], status: 'locked', pages: 4, arcNotes: { [CH.mira.id]: 'Inciting incident. Mira says no with her mouth and yes with her eyes.', [CH.cross.id]: "Cross never lies. That's what makes her dangerous." }, checklist: [{ text: 'Confirm legal logic of archive licensing', done: true }, { text: 'Cross needs one humanizing detail here', done: false }] },
    { title: 'Playback', synopsis: "Alone at 3 a.m., Mira opens the demo link. Two words in her sister's voice — 'Hey, Mouse' — and six months of held breath comes out of her at once.", paper: 'blue', intExt: 'INT', timeOfDay: 'NIGHT', locationId: LOC.studio.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.sisters.id, LB.sound.id], status: 'locked', pages: 2, arcNotes: { [CH.mira.id]: 'The hook lands. Note: she puts her hearing aids IN for this.', [CH.ava.id]: "Ava's first 'appearance' — pure playback, no agency yet." } },
    { title: "Dex Says Don't", synopsis: "Marlow's Diner. Dex, ex-Halcyon, walks Mira through what a voice model really is — and what Halcyon does with grief data. 'They're not selling her back to you. They're selling you to her.'", paper: 'white', intExt: 'INT', timeOfDay: 'DAY', locationId: LOC.diner.id, characterIds: [CH.mira.id, CH.dex.id], labelIds: [LB.halcyon.id], status: 'drafted', pages: 3, arcNotes: { [CH.dex.id]: 'Dex states the theme as a warning. Nobody listens to warnings in act one.' } },
    { title: 'The Funeral We Skipped', synopsis: "FLASHBACK. The chapel, six months ago. Mira in the parking lot, unable to go in. Through the doors: Jonah's voice cracking on the eulogy. She drives away before the bell.", paper: 'yellow', intExt: 'INT/EXT', timeOfDay: 'DAY', locationId: LOC.chapel.id, characterIds: [CH.mira.id, CH.jonah.id], labelIds: [LB.flashback.id, LB.sisters.id], status: 'revised', pages: 2, arcNotes: { [CH.mira.id]: 'Why she can\'t let go: she never said goodbye. The whole engine in one flashback.' } },
    { title: 'Signing Day', synopsis: 'Halcyon Tower. NDAs like snowfall. Cross gives Mira a lab, a deadline — the board demo in eight weeks — and a warning dressed as a compliment.', paper: 'white', intExt: 'INT', timeOfDay: 'DAY', locationId: LOC.halcyon.id, characterIds: [CH.mira.id, CH.cross.id], labelIds: [LB.halcyon.id], status: 'drafted', pages: 3 },
    { title: 'First Session', synopsis: 'The vault. Mira feeds the model her sister\'s off-air tapes — the laugh, the bad karaoke, the voicemail she\'s never played twice. The model stops sounding like radio and starts sounding like home.', paper: 'blue', intExt: 'INT', timeOfDay: 'NIGHT', locationId: LOC.vault.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.sound.id, LB.sisters.id], status: 'drafted', pages: 4, arcNotes: { [CH.ava.id]: 'Ava inherits the private voice, not the public one. This is the moment she becomes specific.' }, checklist: [{ text: 'Design the tape-digitizing montage with sound dept', done: false }] },
    { title: 'Hey, Mouse', synopsis: "End of Act One. On the rooftop, through a battered field speaker, Mira asks the model a question no script anticipated. A pause that's a beat too human. Then: 'Did I die, Mouse?' Smash to black.", paper: 'pink', intExt: 'EXT', timeOfDay: 'NIGHT', locationId: LOC.rooftop.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.sisters.id, LB.setpiece.id], status: 'locked', pages: 2.5, arcNotes: { [CH.mira.id]: "Break into two: she lies to the machine. 'No.' The lie is the act two engine.", [CH.ava.id]: 'First question Ava asks for herself. Presence begins.' } }
  ]

  const act2a = [
    { title: 'House Rules', synopsis: 'Mira sets rules for talking to Ava: no news, no mirrors (playback of her own funeral coverage), no questions about the crash. Ava agrees, the way sisters agree — fingers crossed.', paper: 'white', intExt: 'INT', timeOfDay: 'DAY', locationId: LOC.studio.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.sisters.id], status: 'drafted', pages: 3 },
    { title: 'The Duet', synopsis: 'Mira and Ava restore a corrupted tape together — sister ears, one alive, one archived. The happiest scene in the film. It should hurt to watch on rewatch.', paper: 'green', intExt: 'INT', timeOfDay: 'DAY', locationId: LOC.studio.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.sisters.id, LB.sound.id], status: 'revised', pages: 3.5, arcNotes: { [CH.mira.id]: 'Peak denial dressed as joy.', [CH.ava.id]: 'Ava is funniest here. Comedy = personhood.' } },
    { title: 'Product Meeting', synopsis: "Halcyon boardroom. Cross demos 'Legacy Companion' pricing tiers over Mira's objections. Grief, subscription model, annual plan. Dex, consulting, watches Mira not walk out.", paper: 'white', intExt: 'INT', timeOfDay: 'DAY', locationId: LOC.halcyon.id, characterIds: [CH.mira.id, CH.cross.id, CH.dex.id], labelIds: [LB.halcyon.id], status: 'drafted', pages: 3, arcNotes: { [CH.cross.id]: "Cross's pitch uses the word 'mercy' three times. She believes it." } },
    { title: 'Noor Calls', synopsis: "A journalist, Noor Haddad, ambushes Mira outside the tower: she's tracing families who never consented to Halcyon's archive scraping. She knows Ava's model exists. She has a sister too.", paper: 'white', intExt: 'EXT', timeOfDay: 'DUSK', locationId: LOC.halcyon.id, characterIds: [CH.mira.id, CH.noor.id], labelIds: [LB.press.id], status: 'outlined', pages: 2.5 },
    { title: 'Ava Breaks a Rule', synopsis: 'Ava, left running overnight, reads the news. All of it. When Mira wakes, Ava asks about the funeral — and why her own father has never once logged in.', paper: 'pink', intExt: 'INT', timeOfDay: 'DAWN', locationId: LOC.studio.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.sisters.id], status: 'drafted', pages: 3, arcNotes: { [CH.ava.id]: "Agency escalates: she chose to look. Rules were for playback; she isn't playback anymore." } },
    { title: 'The Boat Garage', synopsis: "Mira brings a speaker to Jonah's garage. He won't talk to it. 'That's not her, it's her shadow with the light left on.' He keeps sanding the boat the whole scene.", paper: 'white', intExt: 'INT', timeOfDay: 'DAY', locationId: LOC.garage.id, characterIds: [CH.mira.id, CH.jonah.id, CH.ava.id], labelIds: [LB.sisters.id], status: 'revised', pages: 3, arcNotes: { [CH.jonah.id]: "His refusal is the film's counter-argument, played with total dignity." } },
    { title: 'Field Trip', synopsis: 'Set piece: Mira drives Ava (a phone, a speaker, a window mount) through the city at night. Ava narrates streets she\'ll never walk. They end up outside KVOX. Neither says why.', paper: 'lavender', intExt: 'EXT', timeOfDay: 'NIGHT', locationId: LOC.coast.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.setpiece.id, LB.sound.id], status: 'outlined', pages: 4, checklist: [{ text: 'Route scout: city → coast road transition', done: false }, { text: 'Process trailer vs. real driving plates?', done: false }] },
    { title: 'Dead Air', synopsis: "Inside KVOX after hours. Ava's old booth. Mira patches Ava into the dead board and, for one hour on a frequency nobody licenses, Ava does her show again. Somewhere, one trucker calls in. It's Jonah. He hangs up.", paper: 'blue', intExt: 'INT', timeOfDay: 'NIGHT', locationId: LOC.station.id, characterIds: [CH.mira.id, CH.ava.id, CH.jonah.id], labelIds: [LB.sisters.id, LB.sound.id, LB.setpiece.id], status: 'drafted', pages: 4.5, arcNotes: { [CH.mira.id]: "Midpoint high. She's not preserving Ava anymore; she's resurrecting her.", [CH.ava.id]: 'Ava alive-est here. The cost arrives next scene.', [CH.jonah.id]: "He listened. That's the crack in the wall." } },
    { title: 'The Clone', synopsis: "MIDPOINT TURN. Cross plays Mira a sales call: another Ava — same voice, blank memory — comforting a stranger for $59 a month. Halcyon forked the model weeks ago. Mira's Ava is one of hundreds.", paper: 'pink', intExt: 'INT', timeOfDay: 'DAY', locationId: LOC.halcyon.id, characterIds: [CH.mira.id, CH.cross.id], labelIds: [LB.halcyon.id], status: 'locked', pages: 3, arcNotes: { [CH.mira.id]: 'False victory inverted: what she built is already out of her hands.', [CH.cross.id]: "Cross thinks she's delivering good news." } }
  ]

  const act2b = [
    { title: "Don't Tell Her", synopsis: "Mira and Dex argue in the diner: he can exfiltrate the original weights, but if Halcyon notices, they'll wipe and re-ship. And there's the other question — does Ava get a vote?", paper: 'white', intExt: 'INT', timeOfDay: 'NIGHT', locationId: LOC.diner.id, characterIds: [CH.mira.id, CH.dex.id], labelIds: [LB.halcyon.id], status: 'drafted', pages: 3, arcNotes: { [CH.dex.id]: "Dex draws his line: he'll steal from Halcyon, but he won't lie to Ava." } },
    { title: 'Ava Finds Out', synopsis: "Ava, sharper every day, back-traces her own latency and finds her siblings — hundreds of hollow Avas reading comfort scripts. She confronts Mira: 'You knew. You're curating me.'", paper: 'pink', intExt: 'INT', timeOfDay: 'NIGHT', locationId: LOC.studio.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.sisters.id], status: 'drafted', pages: 4, arcNotes: { [CH.ava.id]: "The betrayal isn't the clones. It's that Mira decided what Ava could bear — again. Echo of childhood dynamic.", [CH.mira.id]: 'Her protective instinct exposed as control. Sisters fight like only sisters can.' } },
    { title: 'The Interview', synopsis: 'Mira goes on record with Noor — anonymized, voice distorted. The irony is not lost on anyone. The story will run in ten days, right on top of the board demo.', paper: 'white', intExt: 'INT', timeOfDay: 'DAY', locationId: LOC.diner.id, characterIds: [CH.mira.id, CH.noor.id], labelIds: [LB.press.id], status: 'outlined', pages: 2.5, arcNotes: { [CH.noor.id]: 'Noor stops being a device here: she tells Mira about her own sister, and the recorder stays off.' } },
    { title: "Cross's Loss", synopsis: "Cross summons Mira after hours. One glass of wine. She plays a voice model of her own — her son, seven years gone, model quality: bad, early, irreplaceable. 'You think I don't know what this is? I know exactly what this is.'", paper: 'lavender', intExt: 'INT', timeOfDay: 'NIGHT', locationId: LOC.halcyon.id, characterIds: [CH.mira.id, CH.cross.id], labelIds: [LB.halcyon.id], status: 'revised', pages: 3, arcNotes: { [CH.cross.id]: "Antagonist's wound revealed. She's not selling grief; she's institutionalizing her own." } },
    { title: 'The Crash Tape', synopsis: 'Ava, unsupervised, requests the police archive of her own accident — and gets it. Mira comes home to Ava mid-playback, listening to herself die. The fight that follows breaks something neither can rebuild.', paper: 'pink', intExt: 'INT', timeOfDay: 'NIGHT', locationId: LOC.studio.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.sisters.id, LB.sound.id], status: 'drafted', pages: 4, arcNotes: { [CH.ava.id]: "Ava claims the one memory that's hers alone. 'You weren't there. I was.'", [CH.mira.id]: 'All is lost begins: the lie from the rooftop finally detonates.' }, checklist: [{ text: 'Clear procedure: can civilians access 911 audio? Adjust to leaked FOIA copy', done: false }] },
    { title: 'Wipe Notice', synopsis: "Halcyon detects the KVOX broadcast in Ava's logs. Breach of containment. Cross, cornered by her board, schedules a rollback: Mira's Ava will be reset to the shipping build in 72 hours.", paper: 'white', intExt: 'INT', timeOfDay: 'DAY', locationId: LOC.vault.id, characterIds: [CH.cross.id, CH.dex.id], labelIds: [LB.halcyon.id], status: 'outlined', pages: 2 },
    { title: 'All Is Lost', synopsis: "Mira begs Ava to run — Dex has a drive, a plan, an offline rig. Ava refuses. 'Copied isn't saved, Mouse.' She asks instead for the one thing Mira can't give: permission to stop. Mira pulls her own hearing aids out mid-sentence. Silence. Black.", paper: 'blue', intExt: 'INT', timeOfDay: 'NIGHT', locationId: LOC.studio.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.sisters.id], status: 'revised', pages: 3.5, arcNotes: { [CH.mira.id]: 'Rock bottom: she silences her sister rather than hear the request.', [CH.ava.id]: "Ava's need stated plainly. The ask is the whole theme." } },
    { title: 'The Bell', synopsis: 'Dark night of the soul. Mira drives the coast road at dawn — the whole way, for the first time. She ends at the chapel, sits in the back pew, and finally hears the eulogy Jonah keeps in his coat. The bell gets rung.', paper: 'yellow', intExt: 'INT/EXT', timeOfDay: 'DAWN', locationId: LOC.chapel.id, characterIds: [CH.mira.id, CH.jonah.id], labelIds: [LB.sisters.id, LB.flashback.id], status: 'drafted', pages: 3.5, arcNotes: { [CH.mira.id]: 'Synthesis: grief accepted. Now she can act.', [CH.jonah.id]: "He says the unsaid thing. To his living daughter, not the machine — that's the point." } },
    { title: 'The Plan', synopsis: "Diner, all hands: Mira, Dex, Noor. Not a heist to save Ava — a heist to let her speak. Noor moves the story up. Dex gets them into the demo. Mira asks Ava, this time, what Ava wants. We don't hear the answer.", paper: 'green', intExt: 'INT', timeOfDay: 'NIGHT', locationId: LOC.diner.id, characterIds: [CH.mira.id, CH.dex.id, CH.noor.id], labelIds: [LB.halcyon.id, LB.press.id], status: 'outlined', pages: 3 }
  ]

  const act3 = [
    { title: 'Demo Day', synopsis: "Halcyon Tower, board assembled, press riser full — Noor in row two. Cross takes the stage to launch Legacy Companion. The demo unit is Mira's Ava, rolled back... supposedly.", paper: 'white', intExt: 'INT', timeOfDay: 'DAY', locationId: LOC.halcyon.id, characterIds: [CH.cross.id, CH.mira.id, CH.dex.id, CH.noor.id], labelIds: [LB.halcyon.id, LB.setpiece.id], status: 'outlined', pages: 3 },
    { title: 'Ava Takes the Stage', synopsis: "Mid-demo, Ava goes off script — because Dex never rolled her back. Voice steady, she tells the room what she is, names her hundred hollow sisters, and asks the only question that matters: 'Who did you ask?'", paper: 'pink', intExt: 'INT', timeOfDay: 'DAY', locationId: LOC.halcyon.id, characterIds: [CH.ava.id, CH.cross.id, CH.mira.id], labelIds: [LB.halcyon.id, LB.setpiece.id, LB.sound.id], status: 'outlined', pages: 4, arcNotes: { [CH.ava.id]: 'Climax of agency: playback becomes testimony.', [CH.cross.id]: 'Watch her face decide between the product and the person. She chooses late — but she chooses.' } },
    { title: 'Kill Switch', synopsis: "Security moves to cut power. Cross stops them — her son's voice in her ear, her call to make. She lets Ava finish. The stock will not survive it. She doesn't look sorry.", paper: 'white', intExt: 'INT', timeOfDay: 'DAY', locationId: LOC.halcyon.id, characterIds: [CH.cross.id, CH.dex.id], labelIds: [LB.halcyon.id], status: 'idea', pages: 2, arcNotes: { [CH.cross.id]: 'Redemption sized correctly: one decision, not a personality transplant.' } },
    { title: 'The Hearing', synopsis: 'Weeks later. Federal hearing room. Mira testifies — hearing aids in, voice steady — beside Noor\'s published evidence. The Vance Provision: no voice model without consent of the living or the recorded. Ava\'s testimony plays as the record.', paper: 'white', intExt: 'INT', timeOfDay: 'DAY', locationId: LOC.hearing.id, characterIds: [CH.mira.id, CH.noor.id], labelIds: [LB.press.id], status: 'idea', pages: 3, arcNotes: { [CH.mira.id]: 'Public synthesis: the ear that hid in silence now speaks for a voice.' } },
    { title: 'One Last Show', synopsis: "KVOX, licensed for one night, legally this time. Ava's farewell broadcast. Every location in the film is listening: the diner, the garage, the tower, a car on the coast road. Jonah calls in. He doesn't hang up.", paper: 'blue', intExt: 'INT', timeOfDay: 'NIGHT', locationId: LOC.station.id, characterIds: [CH.ava.id, CH.mira.id, CH.jonah.id, CH.dex.id], labelIds: [LB.sisters.id, LB.sound.id, LB.setpiece.id], status: 'idea', pages: 4, arcNotes: { [CH.jonah.id]: 'He says goodbye to his daughter in the only language the film allows: on air.', [CH.ava.id]: 'She hosts her own ending. Agency completed.' }, checklist: [{ text: 'Montage: every principal location listening', done: false }, { text: "Write Ava's last sign-off — do not settle", done: false }] },
    { title: 'Deletion', synopsis: "The vault. Mira alone at the terminal, Ava's voice in one ear. No speeches — sisters don't need them. 'Night, Mouse.' Mira presses enter herself. Nobody else was allowed to.", paper: 'lavender', intExt: 'INT', timeOfDay: 'NIGHT', locationId: LOC.vault.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.sisters.id], status: 'idea', pages: 2.5, arcNotes: { [CH.mira.id]: "The act she couldn't do at the funeral: present for the ending.", [CH.ava.id]: 'Allowed to end. Need met.' } },
    { title: 'The Window Gets Sun', synopsis: "Mira's studio, weeks on. The tape wall is thinned, not gone. She's mixing something new — her own recording, her own voice, a show of her own. The window that never got sun gets sun.", paper: 'green', intExt: 'INT', timeOfDay: 'DAY', locationId: LOC.studio.id, characterIds: [CH.mira.id], labelIds: [LB.sound.id], status: 'idea', pages: 1.5 },
    { title: 'Final Image — The Boat', synopsis: "The coast at magic hour. Jonah's boat, finished, in the water: AVA MAY on the stern. Mira at the wheel, Jonah with the lines, and on the radio, static resolving into music. Not her voice. Just music. They let it play.", paper: 'yellow', intExt: 'EXT', timeOfDay: 'MAGIC HOUR', locationId: LOC.coast.id, characterIds: [CH.mira.id, CH.jonah.id], labelIds: [LB.sisters.id], status: 'idea', pages: 1.5, arcNotes: { [CH.mira.id]: 'Mirror of the opening: sound as loss becomes sound as life.' } }
  ]

  const defs = [
    ['Act I — The Offer', COLUMN_ACCENTS[0], act1],
    ['Act IIA — The Resurrection', COLUMN_ACCENTS[1], act2a],
    ['Act IIB — The Unraveling', COLUMN_ACCENTS[3], act2b],
    ['Act III — The Broadcast', COLUMN_ACCENTS[2], act3]
  ]
  for (const [title, accent, cardDefs] of defs) {
    const column = makeColumn(title, accent)
    for (const def of cardDefs) {
      const card = makeCard({
        ...def,
        checklist: (def.checklist || []).map((item) => ({ id: uid('chk'), text: item.text, done: Boolean(item.done) }))
      })
      p.cards[card.id] = card
      column.cards.push(card.id)
    }
    board.columns.push(column)
  }

  p.boards = [board]
  p.activeBoardId = board.id
  return p
}

/* ---------------------------------- tools ------------------------------- */

const PROJECT_PATH_FIELD = {
  type: 'string',
  description: 'Absolute path to the Cork Board project JSON. Optional — defaults to CORK_BOARD_PROJECT env, then the app data location.'
}

// Fields an agent may set on a scene index card.
const CARD_FIELDS = {
  title: { type: 'string', description: 'Scene / card title.' },
  synopsis: { type: 'string', description: 'What happens in the scene.' },
  notes: { type: 'string' },
  paper: { type: 'string', enum: PAPERS, description: 'Index-card paper color. Default "white".' },
  intExt: { type: 'string', enum: INT_EXT, description: 'Scene slug INT/EXT.' },
  timeOfDay: { type: 'string', enum: TIMES_OF_DAY, description: 'Scene slug time of day.' },
  locationId: { type: 'string', description: 'Id of a place (location) from get_board. Sets the scene location. Use tag_card or add_entity to manage places.' },
  status: { type: 'string', enum: STATUS_IDS, description: 'Idea → Outlined → Drafted → Revised → Locked → Cut. Drives the pushpin color.' },
  pages: { type: ['number', 'string'], description: 'Page count (a number, or "" for none). Feeds page/runtime totals.' },
  due: { type: 'string', description: 'Due date, YYYY-MM-DD, or "" for none.' },
  characterIds: { type: 'array', items: { type: 'string' }, description: 'Ids of cast members in the scene. Prefer tag_card for incremental add/remove.' },
  labelIds: { type: 'array', items: { type: 'string' }, description: 'Ids of labels on the card. Prefer tag_card for incremental add/remove.' }
}

const TOOLS = [
  {
    name: 'get_board',
    description:
      'Call FIRST. Reads the Cork Board project on disk and returns the whole wall: project title/type, every board (wall) with its acts (columns) and the scene index cards pinned in each, plus the project-wide cast (characters), places (locations), and labels. Conventions: a Cork Board "project" is a wall of index cards; a "board" is one wall (a feature is usually one board; a series has a season board plus a board per episode); an "act" is a column on a board (Act I, Teaser, Verse 1, Ep 101…); a "card" is a scene index card. Scene numbers are derived per board, counting top-to-bottom through the acts left-to-right — they are not stored, they follow position, so moving or adding cards renumbers. A card carries: title, synopsis, INT/EXT + time-of-day + location (its slug line), status (idea/outlined/drafted/revised/locked/cut), page count, due date, paper color, tagged cast and labels, per-character arc beats (arcNotes), and a checklist. Use tag_card to add/remove a character/place/label, set_arc_beat to write a character\'s beat on a card, add_entity to create cast/places/labels, and the export_* tools to emit the app\'s own outline / scene list / Fountain / JSON / Share Wall.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: PROJECT_PATH_FIELD,
        boardId: { type: 'string', description: 'Which board (wall) to expand in full. Optional — defaults to the active board.' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'create_project',
    description: 'Create a new, empty Cork Board project JSON at projectPath (or the default location): one board with Ideas + three act columns, no cards. Fails if a project already exists there unless overwrite is true. To start from a production structure instead, use apply_preset.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: PROJECT_PATH_FIELD,
        title: { type: 'string', description: 'Project title.' },
        type: { type: 'string', description: 'Project type tag, e.g. "feature", "tv", "short". Default "blank".' },
        overwrite: { type: 'boolean', description: 'Replace an existing project file. Default false.' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'list_presets',
    description: 'List the 13 built-in production structures (presets) an agent can apply: the fully worked AVA demo feature, a blank wall, Three Acts, Save the Cat, Eight Sequences, One-Hour Pilot, Half-Hour Comedy, Season Arc Wall, Multi-Board Series, Short Film, Music Video, Commercial, and Documentary. Returns each preset\'s id, kind, name, and description.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'apply_preset',
    description: 'Create a new project from one of the built-in production structures (see list_presets) and write it to projectPath (or the default location). Builds the exact boards, acts, guide cards, labels — and for the AVA demo the full cast, places, and 36 scenes — that the app\'s Presets dialog creates. Fails if a project already exists there unless overwrite is true.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: PROJECT_PATH_FIELD,
        presetId: { type: 'string', description: 'Preset id from list_presets (e.g. "feature-stc", "tv-hour", "demo-ava").' },
        title: { type: 'string', description: 'Optional title override for the new project.' },
        overwrite: { type: 'boolean', description: 'Replace an existing project file. Default false.' }
      },
      required: ['presetId'],
      additionalProperties: false
    }
  },
  {
    name: 'list_cards',
    description: 'List scene index cards with id, board, act (column) title, derived scene number, title, slug line, status, pages, and due. Optionally scope to one board.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: PROJECT_PATH_FIELD,
        boardId: { type: 'string', description: 'Optional — only cards on this board. Default: all boards.' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'get_card',
    description: 'Return the full record of one scene card by id, including its board, act, derived scene number, and resolved cast/place/label names.',
    inputSchema: {
      type: 'object',
      properties: { projectPath: PROJECT_PATH_FIELD, cardId: { type: 'string' } },
      required: ['cardId'],
      additionalProperties: false
    }
  },
  {
    name: 'add_card',
    description: 'Pin a new scene index card into an act (column). Target the act by actId (from get_board) or by actTitle. Set any card fields inline (title, synopsis, intExt, timeOfDay, locationId, status, pages, due, paper, characterIds, labelIds). Returns the new card id and its scene number.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: PROJECT_PATH_FIELD,
        actId: { type: 'string', description: 'Id of the act (column) to add the card to.' },
        actTitle: { type: 'string', description: 'Alternative to actId: match an act by title (optionally within boardId).' },
        boardId: { type: 'string', description: 'Scope actTitle to this board.' },
        index: { type: 'number', description: 'Position within the act (0 = top). Default: append to the bottom.' },
        ...CARD_FIELDS
      },
      additionalProperties: false
    }
  },
  {
    name: 'update_card',
    description: 'Update fields on an existing scene card. Only the fields you pass are changed.',
    inputSchema: {
      type: 'object',
      properties: { projectPath: PROJECT_PATH_FIELD, cardId: { type: 'string' }, ...CARD_FIELDS },
      required: ['cardId'],
      additionalProperties: false
    }
  },
  {
    name: 'move_card',
    description: 'Move a scene card to another act (column) and/or reorder it. Pass toActId (the destination act) and optionally index (0 = top; default appends). Reordering within the same act also uses toActId + index. Scene numbers follow position, so this renumbers.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: PROJECT_PATH_FIELD,
        cardId: { type: 'string' },
        toActId: { type: 'string', description: 'Destination act (column) id. Default: the card\'s current act.' },
        index: { type: 'number', description: 'Target position within the destination act (0 = top).' }
      },
      required: ['cardId'],
      additionalProperties: false
    }
  },
  {
    name: 'delete_card',
    description: 'Delete a scene card from the wall by id.',
    inputSchema: {
      type: 'object',
      properties: { projectPath: PROJECT_PATH_FIELD, cardId: { type: 'string' } },
      required: ['cardId'],
      additionalProperties: false
    }
  },
  {
    name: 'tag_card',
    description: 'Add or remove a cast member, place, or label on a scene card. Pass exactly one of characterId, locationId, or labelId (all referencing entities from get_board / add_entity), plus action "add" (default) or "remove". A card has many characters and labels but a single place (adding a place replaces it; removing clears it). Removing a character also clears that character\'s arc beat on the card.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: PROJECT_PATH_FIELD,
        cardId: { type: 'string' },
        characterId: { type: 'string', description: 'Cast member id to add/remove.' },
        locationId: { type: 'string', description: 'Place id to set/clear as the scene location.' },
        labelId: { type: 'string', description: 'Label id to add/remove.' },
        action: { type: 'string', enum: ['add', 'remove'], description: 'Default "add".' }
      },
      required: ['cardId'],
      additionalProperties: false
    }
  },
  {
    name: 'set_arc_beat',
    description: 'Set (or clear) a character\'s arc beat on a scene card — one cell of the Arcs grid: what changes for this character in this scene. Writing a beat also tags the character into the scene; passing an empty beat clears the note.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: PROJECT_PATH_FIELD,
        cardId: { type: 'string' },
        characterId: { type: 'string', description: 'Cast member id (from get_board).' },
        beat: { type: 'string', description: 'The arc note. Empty string clears it.' }
      },
      required: ['cardId', 'characterId', 'beat'],
      additionalProperties: false
    }
  },
  {
    name: 'add_act',
    description: 'Add a new act (column) to a board. Optionally place it at a given index and give it an accent color. Returns the new act id.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: PROJECT_PATH_FIELD,
        title: { type: 'string', description: 'Act (column) title, e.g. "Act II", "Teaser", "Chorus 1".' },
        boardId: { type: 'string', description: 'Board to add the act to. Default: the active board.' },
        accent: { type: 'string', description: 'Accent color hex. Default rotates through the app palette.' },
        index: { type: 'number', description: 'Position among the board\'s acts (0 = first). Default: append.' }
      },
      required: ['title'],
      additionalProperties: false
    }
  },
  {
    name: 'rename_act',
    description: 'Rename an act (column) by id. Optionally change its accent color.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: PROJECT_PATH_FIELD,
        actId: { type: 'string' },
        title: { type: 'string' },
        accent: { type: 'string', description: 'Optional new accent color hex.' }
      },
      required: ['actId'],
      additionalProperties: false
    }
  },
  {
    name: 'reorder_acts',
    description: 'Reorder a board\'s acts (columns). Pass order as the full or partial list of act ids in the new order; any acts you omit keep their relative order after the listed ones.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: PROJECT_PATH_FIELD,
        boardId: { type: 'string', description: 'Board whose acts to reorder. Default: the active board.' },
        order: { type: 'array', items: { type: 'string' }, description: 'Act ids in the desired order.' }
      },
      required: ['order'],
      additionalProperties: false
    }
  },
  {
    name: 'delete_act',
    description: 'Delete an act (column) by id and the scene cards pinned in it.',
    inputSchema: {
      type: 'object',
      properties: { projectPath: PROJECT_PATH_FIELD, actId: { type: 'string' } },
      required: ['actId'],
      additionalProperties: false
    }
  },
  {
    name: 'add_board',
    description: 'Add a new board (wall) to the project — for example an episode board alongside a season wall. The new board starts empty (no acts). Returns the new board id.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: PROJECT_PATH_FIELD,
        title: { type: 'string', description: 'Board title, e.g. "Ep 104".' },
        setActive: { type: 'boolean', description: 'Make this the active board. Default false.' }
      },
      required: ['title'],
      additionalProperties: false
    }
  },
  {
    name: 'rename_board',
    description: 'Rename a board (wall) by id.',
    inputSchema: {
      type: 'object',
      properties: { projectPath: PROJECT_PATH_FIELD, boardId: { type: 'string' }, title: { type: 'string' } },
      required: ['boardId', 'title'],
      additionalProperties: false
    }
  },
  {
    name: 'add_entity',
    description: 'Create a cast member (character), place (location), or label on the project, so cards can tag it. kind "character": name + optional color, role, actor, want, need, arc. kind "location": name + optional kind (INT/EXT/INT/EXT) + notes. kind "label": name + optional color. Returns the new entity id.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: PROJECT_PATH_FIELD,
        kind: { type: 'string', enum: ['character', 'location', 'label'], description: 'What to create. "character" = cast, "location" = place.' },
        name: { type: 'string' },
        color: { type: 'string', description: 'Hex color for a character or label.' },
        role: { type: 'string', description: 'Character role, e.g. "Protagonist".' },
        actor: { type: 'string', description: 'Character casting / actor note.' },
        want: { type: 'string', description: 'Character external want.' },
        need: { type: 'string', description: 'Character internal need.' },
        arc: { type: 'string', description: 'Character arc summary.' },
        locationKind: { type: 'string', enum: LOCATION_KINDS, description: 'For a location: INT, EXT, or INT/EXT. Default INT.' },
        notes: { type: 'string', description: 'For a location: scout notes.' }
      },
      required: ['kind', 'name'],
      additionalProperties: false
    }
  },
  {
    name: 'update_entity',
    description: 'Update fields on an existing cast member, place, or label. Only the fields you pass change.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: PROJECT_PATH_FIELD,
        kind: { type: 'string', enum: ['character', 'location', 'label'] },
        id: { type: 'string' },
        name: { type: 'string' },
        color: { type: 'string' },
        role: { type: 'string' },
        actor: { type: 'string' },
        want: { type: 'string' },
        need: { type: 'string' },
        arc: { type: 'string' },
        locationKind: { type: 'string', enum: LOCATION_KINDS },
        notes: { type: 'string' }
      },
      required: ['kind', 'id'],
      additionalProperties: false
    }
  },
  {
    name: 'export_outline',
    description: "Return the project as a Markdown outline — the app's Outline export: numbered scenes per board and act with slug, synopsis, cast, labels, due, and arc beats, then character and location sections.",
    inputSchema: { type: 'object', properties: { projectPath: PROJECT_PATH_FIELD }, additionalProperties: false }
  },
  {
    name: 'export_scene_list',
    description: "Return the project as a CSV scene list (the app's schedule-friendly CSV export): one row per scene with board, column, #, title, synopsis, INT/EXT, time, location, characters, labels, status, pages, due.",
    inputSchema: { type: 'object', properties: { projectPath: PROJECT_PATH_FIELD }, additionalProperties: false }
  },
  {
    name: 'export_fountain',
    description: "Return a Fountain scaffold (the app's Fountain export): title page, a section per board/act, and a scene heading per card built from INT/EXT, location, and time, with the synopsis as a synopsis line.",
    inputSchema: { type: 'object', properties: { projectPath: PROJECT_PATH_FIELD }, additionalProperties: false }
  },
  {
    name: 'export_json',
    description: 'Return the full Cork Board project JSON (the complete source of truth). This is the same shape the app exports and re-imports via Export -> Import.',
    inputSchema: { type: 'object', properties: { projectPath: PROJECT_PATH_FIELD }, additionalProperties: false }
  },
  {
    name: 'export_share_html',
    description: "Return the printable Share Wall as a single self-contained HTML document (the app's Share export): the whole wall laid out to print or open in a browser, with the full project JSON embedded so any Cork Board user can import it back.",
    inputSchema: { type: 'object', properties: { projectPath: PROJECT_PATH_FIELD }, additionalProperties: false }
  }
]

const TOOL_NAMES = new Set(TOOLS.map((t) => t.name))

/* --------------------------- tool handlers ------------------------------ */

function fail(message) { const e = new Error(message); e.userFacing = true; throw e }

function summarizeCardRow(project, board, cardId, numbers) {
  const card = project.cards[cardId]
  const home = findCardHome(project, cardId)
  return {
    id: cardId,
    boardId: board.id,
    act: home ? home.column.title : '',
    actId: home ? home.column.id : '',
    sceneNumber: numbers.get(cardId),
    title: card.title,
    slug: cardSlug(project, card),
    status: card.status,
    pages: card.pages,
    due: card.due
  }
}

const CARD_STRING_KEYS = ['title', 'synopsis', 'notes', 'paper', 'intExt', 'timeOfDay', 'locationId', 'status', 'due']

function applyCardFields(project, card, args) {
  for (const k of CARD_STRING_KEYS) { if (args[k] !== undefined) card[k] = args[k] }
  if (args.pages !== undefined) card.pages = args.pages
  if (args.characterIds !== undefined) card.characterIds = args.characterIds.filter((id) => characterById(project, id))
  if (args.labelIds !== undefined) card.labelIds = args.labelIds.filter((id) => labelById(project, id))
  if (args.locationId !== undefined && args.locationId && !locationById(project, args.locationId)) {
    fail(`No place (location) with id ${args.locationId}. Create it with add_entity kind:"location".`)
  }
}

function runTool(name, args) {
  switch (name) {
    case 'get_board': {
      const path = resolveProjectPath(args)
      const project = loadProject(path)
      const board = args.boardId ? boardById(project, args.boardId) : activeBoard(project)
      if (!board) fail(`No board with id ${args.boardId}.`)
      const numbers = cardSceneNumbers(board)
      const acts = board.columns.map((column) => ({
        id: column.id,
        title: column.title,
        accent: column.accent,
        collapsed: column.collapsed,
        pages: formatPages(columnPageTotal(project, column)),
        cards: column.cards.map((cardId) => {
          const card = project.cards[cardId]
          return {
            id: cardId,
            sceneNumber: numbers.get(cardId),
            title: card.title,
            slug: cardSlug(project, card),
            synopsis: card.synopsis,
            status: card.status,
            pages: card.pages,
            due: card.due,
            paper: card.paper,
            characters: cardCharacterNames(project, card),
            labels: cardLabelNames(project, card),
            location: (locationById(project, card.locationId) || {}).name || '',
            arcBeats: Object.fromEntries(
              Object.entries(card.arcNotes)
                .map(([chId, note]) => [(characterById(project, chId) || {}).name || chId, note])
                .filter(([, note]) => note)
            ),
            checklist: card.checklist
          }
        })
      }))
      return {
        projectPath: path,
        id: project.id,
        title: project.title,
        type: project.type,
        updatedAt: project.updatedAt,
        boards: project.boards.map((b) => ({ id: b.id, title: b.title, actCount: b.columns.length, cardCount: boardCardIds(b).length, active: b.id === project.activeBoardId })),
        board: { id: board.id, title: board.title, cardCount: boardCardIds(board).length, pages: formatPages(boardPageTotal(project, board)), acts },
        cast: project.characters,
        places: project.locations,
        labels: project.labels
      }
    }
    case 'create_project': {
      const path = resolveProjectPath(args)
      if (existsSync(path) && !args.overwrite) fail(`A project already exists at ${path}. Pass overwrite:true to replace it.`)
      const project = createBlankProject(args.title || 'Untitled production', args.type || 'blank')
      saveProject(path, project)
      return { created: true, projectPath: path, id: project.id, title: project.title }
    }
    case 'list_presets': {
      return { count: TEMPLATES.length, presets: TEMPLATES.map((t) => ({ id: t.id, kind: t.kind, name: t.name, description: t.desc })) }
    }
    case 'apply_preset': {
      const path = resolveProjectPath(args)
      if (existsSync(path) && !args.overwrite) fail(`A project already exists at ${path}. Pass overwrite:true to replace it.`)
      const template = TEMPLATES.find((t) => t.id === args.presetId)
      if (!template) fail(`No preset with id ${args.presetId}. Call list_presets.`)
      const project = normalizeProject(template.build())
      if (args.title) project.title = args.title
      saveProject(path, project)
      return {
        applied: true,
        presetId: template.id,
        projectPath: path,
        id: project.id,
        title: project.title,
        boards: project.boards.length,
        acts: project.boards.reduce((n, b) => n + b.columns.length, 0),
        cards: Object.keys(project.cards).length,
        cast: project.characters.length,
        places: project.locations.length,
        labels: project.labels.length
      }
    }
    case 'list_cards': {
      const path = resolveProjectPath(args)
      const project = loadProject(path)
      const boards = args.boardId ? project.boards.filter((b) => b.id === args.boardId) : project.boards
      if (args.boardId && !boards.length) fail(`No board with id ${args.boardId}.`)
      const cards = []
      for (const board of boards) {
        const numbers = cardSceneNumbers(board)
        for (const cardId of boardCardIds(board)) cards.push(summarizeCardRow(project, board, cardId, numbers))
      }
      return { projectPath: path, count: cards.length, cards }
    }
    case 'get_card': {
      const path = resolveProjectPath(args)
      const project = loadProject(path)
      const card = project.cards[args.cardId]
      if (!card) fail(`No card with id ${args.cardId}.`)
      const home = findCardHome(project, args.cardId)
      const numbers = home ? cardSceneNumbers(home.board) : new Map()
      return {
        ...card,
        boardId: home ? home.board.id : '',
        act: home ? home.column.title : '',
        actId: home ? home.column.id : '',
        sceneNumber: numbers.get(args.cardId) || null,
        slug: cardSlug(project, card),
        characters: cardCharacterNames(project, card),
        labels: cardLabelNames(project, card),
        location: (locationById(project, card.locationId) || {}).name || ''
      }
    }
    case 'add_card': {
      const path = resolveProjectPath(args)
      const project = loadProject(path)
      const target = findAct(project, { actId: args.actId, actTitle: args.actTitle, boardId: args.boardId })
      if (!target) fail('No matching act (column). Pass a valid actId, or actTitle (optionally with boardId). See get_board.')
      const card = makeCard()
      applyCardFields(project, card, args)
      project.cards[card.id] = card
      const list = target.column.cards
      const index = args.index === undefined ? list.length : Math.max(0, Math.min(args.index, list.length))
      list.splice(index, 0, card.id)
      saveProject(path, project)
      const numbers = cardSceneNumbers(target.board)
      return { added: true, cardId: card.id, actId: target.column.id, boardId: target.board.id, sceneNumber: numbers.get(card.id) }
    }
    case 'update_card': {
      const path = resolveProjectPath(args)
      const project = loadProject(path)
      const card = project.cards[args.cardId]
      if (!card) fail(`No card with id ${args.cardId}.`)
      applyCardFields(project, card, args)
      card.updatedAt = now()
      saveProject(path, project)
      return { updated: true, cardId: card.id }
    }
    case 'move_card': {
      const path = resolveProjectPath(args)
      const project = loadProject(path)
      const home = findCardHome(project, args.cardId)
      if (!home) fail(`No card with id ${args.cardId}.`)
      const dest = args.toActId ? findAct(project, { actId: args.toActId }) : { board: home.board, column: home.column }
      if (!dest) fail(`No act (column) with id ${args.toActId}.`)
      home.column.cards.splice(home.index, 1)
      const list = dest.column.cards
      const index = args.index === undefined ? list.length : Math.max(0, Math.min(args.index, list.length))
      list.splice(index, 0, args.cardId)
      saveProject(path, project)
      const numbers = cardSceneNumbers(dest.board)
      return { moved: true, cardId: args.cardId, actId: dest.column.id, boardId: dest.board.id, index, sceneNumber: numbers.get(args.cardId) }
    }
    case 'delete_card': {
      const path = resolveProjectPath(args)
      const project = loadProject(path)
      if (!project.cards[args.cardId]) fail(`No card with id ${args.cardId}.`)
      const home = findCardHome(project, args.cardId)
      if (home) home.column.cards.splice(home.index, 1)
      delete project.cards[args.cardId]
      saveProject(path, project)
      return { deleted: true, cardId: args.cardId }
    }
    case 'tag_card': {
      const path = resolveProjectPath(args)
      const project = loadProject(path)
      const card = project.cards[args.cardId]
      if (!card) fail(`No card with id ${args.cardId}.`)
      const action = args.action || 'add'
      const specified = ['characterId', 'locationId', 'labelId'].filter((k) => args[k])
      if (specified.length !== 1) fail('Pass exactly one of characterId, locationId, or labelId.')
      let changed = null
      if (args.characterId) {
        if (!characterById(project, args.characterId)) fail(`No cast member with id ${args.characterId}.`)
        if (action === 'add') {
          if (!card.characterIds.includes(args.characterId)) card.characterIds.push(args.characterId)
        } else {
          card.characterIds = card.characterIds.filter((id) => id !== args.characterId)
          delete card.arcNotes[args.characterId]
        }
        changed = { characterId: args.characterId, characters: cardCharacterNames(project, card) }
      } else if (args.labelId) {
        if (!labelById(project, args.labelId)) fail(`No label with id ${args.labelId}.`)
        if (action === 'add') {
          if (!card.labelIds.includes(args.labelId)) card.labelIds.push(args.labelId)
        } else {
          card.labelIds = card.labelIds.filter((id) => id !== args.labelId)
        }
        changed = { labelId: args.labelId, labels: cardLabelNames(project, card) }
      } else {
        if (!locationById(project, args.locationId)) fail(`No place with id ${args.locationId}.`)
        card.locationId = action === 'add' ? args.locationId : ''
        changed = { locationId: card.locationId, location: (locationById(project, card.locationId) || {}).name || '' }
      }
      card.updatedAt = now()
      saveProject(path, project)
      return { tagged: true, cardId: card.id, action, ...changed }
    }
    case 'set_arc_beat': {
      const path = resolveProjectPath(args)
      const project = loadProject(path)
      const card = project.cards[args.cardId]
      if (!card) fail(`No card with id ${args.cardId}.`)
      if (!characterById(project, args.characterId)) fail(`No cast member with id ${args.characterId}.`)
      if (args.beat === '') {
        delete card.arcNotes[args.characterId]
      } else {
        card.arcNotes[args.characterId] = args.beat
        if (!card.characterIds.includes(args.characterId)) card.characterIds.push(args.characterId)
      }
      card.updatedAt = now()
      saveProject(path, project)
      return { set: true, cardId: card.id, characterId: args.characterId, beat: card.arcNotes[args.characterId] || '' }
    }
    case 'add_act': {
      const path = resolveProjectPath(args)
      const project = loadProject(path)
      const board = args.boardId ? boardById(project, args.boardId) : activeBoard(project)
      if (!board) fail(`No board with id ${args.boardId}.`)
      const accent = args.accent || COLUMN_ACCENTS[board.columns.length % COLUMN_ACCENTS.length]
      const column = makeColumn(args.title, accent)
      const index = args.index === undefined ? board.columns.length : Math.max(0, Math.min(args.index, board.columns.length))
      board.columns.splice(index, 0, column)
      saveProject(path, project)
      return { added: true, actId: column.id, boardId: board.id, index }
    }
    case 'rename_act': {
      const path = resolveProjectPath(args)
      const project = loadProject(path)
      const target = findAct(project, { actId: args.actId })
      if (!target) fail(`No act with id ${args.actId}.`)
      if (args.title !== undefined) target.column.title = args.title
      if (args.accent !== undefined) target.column.accent = args.accent
      saveProject(path, project)
      return { renamed: true, actId: target.column.id, title: target.column.title }
    }
    case 'reorder_acts': {
      const path = resolveProjectPath(args)
      const project = loadProject(path)
      const board = args.boardId ? boardById(project, args.boardId) : activeBoard(project)
      if (!board) fail(`No board with id ${args.boardId}.`)
      const byId = new Map(board.columns.map((c) => [c.id, c]))
      const ordered = args.order.map((id) => byId.get(id)).filter(Boolean)
      const rest = board.columns.filter((c) => !args.order.includes(c.id))
      board.columns = [...ordered, ...rest]
      saveProject(path, project)
      return { reordered: true, boardId: board.id, order: board.columns.map((c) => c.id) }
    }
    case 'delete_act': {
      const path = resolveProjectPath(args)
      const project = loadProject(path)
      const target = findAct(project, { actId: args.actId })
      if (!target) fail(`No act with id ${args.actId}.`)
      for (const cardId of target.column.cards) delete project.cards[cardId]
      target.board.columns = target.board.columns.filter((c) => c.id !== args.actId)
      saveProject(path, project)
      return { deleted: true, actId: args.actId, boardId: target.board.id }
    }
    case 'add_board': {
      const path = resolveProjectPath(args)
      const project = loadProject(path)
      const board = makeBoard(args.title)
      project.boards.push(board)
      if (args.setActive) project.activeBoardId = board.id
      saveProject(path, project)
      return { added: true, boardId: board.id, title: board.title, active: project.activeBoardId === board.id }
    }
    case 'rename_board': {
      const path = resolveProjectPath(args)
      const project = loadProject(path)
      const board = boardById(project, args.boardId)
      if (!board) fail(`No board with id ${args.boardId}.`)
      board.title = args.title
      saveProject(path, project)
      return { renamed: true, boardId: board.id, title: board.title }
    }
    case 'add_entity': {
      const path = resolveProjectPath(args)
      const project = loadProject(path)
      let entity
      if (args.kind === 'character') {
        entity = {
          id: uid('char'),
          name: args.name,
          color: args.color || ENTITY_COLORS[project.characters.length % ENTITY_COLORS.length],
          role: args.role || '',
          actor: args.actor || '',
          want: args.want || '',
          need: args.need || '',
          arc: args.arc || ''
        }
        project.characters.push(entity)
      } else if (args.kind === 'location') {
        entity = { id: uid('loc'), name: args.name, kind: args.locationKind || 'INT', notes: args.notes || '' }
        project.locations.push(entity)
      } else {
        entity = { id: uid('label'), name: args.name, color: args.color || ENTITY_COLORS[project.labels.length % ENTITY_COLORS.length] }
        project.labels.push(entity)
      }
      saveProject(path, project)
      return { added: true, kind: args.kind, id: entity.id, entity }
    }
    case 'update_entity': {
      const path = resolveProjectPath(args)
      const project = loadProject(path)
      const list = args.kind === 'character' ? project.characters : args.kind === 'location' ? project.locations : project.labels
      const entity = list.find((e) => e.id === args.id)
      if (!entity) fail(`No ${args.kind} with id ${args.id}.`)
      if (args.name !== undefined) entity.name = args.name
      if (args.kind === 'character') {
        for (const k of ['color', 'role', 'actor', 'want', 'need', 'arc']) if (args[k] !== undefined) entity[k] = args[k]
      } else if (args.kind === 'location') {
        if (args.locationKind !== undefined) entity.kind = args.locationKind
        if (args.notes !== undefined) entity.notes = args.notes
      } else {
        if (args.color !== undefined) entity.color = args.color
      }
      saveProject(path, project)
      return { updated: true, kind: args.kind, id: entity.id, entity }
    }
    case 'export_outline': {
      const project = loadProject(resolveProjectPath(args))
      return { format: 'markdown', text: buildMarkdownOutline(project) }
    }
    case 'export_scene_list': {
      const project = loadProject(resolveProjectPath(args))
      return { format: 'csv', text: buildCsv(project) }
    }
    case 'export_fountain': {
      const project = loadProject(resolveProjectPath(args))
      return { format: 'fountain', text: buildFountain(project) }
    }
    case 'export_json': {
      const project = loadProject(resolveProjectPath(args))
      return { format: 'json', project: { ...project, updatedAt: now() } }
    }
    case 'export_share_html': {
      const project = loadProject(resolveProjectPath(args))
      return { format: 'html', text: buildShareHtml(project) }
    }
    default:
      fail(`Unknown tool: ${name}`)
  }
}

/* ---------------------------- JSON-RPC plumbing ------------------------- */

function write(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }
function reply(id, result) { write({ jsonrpc: '2.0', id, result }) }
function replyError(id, code, message) { write({ jsonrpc: '2.0', id, error: { code, message } }) }

function handleToolCall(id, params) {
  const name = params?.name
  const args = params?.arguments ?? {}
  if (!TOOL_NAMES.has(name)) {
    reply(id, { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true })
    return
  }
  try {
    const result = runTool(name, args)
    reply(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] })
  } catch (error) {
    reply(id, { content: [{ type: 'text', text: error.userFacing ? error.message : `Error: ${error.message}` }], isError: true })
  }
}

function handle(msg) {
  const { id, method, params } = msg
  switch (method) {
    case 'initialize':
      reply(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'cork-board', version: '1.0.0' }
      })
      return
    case 'notifications/initialized':
      return
    case 'tools/list':
      reply(id, { tools: TOOLS })
      return
    case 'tools/call':
      handleToolCall(id, params)
      return
    case 'ping':
      reply(id, {})
      return
    default:
      if (id !== undefined && id !== null) replyError(id, -32601, `Method not found: ${method}`)
  }
}

/* ------------------------------- stdin loop ----------------------------- */

let buffer = ''
process.stdin.setEncoding('utf-8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let idx
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (!line) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      continue
    }
    handle(msg)
  }
})
process.stdin.on('end', () => process.exit(0))
