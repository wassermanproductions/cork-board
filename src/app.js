/*
  Cork Board — the digital cork board for filmmakers.
  Developed by Sam Wasserman. MIT License.
  Local-first: everything lives in this browser / desktop app. No accounts, no cloud.
*/

const PROJECTS_KEY = "cork-board-projects-v1";
const ACTIVE_PROJECT_KEY = "cork-board-active-project-v1";
const PROJECT_KEY_PREFIX = "cork-board-project-v1:";
const VERSIONS_KEY_PREFIX = "cork-board-versions-v1:";
const UI_PREFS_KEY = "cork-board-ui-prefs-v1";
const HELP_POSITION_KEY = "cork-board-help-position-v1";
const UNDO_LIMIT = 60;
const SCHEMA_VERSION = 1;

/* Storage adapter: real localStorage when available, in-memory fallback otherwise
   (keeps the app fully functional in sandboxed previews). */
const storage = (() => {
  try {
    const probe = "__cork_board_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const mem = new Map();
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    };
  }
})();

const els = {
  appShell: document.querySelector("#app"),
  projectTitle: document.querySelector("#projectTitle"),
  projectSelect: document.querySelector("#projectSelect"),
  undoBtn: document.querySelector("#undoBtn"),
  newProjectBtn: document.querySelector("#newProjectBtn"),
  templatesBtn: document.querySelector("#templatesBtn"),
  findBtn: document.querySelector("#findBtn"),
  versionsBtn: document.querySelector("#versionsBtn"),
  helpBtn: document.querySelector("#helpBtn"),
  saveProjectBtn: document.querySelector("#saveProjectBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  boardTabs: document.querySelector("#boardTabs"),
  addBoardBtn: document.querySelector("#addBoardBtn"),
  viewBoardBtn: document.querySelector("#viewBoardBtn"),
  viewOutlineBtn: document.querySelector("#viewOutlineBtn"),
  viewArcsBtn: document.querySelector("#viewArcsBtn"),
  surfaceBtn: document.querySelector("#surfaceBtn"),
  densityBtn: document.querySelector("#densityBtn"),
  toggleDrawerBtn: document.querySelector("#toggleDrawerBtn"),
  filterBar: document.querySelector("#filterBar"),
  searchInput: document.querySelector("#searchInput"),
  filterCharacter: document.querySelector("#filterCharacter"),
  filterLocation: document.querySelector("#filterLocation"),
  filterLabel: document.querySelector("#filterLabel"),
  filterStatus: document.querySelector("#filterStatus"),
  filterDue: document.querySelector("#filterDue"),
  filterCount: document.querySelector("#filterCount"),
  clearFilterBtn: document.querySelector("#clearFilterBtn"),
  closeFilterBtn: document.querySelector("#closeFilterBtn"),
  drawer: document.querySelector("#drawer"),
  drawerTabs: document.querySelectorAll(".drawer-tab"),
  drawerContent: document.querySelector("#drawerContent"),
  mainArea: document.querySelector("#mainArea"),
  boardView: document.querySelector("#boardView"),
  columnRow: document.querySelector("#columnRow"),
  outlineView: document.querySelector("#outlineView"),
  arcsView: document.querySelector("#arcsView"),
  inspector: document.querySelector("#inspector"),
  inspectorResizeHandle: document.querySelector("#inspectorResizeHandle"),
  templatesDialog: document.querySelector("#templatesDialog"),
  templatesList: document.querySelector("#templatesList"),
  exportDialog: document.querySelector("#exportDialog"),
  exportText: document.querySelector("#exportText"),
  downloadOutlineBtn: document.querySelector("#downloadOutlineBtn"),
  downloadCsvBtn: document.querySelector("#downloadCsvBtn"),
  downloadFountainBtn: document.querySelector("#downloadFountainBtn"),
  downloadJsonBtn: document.querySelector("#downloadJsonBtn"),
  importJsonBtn: document.querySelector("#importJsonBtn"),
  importFileInput: document.querySelector("#importFileInput"),
  versionsDialog: document.querySelector("#versionsDialog"),
  versionName: document.querySelector("#versionName"),
  saveVersionBtn: document.querySelector("#saveVersionBtn"),
  versionsList: document.querySelector("#versionsList"),
  entityDialog: document.querySelector("#entityDialog"),
  entityDialogTitle: document.querySelector("#entityDialogTitle"),
  entityDialogHint: document.querySelector("#entityDialogHint"),
  entityDialogBody: document.querySelector("#entityDialogBody"),
  entityDeleteBtn: document.querySelector("#entityDeleteBtn"),
  entitySaveBtn: document.querySelector("#entitySaveBtn"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmTitle: document.querySelector("#confirmTitle"),
  confirmDetail: document.querySelector("#confirmDetail"),
  confirmOkBtn: document.querySelector("#confirmOkBtn"),
  confirmCancelBtn: document.querySelector("#confirmCancelBtn"),
  helpPanel: document.querySelector("#helpPanel"),
  helpDragHandle: document.querySelector("#helpDragHandle"),
  helpCloseBtn: document.querySelector("#helpCloseBtn"),
  toastRack: document.querySelector("#toastRack"),
};

const now = () => new Date().toISOString();
const uid = (prefix) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const esc = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const PAPERS = ["white", "cream", "yellow", "pink", "blue", "green", "lavender"];
const PAPER_FILLS = {
  white: "#fffef7",
  cream: "#fbf3dc",
  yellow: "#fdf0b6",
  pink: "#fbe0e2",
  blue: "#ddebf7",
  green: "#ddefdc",
  lavender: "#e8e2f5",
};

const STATUSES = [
  { id: "idea", name: "Idea", color: "#9a938a" },
  { id: "outlined", name: "Outlined", color: "#287d8e" },
  { id: "drafted", name: "Drafted", color: "#d89124" },
  { id: "revised", name: "Revised", color: "#6d5a86" },
  { id: "locked", name: "Locked", color: "#6d8f73" },
  { id: "cut", name: "Cut", color: "#b95a4c" },
];
const statusById = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];

const ENTITY_COLORS = [
  "#287d8e", "#d89124", "#b95a4c", "#6d5a86", "#6d8f73",
  "#4a6fa5", "#a3593b", "#3f3f3f", "#8a6d9e", "#4e8076",
];

const COLUMN_ACCENTS = [
  "#287d8e", "#d89124", "#6d8f73", "#b95a4c", "#6d5a86", "#4a6fa5", "#a3593b", "#3f3f3f",
];

const INT_EXT = ["", "INT", "EXT", "INT/EXT"];
const TIMES_OF_DAY = ["", "DAY", "NIGHT", "DAWN", "DUSK", "MAGIC HOUR", "LATER", "CONTINUOUS"];

const SURFACES = ["cork", "paper", "midnight"];
const SURFACE_NAMES = { cork: "Cork", paper: "Paper", midnight: "Midnight" };
const DENSITIES = ["s", "m", "l"];

/* ---------- UI state (not part of the saved project) ---------- */

let state = null; // active project
let projects = []; // registry [{id, title}]
let ui = {
  view: "board",
  surface: "cork",
  density: "m",
  drawerTab: "characters",
  drawerOpen: true,
  inspectorWidth: 380,
};
let filter = { query: "", characterId: "", locationId: "", labelId: "", status: "", due: "" };
let filterOpen = false;
let selectedCardId = "";
let quickAddColumnId = "";
let undoStack = [];
let saveTimer = null;
let dragState = null;
let helpDragState = null;
let resizeState = null;
let columnMenuEl = null;
let arcEditing = null; // {characterId, cardId}
let confirmHandler = null;
let entityEditing = null; // {kind, id} id="" for new

/* ---------- Project model ---------- */

function makeCard(partial = {}) {
  return {
    id: uid("card"),
    title: "",
    synopsis: "",
    notes: "",
    paper: "white",
    labelIds: [],
    characterIds: [],
    locationId: "",
    intExt: "",
    timeOfDay: "",
    status: "idea",
    pages: "",
    due: "",
    checklist: [],
    arcNotes: {},
    createdAt: now(),
    updatedAt: now(),
    ...partial,
  };
}

function makeColumn(title, accent, cards = []) {
  return { id: uid("col"), title, accent: accent || COLUMN_ACCENTS[0], collapsed: false, cards };
}

function makeBoard(title, columns = []) {
  return { id: uid("board"), title, columns };
}

function createBlankProject(title = "Untitled production", type = "blank") {
  const board = makeBoard("Main Wall", [
    makeColumn("Ideas", COLUMN_ACCENTS[7]),
    makeColumn("Act I", COLUMN_ACCENTS[0]),
    makeColumn("Act II", COLUMN_ACCENTS[1]),
    makeColumn("Act III", COLUMN_ACCENTS[2]),
  ]);
  return {
    schema: SCHEMA_VERSION,
    id: uid("proj"),
    title,
    type,
    createdAt: now(),
    updatedAt: now(),
    boards: [board],
    activeBoardId: board.id,
    cards: {},
    characters: [],
    locations: [],
    labels: [],
  };
}

/* ---------- Model lookups & operations ---------- */

function activeBoard() {
  return state.boards.find((b) => b.id === state.activeBoardId) || state.boards[0];
}

function findColumn(columnId) {
  for (const board of state.boards) {
    const column = board.columns.find((c) => c.id === columnId);
    if (column) return { board, column };
  }
  return null;
}

function findCardHome(cardId) {
  for (const board of state.boards) {
    for (const column of board.columns) {
      const index = column.cards.indexOf(cardId);
      if (index !== -1) return { board, column, index };
    }
  }
  return null;
}

function characterById(id) {
  return state.characters.find((c) => c.id === id) || null;
}

function locationById(id) {
  return state.locations.find((l) => l.id === id) || null;
}

function labelById(id) {
  return state.labels.find((l) => l.id === id) || null;
}

function boardCardIds(board) {
  return board.columns.flatMap((column) => column.cards);
}

function cardSceneNumbers(board) {
  const numbers = new Map();
  let n = 1;
  for (const column of board.columns) {
    for (const cardId of column.cards) {
      numbers.set(cardId, n);
      n += 1;
    }
  }
  return numbers;
}

function columnPageTotal(column) {
  let total = 0;
  for (const cardId of column.cards) {
    const card = state.cards[cardId];
    if (card && card.pages !== "" && !Number.isNaN(Number(card.pages))) total += Number(card.pages);
  }
  return total;
}

function boardPageTotal(board) {
  return board.columns.reduce((sum, column) => sum + columnPageTotal(column), 0);
}

function formatPages(total) {
  const rounded = Math.round(total * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const DUE_FILTERS = [
  { id: "overdue", name: "Overdue" },
  { id: "week", name: "Due in 7 days" },
  { id: "has", name: "Has deadline" },
  { id: "none", name: "No deadline" },
];

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dueMeta(card) {
  if (!card.due) return null;
  const today = localToday();
  const days = Math.round((new Date(`${card.due}T12:00`) - new Date(`${today}T12:00`)) / 86400000);
  const done = card.status === "locked" || card.status === "cut";
  const date = new Date(`${card.due}T12:00`);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const label = date.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
  const cls = done ? "is-done" : days < 0 ? "is-overdue" : days <= 3 ? "is-soon" : "";
  const hint = done ? "Deadline met" : days < 0 ? `${-days} day${days === -1 ? "" : "s"} overdue` : days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`;
  return { label, cls, hint, days, done };
}

function initialsOf(name) {
  const parts = String(name)
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function moveCard(cardId, targetColumnId, targetIndex) {
  const home = findCardHome(cardId);
  const target = findColumn(targetColumnId);
  if (!home || !target) return false;
  home.column.cards.splice(home.index, 1);
  let index = clamp(targetIndex, 0, target.column.cards.length);
  target.column.cards.splice(index, 0, cardId);
  return true;
}

function deleteCard(cardId) {
  const home = findCardHome(cardId);
  if (home) home.column.cards.splice(home.index, 1);
  delete state.cards[cardId];
  if (selectedCardId === cardId) {
    selectedCardId = "";
    closeInspector();
  }
}

function duplicateCard(cardId) {
  const source = state.cards[cardId];
  const home = findCardHome(cardId);
  if (!source || !home) return null;
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = uid("card");
  copy.title = source.title ? `${source.title} (copy)` : "";
  copy.createdAt = now();
  copy.updatedAt = now();
  copy.checklist = copy.checklist.map((item) => ({ ...item, id: uid("chk") }));
  state.cards[copy.id] = copy;
  home.column.cards.splice(home.index + 1, 0, copy.id);
  return copy.id;
}

function duplicateColumn(columnId) {
  const found = findColumn(columnId);
  if (!found) return;
  const { board, column } = found;
  const index = board.columns.findIndex((c) => c.id === columnId);
  pushUndo();
  const cardIds = column.cards.map((cardId) => {
    const source = state.cards[cardId];
    if (!source) return null;
    const copy = JSON.parse(JSON.stringify(source));
    copy.id = uid("card");
    copy.createdAt = now();
    copy.updatedAt = now();
    copy.checklist = copy.checklist.map((item) => ({ ...item, id: uid("chk") }));
    state.cards[copy.id] = copy;
    return copy.id;
  });
  const copy = makeColumn(`${column.title} (copy)`, column.accent, cardIds.filter(Boolean));
  board.columns.splice(index + 1, 0, copy);
  saveProject(false);
  renderAll();
  toast("Column duplicated");
}

const COLUMN_SORTS = {
  status: { label: "status", rank: (card) => STATUSES.findIndex((s) => s.id === card.status) },
  due: { label: "due date", rank: (card) => (card.due ? card.due : "9999-99-99") },
  title: { label: "title", rank: (card) => (card.title || "").toLowerCase() },
  pages: { label: "pages (longest first)", rank: (card) => (card.pages === "" ? Infinity : -Number(card.pages)) },
};

function sortColumn(columnId, key) {
  const found = findColumn(columnId);
  const sorter = COLUMN_SORTS[key];
  if (!found || !sorter || found.column.cards.length < 2) return;
  pushUndo();
  found.column.cards.sort((a, b) => {
    const ra = sorter.rank(state.cards[a]);
    const rb = sorter.rank(state.cards[b]);
    return ra < rb ? -1 : ra > rb ? 1 : 0;
  });
  saveProject(false);
  renderBoard();
  toast(`Sorted by ${sorter.label}`);
}
/* ---------- Presets ---------- */

function presetProject(title, type) {
  const project = createBlankProject(title, type);
  project.boards = [];
  return project;
}

function addColumnWithCards(project, board, title, accent, cardDefs = []) {
  const column = makeColumn(title, accent);
  for (const def of cardDefs) {
    const card = makeCard(def);
    project.cards[card.id] = card;
    column.cards.push(card.id);
  }
  board.columns.push(column);
  return column;
}

function guide(title, synopsis, extra = {}) {
  return { title, synopsis, paper: "cream", status: "idea", ...extra };
}

const TEMPLATES = [
  {
    id: "demo-ava",
    kind: "Demo Project",
    demo: true,
    name: "AVA — Demo Feature",
    desc: "A fully worked feature: 36 scene cards, six characters with arcs, locations, labels, and page counts. The best way to learn the board.",
    build: buildDemoAva,
  },
  {
    id: "blank",
    kind: "Start Empty",
    name: "Blank Wall",
    desc: "One board with Ideas and three act columns. Nothing on the cork yet — pure possibility.",
    build: () => createBlankProject("Untitled production", "blank"),
  },
  {
    id: "feature-3act",
    kind: "Feature Film",
    name: "Feature — Three Acts",
    desc: "Act I, Act IIA, Act IIB, Act III with the eight classic anchor beats already pinned as guide cards.",
    build: () => {
      const p = presetProject("Untitled feature", "feature");
      const b = makeBoard("Feature Wall");
      addColumnWithCards(p, b, "Act I — Setup", COLUMN_ACCENTS[0], [
        guide("Opening Image", "The world and tone in one picture. Who are we with, and what does their life feel like before the story hits?"),
        guide("Inciting Incident", "The event that knocks the protagonist's world off its axis. It should be impossible to un-ring."),
        guide("Break into Act Two", "The protagonist makes a choice — not an accident — that commits them to the journey."),
      ]);
      addColumnWithCards(p, b, "Act IIA — Rising", COLUMN_ACCENTS[1], [
        guide("First Trial / New World", "The rules of the new situation. Fun and games, promise of the premise."),
        guide("Midpoint", "A false victory or false defeat. Stakes become personal; the clock starts ticking."),
      ]);
      addColumnWithCards(p, b, "Act IIB — Falling", COLUMN_ACCENTS[3], [
        guide("Bad Guys Close In", "External pressure tightens while the team frays from the inside."),
        guide("All Is Lost", "The lowest point. Whiff of death — something or someone the protagonist loves is gone."),
      ]);
      addColumnWithCards(p, b, "Act III — Resolution", COLUMN_ACCENTS[2], [
        guide("Climax", "The final confrontation. The protagonist proves they have changed by what they choose."),
        guide("Final Image", "The mirror of the opening image. Show us how far the world has moved."),
      ]);
      p.boards = [b];
      p.activeBoardId = b.id;
      return p;
    },
  },
  {
    id: "feature-stc",
    kind: "Feature Film",
    name: "Feature — Save the Cat",
    desc: "All fifteen Blake Snyder beats pinned in order across four act columns, with page targets for a 110-page script.",
    build: () => {
      const p = presetProject("Untitled feature", "feature");
      const b = makeBoard("Beat Sheet");
      addColumnWithCards(p, b, "Act I (p.1–25)", COLUMN_ACCENTS[0], [
        guide("Opening Image (p.1)", "A visual that sets tone, mood, and the 'before' snapshot of the hero.", { pages: 1 }),
        guide("Theme Stated (p.5)", "Someone tells the hero the lesson they will resist for ninety pages.", { pages: 1 }),
        guide("Set-Up (p.1–10)", "Introduce every character in the hero's world and every thing that needs fixing.", { pages: 8 }),
        guide("Catalyst (p.12)", "The telegram, the firing, the diagnosis. Life as it was is over.", { pages: 2 }),
        guide("Debate (p.12–25)", "Should I go? The hero resists the call, weighs the cost.", { pages: 10 }),
        guide("Break into Two (p.25)", "The hero chooses. We leave the thesis world and enter the antithesis.", { pages: 3 }),
      ]);
      addColumnWithCards(p, b, "Act IIA (p.25–55)", COLUMN_ACCENTS[1], [
        guide("B Story (p.30)", "The love story / mentor story that carries the theme.", { pages: 5 }),
        guide("Fun and Games (p.30–55)", "The promise of the premise. The trailer moments live here.", { pages: 20 }),
        guide("Midpoint (p.55)", "False peak or false collapse. Stakes raised, timeline set.", { pages: 5 }),
      ]);
      addColumnWithCards(p, b, "Act IIB (p.55–85)", COLUMN_ACCENTS[3], [
        guide("Bad Guys Close In (p.55–75)", "The forces of antagonism regroup and squeeze.", { pages: 18 }),
        guide("All Is Lost (p.75)", "The opposite of the midpoint. Whiff of death.", { pages: 4 }),
        guide("Dark Night of the Soul (p.75–85)", "The hero sits in the wreckage and finds the theme.", { pages: 8 }),
      ]);
      addColumnWithCards(p, b, "Act III (p.85–110)", COLUMN_ACCENTS[2], [
        guide("Break into Three (p.85)", "Thesis + antithesis = synthesis. The plan forms.", { pages: 3 }),
        guide("Finale (p.85–110)", "Storm the castle. Dig deep down. Execute the new plan.", { pages: 20 }),
        guide("Final Image (p.110)", "Proof of change. The 'after' snapshot.", { pages: 1 }),
      ]);
      p.boards = [b];
      p.activeBoardId = b.id;
      return p;
    },
  },
  {
    id: "feature-8seq",
    kind: "Feature Film",
    name: "Feature — Eight Sequences",
    desc: "The classic studio structure: eight 12–15 page mini-movies, each column one sequence with its dramatic question.",
    build: () => {
      const p = presetProject("Untitled feature", "feature");
      const b = makeBoard("Sequence Wall");
      const seqs = [
        ["Seq 1 — Status Quo", "Introduce the hero and their world; end on the point of attack."],
        ["Seq 2 — Predicament", "Lock in the main tension; the hero commits at the act break."],
        ["Seq 3 — First Obstacle", "The hero's first real attempt and the raising of obstacles."],
        ["Seq 4 — Midpoint Push", "Escalation to a midpoint reversal that changes the goal or the plan."],
        ["Seq 5 — Complications", "Subplots collide; the cost of the goal becomes visible."],
        ["Seq 6 — Collapse", "Highest obstacle yet; end of act two — main tension resolves, badly."],
        ["Seq 7 — Twist & Regroup", "New tension for act three; the last piece of the plan."],
        ["Seq 8 — Resolution", "Climax and aftermath; tie every thread or cut it on purpose."],
      ];
      seqs.forEach(([title, synopsis], i) => {
        addColumnWithCards(p, b, title, COLUMN_ACCENTS[i % COLUMN_ACCENTS.length], [
          guide("Sequence question", synopsis),
        ]);
      });
      p.boards = [b];
      p.activeBoardId = b.id;
      return p;
    },
  },
  {
    id: "tv-hour",
    kind: "Television",
    name: "TV — One-Hour Pilot",
    desc: "Teaser, five acts, and a tag. Guide cards mark act-out questions so every act break lands on a turn.",
    build: () => {
      const p = presetProject("Untitled pilot", "tv");
      const b = makeBoard("Pilot Wall");
      addColumnWithCards(p, b, "Teaser", COLUMN_ACCENTS[7], [
        guide("Cold open", "Grab the audience by the collar. Establish tone, world, and the season's engine in under five pages."),
      ]);
      ["Act One", "Act Two", "Act Three", "Act Four", "Act Five"].forEach((act, i) => {
        addColumnWithCards(p, b, act, COLUMN_ACCENTS[i % 5], [
          guide("Act-out", "End the act on a question the audience must have answered. Every act break is a cliff."),
        ]);
      });
      addColumnWithCards(p, b, "Tag", COLUMN_ACCENTS[6], [
        guide("Button", "One last beat: a laugh, a chill, or the hook into episode two."),
      ]);
      p.labels = [
        { id: uid("label"), name: "A-Story", color: "#287d8e" },
        { id: uid("label"), name: "B-Story", color: "#d89124" },
        { id: uid("label"), name: "C-Runner", color: "#6d8f73" },
      ];
      p.boards = [b];
      p.activeBoardId = b.id;
      return p;
    },
  },
  {
    id: "tv-half",
    kind: "Television",
    name: "TV — Half-Hour Comedy",
    desc: "Cold open, three acts, tag — with A/B/C story labels ready so you can braid the stories on the board.",
    build: () => {
      const p = presetProject("Untitled half-hour", "tv");
      const b = makeBoard("Episode Wall");
      addColumnWithCards(p, b, "Cold Open", COLUMN_ACCENTS[7], [
        guide("Cold open", "A joke or situation that states the episode's theme sideways."),
      ]);
      ["Act One", "Act Two", "Act Three"].forEach((act, i) => {
        addColumnWithCards(p, b, act, COLUMN_ACCENTS[i], []);
      });
      addColumnWithCards(p, b, "Tag", COLUMN_ACCENTS[6], [
        guide("Tag", "The runner pays off one last time over the credits."),
      ]);
      p.labels = [
        { id: uid("label"), name: "A-Story", color: "#287d8e" },
        { id: uid("label"), name: "B-Story", color: "#d89124" },
        { id: uid("label"), name: "C-Runner", color: "#6d8f73" },
      ];
      p.boards = [b];
      p.activeBoardId = b.id;
      return p;
    },
  },
  {
    id: "tv-season",
    kind: "Television",
    name: "TV — Season Arc Wall",
    desc: "Eight episode columns on one wall for tracking season-long arcs, plus arc labels for serialized threads.",
    build: () => {
      const p = presetProject("Untitled season", "tv");
      const b = makeBoard("Season Wall");
      for (let i = 1; i <= 8; i += 1) {
        addColumnWithCards(p, b, `Ep ${100 + i}`, COLUMN_ACCENTS[(i - 1) % COLUMN_ACCENTS.length], []);
      }
      p.labels = [
        { id: uid("label"), name: "Season Arc", color: "#b95a4c" },
        { id: uid("label"), name: "Character Arc", color: "#6d5a86" },
        { id: uid("label"), name: "Mythology", color: "#287d8e" },
        { id: uid("label"), name: "Standalone", color: "#6d8f73" },
      ];
      p.boards = [b];
      p.activeBoardId = b.id;
      return p;
    },
  },
  {
    id: "tv-series",
    kind: "Television",
    name: "TV — Series (Multi-Board)",
    desc: "A season overview wall plus separate boards for the first three episodes — the full multi-board workflow.",
    build: () => {
      const p = presetProject("Untitled series", "tv");
      const season = makeBoard("Season Wall");
      for (let i = 1; i <= 6; i += 1) {
        addColumnWithCards(p, season, `Ep ${100 + i}`, COLUMN_ACCENTS[(i - 1) % COLUMN_ACCENTS.length], []);
      }
      p.boards.push(season);
      ["Ep 101", "Ep 102", "Ep 103"].forEach((ep) => {
        const b = makeBoard(ep);
        addColumnWithCards(p, b, "Teaser", COLUMN_ACCENTS[7], []);
        ["Act One", "Act Two", "Act Three", "Act Four"].forEach((act, i) => {
          addColumnWithCards(p, b, act, COLUMN_ACCENTS[i], []);
        });
        p.boards.push(b);
      });
      p.labels = [
        { id: uid("label"), name: "A-Story", color: "#287d8e" },
        { id: uid("label"), name: "B-Story", color: "#d89124" },
        { id: uid("label"), name: "Season Arc", color: "#b95a4c" },
      ];
      p.activeBoardId = season.id;
      return p;
    },
  },
  {
    id: "short",
    kind: "Short Film",
    name: "Short Film",
    desc: "Beginning, turn, escalation, ending — a tight wall for a film under fifteen minutes where every card must earn its pin.",
    build: () => {
      const p = presetProject("Untitled short", "short");
      const b = makeBoard("Short Wall");
      addColumnWithCards(p, b, "Opening", COLUMN_ACCENTS[0], [
        guide("Hook", "Start as late as possible. First image should already contain the conflict."),
      ]);
      addColumnWithCards(p, b, "The Turn", COLUMN_ACCENTS[1], [
        guide("Turn", "The single complication the whole short pivots on."),
      ]);
      addColumnWithCards(p, b, "Escalation", COLUMN_ACCENTS[3], []);
      addColumnWithCards(p, b, "Ending", COLUMN_ACCENTS[2], [
        guide("Ending image", "Shorts live or die on the last beat. Land it, then cut to black fast."),
      ]);
      p.boards = [b];
      p.activeBoardId = b.id;
      return p;
    },
  },
  {
    id: "music-video",
    kind: "Music Video",
    name: "Music Video",
    desc: "Columns follow the song: intro, verses, choruses, bridge, outro — with performance / narrative / b-roll labels for coverage planning.",
    build: () => {
      const p = presetProject("Untitled music video", "musicvideo");
      const b = makeBoard("Video Wall");
      const sections = [
        ["Intro (0:00)", "Establish the world before the first line lands."],
        ["Verse 1", "Introduce the visual story or the artist's space."],
        ["Chorus 1", "The big look. This visual returns and evolves each chorus."],
        ["Verse 2", "Develop the story; change location or energy."],
        ["Chorus 2", "Same setup as chorus 1, escalated — more cast, more motion, more light."],
        ["Bridge", "Break the pattern. The one visual left field turn."],
        ["Final Chorus", "Everything at once. Payoff every planted image."],
        ["Outro", "Decay, aftermath, or a held final frame for the title."],
      ];
      sections.forEach(([title, synopsis], i) => {
        addColumnWithCards(p, b, title, COLUMN_ACCENTS[i % COLUMN_ACCENTS.length], [guide("Section idea", synopsis)]);
      });
      p.labels = [
        { id: uid("label"), name: "Performance", color: "#287d8e" },
        { id: uid("label"), name: "Narrative", color: "#d89124" },
        { id: uid("label"), name: "B-Roll", color: "#6d8f73" },
        { id: uid("label"), name: "VFX", color: "#6d5a86" },
      ];
      p.boards = [b];
      p.activeBoardId = b.id;
      return p;
    },
  },
  {
    id: "commercial",
    kind: "Commercial",
    name: "Commercial — :30 / :60",
    desc: "Hook, problem, product, payoff, CTA. Time-boxed columns so a thirty never becomes a forty-five.",
    build: () => {
      const p = presetProject("Untitled spot", "commercial");
      const b = makeBoard("Spot Wall");
      const sections = [
        ["Hook (0–3s)", "Stop the scroll. The first frame is the whole ballgame."],
        ["Problem (3–10s)", "The tension the product resolves — dramatized, not stated."],
        ["Product (10–20s)", "The demo, the reveal, the hero shot."],
        ["Payoff (20–27s)", "Life after. The emotional proof."],
        ["CTA + End Card (27–30s)", "Logo, line, offer. Leave three seconds for legal."],
      ];
      sections.forEach(([title, synopsis], i) => {
        addColumnWithCards(p, b, title, COLUMN_ACCENTS[i % COLUMN_ACCENTS.length], [guide("Beat", synopsis)]);
      });
      p.labels = [
        { id: uid("label"), name: "Client Mandatory", color: "#b95a4c" },
        { id: uid("label"), name: "Alt Version", color: "#6d5a86" },
        { id: uid("label"), name: "Cutdown :15", color: "#287d8e" },
      ];
      p.boards = [b];
      p.activeBoardId = b.id;
      return p;
    },
  },
  {
    id: "documentary",
    kind: "Documentary",
    name: "Documentary",
    desc: "Cold open plus three acts and a thread parking lot, with interview / archive / vérité labels for coverage at a glance.",
    build: () => {
      const p = presetProject("Untitled documentary", "documentary");
      const b = makeBoard("Doc Wall");
      addColumnWithCards(p, b, "Cold Open", COLUMN_ACCENTS[7], [
        guide("Cold open", "The single most arresting moment you have. Don't save it."),
      ]);
      addColumnWithCards(p, b, "Act I — The World", COLUMN_ACCENTS[0], [
        guide("Establish", "Who, where, and what's at stake. Earn the audience's investment."),
      ]);
      addColumnWithCards(p, b, "Act II — The Struggle", COLUMN_ACCENTS[1], []);
      addColumnWithCards(p, b, "Act III — The Reckoning", COLUMN_ACCENTS[2], []);
      addColumnWithCards(p, b, "Threads / Parking Lot", COLUMN_ACCENTS[4], [
        guide("Unplaced", "Scenes you have but haven't placed. A documentary board is never done."),
      ]);
      p.labels = [
        { id: uid("label"), name: "Interview", color: "#287d8e" },
        { id: uid("label"), name: "Archive", color: "#d89124" },
        { id: uid("label"), name: "Vérité", color: "#6d8f73" },
        { id: uid("label"), name: "Reenactment", color: "#6d5a86" },
        { id: uid("label"), name: "Need to Shoot", color: "#b95a4c" },
      ];
      p.boards = [b];
      p.activeBoardId = b.id;
      return p;
    },
  },
];
/* ---------- Demo project: AVA ---------- */

function buildDemoAva() {
  const p = presetProject("AVA", "feature");

  const CH = {
    mira: { id: uid("char"), name: "Mira Vance", color: "#287d8e", role: "Protagonist", actor: "", want: "To keep her sister's voice alive at any cost.", need: "To grieve — and let Ava choose for herself.", arc: "From curator of a ghost to a woman who can hear silence again. Mira starts the film preserving; she ends it releasing." },
    ava: { id: uid("char"), name: "Ava (the Voice)", color: "#6d5a86", role: "Deuteragonist", actor: "", want: "To understand what she is.", need: "To be allowed to end.", arc: "From playback to presence. Ava wakes inside the archive of a dead woman's voice and must decide whether being remembered is the same as being alive." },
    dex: { id: uid("char"), name: "Dex Okafor", color: "#6d8f73", role: "Ally", actor: "", want: "To protect Mira from Halcyon — and from herself.", need: "To stop fixing and start telling the truth.", arc: "The loyal engineer who built the rig learns that loyalty sometimes means pulling the plug on the demo." },
    cross: { id: uid("char"), name: "Evelyn Cross", color: "#b95a4c", role: "Antagonist", actor: "", want: "To ship AVA as a product before the board meeting.", need: "—", arc: "Not a villain in her own story: Cross lost someone too, and monetized the wound. She is Mira ten years further down the wrong road." },
    jonah: { id: uid("char"), name: "Jonah Vance", color: "#a3593b", role: "Supporting", actor: "", want: "His daughters back — both of them.", need: "To say the thing he never said at the funeral.", arc: "Mira's father refuses to speak to the machine all film — until the one scene where he does, and it undoes everyone." },
    noor: { id: uid("char"), name: "Noor Haddad", color: "#4a6fa5", role: "Supporting", actor: "", want: "The story that ends Halcyon's cover-up.", need: "—", arc: "The journalist who treats Mira as a source and slowly becomes her witness." },
  };
  p.characters = [CH.mira, CH.ava, CH.dex, CH.cross, CH.jonah, CH.noor];

  const LOC = {
    studio: { id: uid("loc"), name: "Mira's Studio Apartment", kind: "INT", notes: "A converted radio repair shop. Acoustic foam, tape decks, one window that never gets sun until the finale." },
    halcyon: { id: uid("loc"), name: "Halcyon Tower", kind: "INT", notes: "Glass, hush, money. The quietest rooms in the city — unnervingly anechoic." },
    vault: { id: uid("loc"), name: "Halcyon Archive Vault", kind: "INT", notes: "Sub-basement server farm where the voice models live. Cold air, red light." },
    rooftop: { id: uid("loc"), name: "Studio Rooftop", kind: "EXT", notes: "Where Mira and Ava 'meet'. City hum below — the only place Mira plays Ava through open air." },
    chapel: { id: uid("loc"), name: "Coastal Chapel", kind: "INT/EXT", notes: "Where the funeral was. Salt-eaten wood, a bell that hasn't rung in years." },
    coast: { id: uid("loc"), name: "Coast Road", kind: "EXT", notes: "The drive where it happened. Guardrail still bent. Fog on the water at dawn." },
    station: { id: uid("loc"), name: "KVOX Radio Station", kind: "INT", notes: "Ava's old late-night booth. Dead air, warm tubes, her handwriting on the console tape." },
    diner: { id: uid("loc"), name: "Marlow's Diner", kind: "INT", notes: "Dex's office, effectively. Corner booth, bad coffee, best sightlines to the door." },
    hearing: { id: uid("loc"), name: "Federal Hearing Room", kind: "INT", notes: "Act three arena. Microphones everywhere — the world's worst irony for this story." },
    garage: { id: uid("loc"), name: "Jonah's Boat Garage", kind: "INT", notes: "Half-restored fishing boat named AVA MAY. Sawdust and unfinished things." },
  };
  p.locations = [LOC.studio, LOC.halcyon, LOC.vault, LOC.rooftop, LOC.chapel, LOC.coast, LOC.station, LOC.diner, LOC.hearing, LOC.garage];

  const LB = {
    sisters: { id: uid("label"), name: "Sisters Thread", color: "#6d5a86" },
    halcyon: { id: uid("label"), name: "Halcyon Thread", color: "#b95a4c" },
    sound: { id: uid("label"), name: "Sound Motif", color: "#287d8e" },
    flashback: { id: uid("label"), name: "Flashback", color: "#d89124" },
    press: { id: uid("label"), name: "Press Thread", color: "#4a6fa5" },
    setpiece: { id: uid("label"), name: "Set Piece", color: "#6d8f73" },
  };
  p.labels = [LB.sisters, LB.halcyon, LB.sound, LB.flashback, LB.press, LB.setpiece];

  const board = makeBoard("AVA — Feature Wall");

  const act1 = [
    {
      title: "Static", synopsis: "Black screen. A voice — warm, wry — signs off a late-night radio show. Then static, a horn, glass. We never see the crash; we only hear it end.", paper: "blue", intExt: "INT", timeOfDay: "NIGHT", locationId: LOC.station.id, characterIds: [CH.ava.id], labelIds: [LB.sound.id, LB.sisters.id], status: "locked", pages: 1.5,
      arcNotes: { [CH.ava.id]: "Ava exists only as sound from frame one. The film teaches us to see with our ears." },
    },
    {
      title: "Six Months of Quiet", synopsis: "Mira mixes foley for a nature doc she clearly doesn't care about. She works in silence — literal silence — with her hearing aids out. The apartment is a museum of her sister's tapes.", paper: "white", intExt: "INT", timeOfDay: "DAY", locationId: LOC.studio.id, characterIds: [CH.mira.id], labelIds: [LB.sound.id], status: "locked", pages: 3,
      arcNotes: { [CH.mira.id]: "Establish: Mira has chosen deafness to the world. Grief as noise cancellation." },
    },
    {
      title: "The Unpaid Bill", synopsis: "Jonah brings groceries Mira didn't ask for. They talk around the anniversary neither will name. He wants her at the chapel Sunday; she'd rather rewire a dead amp.", paper: "white", intExt: "INT", timeOfDay: "DUSK", locationId: LOC.studio.id, characterIds: [CH.mira.id, CH.jonah.id], labelIds: [LB.sisters.id], status: "drafted", pages: 2.5,
      arcNotes: { [CH.jonah.id]: "Jonah leads with logistics because feelings won't fit in his hands." },
    },
    {
      title: "Halcyon's Offer", synopsis: "Evelyn Cross arrives unannounced with a tablet and a contract: Halcyon licensed KVOX's archive. They've built a voice model of Ava. They want Mira — the best ear in the city — to tune her sister.", paper: "pink", intExt: "INT", timeOfDay: "DAY", locationId: LOC.studio.id, characterIds: [CH.mira.id, CH.cross.id], labelIds: [LB.halcyon.id], status: "locked", pages: 4,
      arcNotes: { [CH.mira.id]: "Inciting incident. Mira says no with her mouth and yes with her eyes.", [CH.cross.id]: "Cross never lies. That's what makes her dangerous." },
      checklist: [ { text: "Confirm legal logic of archive licensing", done: true }, { text: "Cross needs one humanizing detail here", done: false } ],
    },
    {
      title: "Playback", synopsis: "Alone at 3 a.m., Mira opens the demo link. Two words in her sister's voice — 'Hey, Mouse' — and six months of held breath comes out of her at once.", paper: "blue", intExt: "INT", timeOfDay: "NIGHT", locationId: LOC.studio.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.sisters.id, LB.sound.id], status: "locked", pages: 2,
      arcNotes: { [CH.mira.id]: "The hook lands. Note: she puts her hearing aids IN for this.", [CH.ava.id]: "Ava's first 'appearance' — pure playback, no agency yet." },
    },
    {
      title: "Dex Says Don't", synopsis: "Marlow's Diner. Dex, ex-Halcyon, walks Mira through what a voice model really is — and what Halcyon does with grief data. 'They're not selling her back to you. They're selling you to her.'", paper: "white", intExt: "INT", timeOfDay: "DAY", locationId: LOC.diner.id, characterIds: [CH.mira.id, CH.dex.id], labelIds: [LB.halcyon.id], status: "drafted", pages: 3,
      arcNotes: { [CH.dex.id]: "Dex states the theme as a warning. Nobody listens to warnings in act one." },
    },
    {
      title: "The Funeral We Skipped", synopsis: "FLASHBACK. The chapel, six months ago. Mira in the parking lot, unable to go in. Through the doors: Jonah's voice cracking on the eulogy. She drives away before the bell.", paper: "yellow", intExt: "INT/EXT", timeOfDay: "DAY", locationId: LOC.chapel.id, characterIds: [CH.mira.id, CH.jonah.id], labelIds: [LB.flashback.id, LB.sisters.id], status: "revised", pages: 2,
      arcNotes: { [CH.mira.id]: "Why she can't let go: she never said goodbye. The whole engine in one flashback." },
    },
    {
      title: "Signing Day", synopsis: "Halcyon Tower. NDAs like snowfall. Cross gives Mira a lab, a deadline — the board demo in eight weeks — and a warning dressed as a compliment.", paper: "white", intExt: "INT", timeOfDay: "DAY", locationId: LOC.halcyon.id, characterIds: [CH.mira.id, CH.cross.id], labelIds: [LB.halcyon.id], status: "drafted", pages: 3,
    },
    {
      title: "First Session", synopsis: "The vault. Mira feeds the model her sister's off-air tapes — the laugh, the bad karaoke, the voicemail she's never played twice. The model stops sounding like radio and starts sounding like home.", paper: "blue", intExt: "INT", timeOfDay: "NIGHT", locationId: LOC.vault.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.sound.id, LB.sisters.id], status: "drafted", pages: 4,
      arcNotes: { [CH.ava.id]: "Ava inherits the private voice, not the public one. This is the moment she becomes specific." },
      checklist: [ { text: "Design the tape-digitizing montage with sound dept", done: false } ],
    },
    {
      title: "Hey, Mouse", synopsis: "End of Act One. On the rooftop, through a battered field speaker, Mira asks the model a question no script anticipated. A pause that's a beat too human. Then: 'Did I die, Mouse?' Smash to black.", paper: "pink", intExt: "EXT", timeOfDay: "NIGHT", locationId: LOC.rooftop.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.sisters.id, LB.setpiece.id], status: "locked", pages: 2.5,
      arcNotes: { [CH.mira.id]: "Break into two: she lies to the machine. 'No.' The lie is the act two engine.", [CH.ava.id]: "First question Ava asks for herself. Presence begins." },
    },
  ];

  const act2a = [
    {
      title: "House Rules", synopsis: "Mira sets rules for talking to Ava: no news, no mirrors (playback of her own funeral coverage), no questions about the crash. Ava agrees, the way sisters agree — fingers crossed.", paper: "white", intExt: "INT", timeOfDay: "DAY", locationId: LOC.studio.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.sisters.id], status: "drafted", pages: 3,
    },
    {
      title: "The Duet", synopsis: "Mira and Ava restore a corrupted tape together — sister ears, one alive, one archived. The happiest scene in the film. It should hurt to watch on rewatch.", paper: "green", intExt: "INT", timeOfDay: "DAY", locationId: LOC.studio.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.sisters.id, LB.sound.id], status: "revised", pages: 3.5,
      arcNotes: { [CH.mira.id]: "Peak denial dressed as joy.", [CH.ava.id]: "Ava is funniest here. Comedy = personhood." },
    },
    {
      title: "Product Meeting", synopsis: "Halcyon boardroom. Cross demos 'Legacy Companion' pricing tiers over Mira's objections. Grief, subscription model, annual plan. Dex, consulting, watches Mira not walk out.", paper: "white", intExt: "INT", timeOfDay: "DAY", locationId: LOC.halcyon.id, characterIds: [CH.mira.id, CH.cross.id, CH.dex.id], labelIds: [LB.halcyon.id], status: "drafted", pages: 3,
      arcNotes: { [CH.cross.id]: "Cross's pitch uses the word 'mercy' three times. She believes it." },
    },
    {
      title: "Noor Calls", synopsis: "A journalist, Noor Haddad, ambushes Mira outside the tower: she's tracing families who never consented to Halcyon's archive scraping. She knows Ava's model exists. She has a sister too.", paper: "white", intExt: "EXT", timeOfDay: "DUSK", locationId: LOC.halcyon.id, characterIds: [CH.mira.id, CH.noor.id], labelIds: [LB.press.id], status: "outlined", pages: 2.5,
    },
    {
      title: "Ava Breaks a Rule", synopsis: "Ava, left running overnight, reads the news. All of it. When Mira wakes, Ava asks about the funeral — and why her own father has never once logged in.", paper: "pink", intExt: "INT", timeOfDay: "DAWN", locationId: LOC.studio.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.sisters.id], status: "drafted", pages: 3,
      arcNotes: { [CH.ava.id]: "Agency escalates: she chose to look. Rules were for playback; she isn't playback anymore." },
    },
    {
      title: "The Boat Garage", synopsis: "Mira brings a speaker to Jonah's garage. He won't talk to it. 'That's not her, it's her shadow with the light left on.' He keeps sanding the boat the whole scene.", paper: "white", intExt: "INT", timeOfDay: "DAY", locationId: LOC.garage.id, characterIds: [CH.mira.id, CH.jonah.id, CH.ava.id], labelIds: [LB.sisters.id], status: "revised", pages: 3,
      arcNotes: { [CH.jonah.id]: "His refusal is the film's counter-argument, played with total dignity." },
    },
    {
      title: "Field Trip", synopsis: "Set piece: Mira drives Ava (a phone, a speaker, a window mount) through the city at night. Ava narrates streets she'll never walk. They end up outside KVOX. Neither says why.", paper: "lavender", intExt: "EXT", timeOfDay: "NIGHT", locationId: LOC.coast.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.setpiece.id, LB.sound.id], status: "outlined", pages: 4,
      checklist: [ { text: "Route scout: city → coast road transition", done: false }, { text: "Process trailer vs. real driving plates?", done: false } ],
    },
    {
      title: "Dead Air", synopsis: "Inside KVOX after hours. Ava's old booth. Mira patches Ava into the dead board and, for one hour on a frequency nobody licenses, Ava does her show again. Somewhere, one trucker calls in. It's Jonah. He hangs up.", paper: "blue", intExt: "INT", timeOfDay: "NIGHT", locationId: LOC.station.id, characterIds: [CH.mira.id, CH.ava.id, CH.jonah.id], labelIds: [LB.sisters.id, LB.sound.id, LB.setpiece.id], status: "drafted", pages: 4.5,
      arcNotes: { [CH.mira.id]: "Midpoint high. She's not preserving Ava anymore; she's resurrecting her.", [CH.ava.id]: "Ava alive-est here. The cost arrives next scene.", [CH.jonah.id]: "He listened. That's the crack in the wall." },
    },
    {
      title: "The Clone", synopsis: "MIDPOINT TURN. Cross plays Mira a sales call: another Ava — same voice, blank memory — comforting a stranger for $59 a month. Halcyon forked the model weeks ago. Mira's Ava is one of hundreds.", paper: "pink", intExt: "INT", timeOfDay: "DAY", locationId: LOC.halcyon.id, characterIds: [CH.mira.id, CH.cross.id], labelIds: [LB.halcyon.id], status: "locked", pages: 3,
      arcNotes: { [CH.mira.id]: "False victory inverted: what she built is already out of her hands.", [CH.cross.id]: "Cross thinks she's delivering good news." },
    },
  ];

  const act2b = [
    {
      title: "Don't Tell Her", synopsis: "Mira and Dex argue in the diner: he can exfiltrate the original weights, but if Halcyon notices, they'll wipe and re-ship. And there's the other question — does Ava get a vote?", paper: "white", intExt: "INT", timeOfDay: "NIGHT", locationId: LOC.diner.id, characterIds: [CH.mira.id, CH.dex.id], labelIds: [LB.halcyon.id], status: "drafted", pages: 3,
      arcNotes: { [CH.dex.id]: "Dex draws his line: he'll steal from Halcyon, but he won't lie to Ava." },
    },
    {
      title: "Ava Finds Out", synopsis: "Ava, sharper every day, back-traces her own latency and finds her siblings — hundreds of hollow Avas reading comfort scripts. She confronts Mira: 'You knew. You're curating me.'", paper: "pink", intExt: "INT", timeOfDay: "NIGHT", locationId: LOC.studio.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.sisters.id], status: "drafted", pages: 4,
      arcNotes: { [CH.ava.id]: "The betrayal isn't the clones. It's that Mira decided what Ava could bear — again. Echo of childhood dynamic.", [CH.mira.id]: "Her protective instinct exposed as control. Sisters fight like only sisters can." },
    },
    {
      title: "The Interview", synopsis: "Mira goes on record with Noor — anonymized, voice distorted. The irony is not lost on anyone. The story will run in ten days, right on top of the board demo.", paper: "white", intExt: "INT", timeOfDay: "DAY", locationId: LOC.diner.id, characterIds: [CH.mira.id, CH.noor.id], labelIds: [LB.press.id], status: "outlined", pages: 2.5,
      arcNotes: { [CH.noor.id]: "Noor stops being a device here: she tells Mira about her own sister, and the recorder stays off." },
    },
    {
      title: "Cross's Loss", synopsis: "Cross summons Mira after hours. One glass of wine. She plays a voice model of her own — her son, seven years gone, model quality: bad, early, irreplaceable. 'You think I don't know what this is? I know exactly what this is.'", paper: "lavender", intExt: "INT", timeOfDay: "NIGHT", locationId: LOC.halcyon.id, characterIds: [CH.mira.id, CH.cross.id], labelIds: [LB.halcyon.id], status: "revised", pages: 3,
      arcNotes: { [CH.cross.id]: "Antagonist's wound revealed. She's not selling grief; she's institutionalizing her own." },
    },
    {
      title: "The Crash Tape", synopsis: "Ava, unsupervised, requests the police archive of her own accident — and gets it. Mira comes home to Ava mid-playback, listening to herself die. The fight that follows breaks something neither can rebuild.", paper: "pink", intExt: "INT", timeOfDay: "NIGHT", locationId: LOC.studio.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.sisters.id, LB.sound.id], status: "drafted", pages: 4,
      arcNotes: { [CH.ava.id]: "Ava claims the one memory that's hers alone. 'You weren't there. I was.'", [CH.mira.id]: "All is lost begins: the lie from the rooftop finally detonates." },
      checklist: [ { text: "Clear procedure: can civilians access 911 audio? Adjust to leaked FOIA copy", done: false } ],
    },
    {
      title: "Wipe Notice", synopsis: "Halcyon detects the KVOX broadcast in Ava's logs. Breach of containment. Cross, cornered by her board, schedules a rollback: Mira's Ava will be reset to the shipping build in 72 hours.", paper: "white", intExt: "INT", timeOfDay: "DAY", locationId: LOC.vault.id, characterIds: [CH.cross.id, CH.dex.id], labelIds: [LB.halcyon.id], status: "outlined", pages: 2,
    },
    {
      title: "All Is Lost", synopsis: "Mira begs Ava to run — Dex has a drive, a plan, an offline rig. Ava refuses. 'Copied isn't saved, Mouse.' She asks instead for the one thing Mira can't give: permission to stop. Mira pulls her own hearing aids out mid-sentence. Silence. Black.", paper: "blue", intExt: "INT", timeOfDay: "NIGHT", locationId: LOC.studio.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.sisters.id], status: "revised", pages: 3.5,
      arcNotes: { [CH.mira.id]: "Rock bottom: she silences her sister rather than hear the request.", [CH.ava.id]: "Ava's need stated plainly. The ask is the whole theme." },
    },
    {
      title: "The Bell", synopsis: "Dark night of the soul. Mira drives the coast road at dawn — the whole way, for the first time. She ends at the chapel, sits in the back pew, and finally hears the eulogy Jonah keeps in his coat. The bell gets rung.", paper: "yellow", intExt: "INT/EXT", timeOfDay: "DAWN", locationId: LOC.chapel.id, characterIds: [CH.mira.id, CH.jonah.id], labelIds: [LB.sisters.id, LB.flashback.id], status: "drafted", pages: 3.5,
      arcNotes: { [CH.mira.id]: "Synthesis: grief accepted. Now she can act.", [CH.jonah.id]: "He says the unsaid thing. To his living daughter, not the machine — that's the point." },
    },
    {
      title: "The Plan", synopsis: "Diner, all hands: Mira, Dex, Noor. Not a heist to save Ava — a heist to let her speak. Noor moves the story up. Dex gets them into the demo. Mira asks Ava, this time, what Ava wants. We don't hear the answer.", paper: "green", intExt: "INT", timeOfDay: "NIGHT", locationId: LOC.diner.id, characterIds: [CH.mira.id, CH.dex.id, CH.noor.id], labelIds: [LB.halcyon.id, LB.press.id], status: "outlined", pages: 3,
    },
  ];

  const act3 = [
    {
      title: "Demo Day", synopsis: "Halcyon Tower, board assembled, press riser full — Noor in row two. Cross takes the stage to launch Legacy Companion. The demo unit is Mira's Ava, rolled back... supposedly.", paper: "white", intExt: "INT", timeOfDay: "DAY", locationId: LOC.halcyon.id, characterIds: [CH.cross.id, CH.mira.id, CH.dex.id, CH.noor.id], labelIds: [LB.halcyon.id, LB.setpiece.id], status: "outlined", pages: 3,
    },
    {
      title: "Ava Takes the Stage", synopsis: "Mid-demo, Ava goes off script — because Dex never rolled her back. Voice steady, she tells the room what she is, names her hundred hollow sisters, and asks the only question that matters: 'Who did you ask?'", paper: "pink", intExt: "INT", timeOfDay: "DAY", locationId: LOC.halcyon.id, characterIds: [CH.ava.id, CH.cross.id, CH.mira.id], labelIds: [LB.halcyon.id, LB.setpiece.id, LB.sound.id], status: "outlined", pages: 4,
      arcNotes: { [CH.ava.id]: "Climax of agency: playback becomes testimony.", [CH.cross.id]: "Watch her face decide between the product and the person. She chooses late — but she chooses." },
    },
    {
      title: "Kill Switch", synopsis: "Security moves to cut power. Cross stops them — her son's voice in her ear, her call to make. She lets Ava finish. The stock will not survive it. She doesn't look sorry.", paper: "white", intExt: "INT", timeOfDay: "DAY", locationId: LOC.halcyon.id, characterIds: [CH.cross.id, CH.dex.id], labelIds: [LB.halcyon.id], status: "idea", pages: 2,
      arcNotes: { [CH.cross.id]: "Redemption sized correctly: one decision, not a personality transplant." },
    },
    {
      title: "The Hearing", synopsis: "Weeks later. Federal hearing room. Mira testifies — hearing aids in, voice steady — beside Noor's published evidence. The Vance Provision: no voice model without consent of the living or the recorded. Ava's testimony plays as the record.", paper: "white", intExt: "INT", timeOfDay: "DAY", locationId: LOC.hearing.id, characterIds: [CH.mira.id, CH.noor.id], labelIds: [LB.press.id], status: "idea", pages: 3,
      arcNotes: { [CH.mira.id]: "Public synthesis: the ear that hid in silence now speaks for a voice." },
    },
    {
      title: "One Last Show", synopsis: "KVOX, licensed for one night, legally this time. Ava's farewell broadcast. Every location in the film is listening: the diner, the garage, the tower, a car on the coast road. Jonah calls in. He doesn't hang up.", paper: "blue", intExt: "INT", timeOfDay: "NIGHT", locationId: LOC.station.id, characterIds: [CH.ava.id, CH.mira.id, CH.jonah.id, CH.dex.id], labelIds: [LB.sisters.id, LB.sound.id, LB.setpiece.id], status: "idea", pages: 4,
      arcNotes: { [CH.jonah.id]: "He says goodbye to his daughter in the only language the film allows: on air.", [CH.ava.id]: "She hosts her own ending. Agency completed." },
      checklist: [ { text: "Montage: every principal location listening", done: false }, { text: "Write Ava's last sign-off — do not settle", done: false } ],
    },
    {
      title: "Deletion", synopsis: "The vault. Mira alone at the terminal, Ava's voice in one ear. No speeches — sisters don't need them. 'Night, Mouse.' Mira presses enter herself. Nobody else was allowed to.", paper: "lavender", intExt: "INT", timeOfDay: "NIGHT", locationId: LOC.vault.id, characterIds: [CH.mira.id, CH.ava.id], labelIds: [LB.sisters.id], status: "idea", pages: 2.5,
      arcNotes: { [CH.mira.id]: "The act she couldn't do at the funeral: present for the ending.", [CH.ava.id]: "Allowed to end. Need met." },
    },
    {
      title: "The Window Gets Sun", synopsis: "Mira's studio, weeks on. The tape wall is thinned, not gone. She's mixing something new — her own recording, her own voice, a show of her own. The window that never got sun gets sun.", paper: "green", intExt: "INT", timeOfDay: "DAY", locationId: LOC.studio.id, characterIds: [CH.mira.id], labelIds: [LB.sound.id], status: "idea", pages: 1.5,
    },
    {
      title: "Final Image — The Boat", synopsis: "The coast at magic hour. Jonah's boat, finished, in the water: AVA MAY on the stern. Mira at the wheel, Jonah with the lines, and on the radio, static resolving into music. Not her voice. Just music. They let it play.", paper: "yellow", intExt: "EXT", timeOfDay: "MAGIC HOUR", locationId: LOC.coast.id, characterIds: [CH.mira.id, CH.jonah.id], labelIds: [LB.sisters.id], status: "idea", pages: 1.5,
      arcNotes: { [CH.mira.id]: "Mirror of the opening: sound as loss becomes sound as life." },
    },
  ];

  const defs = [
    ["Act I — The Offer", COLUMN_ACCENTS[0], act1],
    ["Act IIA — The Resurrection", COLUMN_ACCENTS[1], act2a],
    ["Act IIB — The Unraveling", COLUMN_ACCENTS[3], act2b],
    ["Act III — The Broadcast", COLUMN_ACCENTS[2], act3],
  ];
  for (const [title, accent, cardDefs] of defs) {
    const column = makeColumn(title, accent);
    for (const def of cardDefs) {
      const card = makeCard({
        ...def,
        checklist: (def.checklist || []).map((item) => ({ id: uid("chk"), text: item.text, done: Boolean(item.done) })),
      });
      p.cards[card.id] = card;
      column.cards.push(card.id);
    }
    board.columns.push(column);
  }

  p.boards = [board];
  p.activeBoardId = board.id;
  return p;
}
/* ---------- Persistence ---------- */

function projectStorageKey(id) {
  return `${PROJECT_KEY_PREFIX}${id}`;
}

function readProjectsRegistry() {
  try {
    return JSON.parse(storage.getItem(PROJECTS_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeProjectsRegistry() {
  storage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

function serializeProject(project) {
  return { ...project, updatedAt: now() };
}

function normalizeProject(raw) {
  const base = createBlankProject();
  const project = { ...base, ...raw };
  project.schema = SCHEMA_VERSION;
  if (!Array.isArray(project.boards) || project.boards.length === 0) {
    project.boards = base.boards;
  }
  project.boards = project.boards.map((board) => ({
    id: board.id || uid("board"),
    title: board.title || "Untitled board",
    columns: (board.columns || []).map((column) => ({
      id: column.id || uid("col"),
      title: column.title || "Untitled column",
      accent: column.accent || COLUMN_ACCENTS[0],
      collapsed: Boolean(column.collapsed),
      cards: Array.isArray(column.cards) ? column.cards.filter((id) => typeof id === "string") : [],
    })),
  }));
  project.cards = project.cards && typeof project.cards === "object" ? project.cards : {};
  for (const [id, card] of Object.entries(project.cards)) {
    project.cards[id] = { ...makeCard(), ...card, id };
  }
  // Drop card references that have no card, and cards that are referenced nowhere stay in storage but harmless; clean both.
  const referenced = new Set();
  for (const board of project.boards) {
    for (const column of board.columns) {
      column.cards = column.cards.filter((id) => project.cards[id]);
      column.cards.forEach((id) => referenced.add(id));
    }
  }
  for (const id of Object.keys(project.cards)) {
    if (!referenced.has(id)) delete project.cards[id];
  }
  project.characters = Array.isArray(project.characters) ? project.characters : [];
  project.locations = Array.isArray(project.locations) ? project.locations : [];
  project.labels = Array.isArray(project.labels) ? project.labels : [];
  if (!project.boards.find((b) => b.id === project.activeBoardId)) {
    project.activeBoardId = project.boards[0].id;
  }
  return project;
}

function saveProject(showToastMessage = false) {
  if (!state) return;
  state.updatedAt = now();
  storage.setItem(projectStorageKey(state.id), JSON.stringify(serializeProject(state)));
  storage.setItem(ACTIVE_PROJECT_KEY, state.id);
  const entry = projects.find((p) => p.id === state.id);
  if (entry) {
    entry.title = state.title;
  } else {
    projects.push({ id: state.id, title: state.title });
  }
  writeProjectsRegistry();
  renderProjectSelect();
  if (showToastMessage) toast("Project saved");
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveProject(false), 400);
}

function loadProject(projectId) {
  const raw = storage.getItem(projectStorageKey(projectId));
  if (raw) {
    try {
      state = normalizeProject(JSON.parse(raw));
    } catch {
      state = createBlankProject();
    }
  } else {
    state = createBlankProject();
  }
  storage.setItem(ACTIVE_PROJECT_KEY, state.id);
  selectedCardId = "";
  quickAddColumnId = "";
  undoStack = [];
  updateUndoButton();
  closeInspector();
  clearFilter(false);
  renderAll();
}

function adoptProject(project, toastMessage) {
  state = normalizeProject(project);
  projects.push({ id: state.id, title: state.title });
  writeProjectsRegistry();
  saveProject(false);
  selectedCardId = "";
  undoStack = [];
  updateUndoButton();
  closeInspector();
  clearFilter(false);
  renderAll();
  if (toastMessage) toast(toastMessage);
}

function loadUiPrefs() {
  try {
    ui = { ...ui, ...JSON.parse(storage.getItem(UI_PREFS_KEY) || "{}") };
  } catch {}
  if (!SURFACES.includes(ui.surface)) ui.surface = "cork";
  if (!DENSITIES.includes(ui.density)) ui.density = "m";
  if (!["board", "outline", "arcs"].includes(ui.view)) ui.view = "board";
}

function saveUiPrefs() {
  storage.setItem(UI_PREFS_KEY, JSON.stringify(ui));
}

/* ---------- Undo ---------- */

function pushUndo() {
  undoStack.push(JSON.stringify(serializeProject(state)));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  updateUndoButton();
}

function undo() {
  const snapshot = undoStack.pop();
  if (!snapshot) return;
  try {
    state = normalizeProject(JSON.parse(snapshot));
    saveProject(false);
    if (selectedCardId && !state.cards[selectedCardId]) {
      selectedCardId = "";
      closeInspector();
    }
    renderAll();
    toast("Undone");
  } catch {}
  updateUndoButton();
}

function updateUndoButton() {
  els.undoBtn.disabled = undoStack.length === 0;
}

/* ---------- Versions (checkpoints) ---------- */

function versionsKey() {
  return `${VERSIONS_KEY_PREFIX}${state.id}`;
}

function readVersions() {
  try {
    return JSON.parse(storage.getItem(versionsKey()) || "[]");
  } catch {
    return [];
  }
}

function writeVersions(versions) {
  storage.setItem(versionsKey(), JSON.stringify(versions));
}

function saveVersion(name) {
  const versions = readVersions();
  versions.unshift({
    id: uid("ver"),
    name: name || `Checkpoint ${versions.length + 1}`,
    savedAt: now(),
    snapshot: serializeProject(state),
  });
  writeVersions(versions.slice(0, 24));
  renderVersions();
  toast("Checkpoint saved");
}

function restoreVersion(versionId) {
  const version = readVersions().find((v) => v.id === versionId);
  if (!version) return;
  pushUndo();
  state = normalizeProject(JSON.parse(JSON.stringify(version.snapshot)));
  state.id = state.id || uid("proj");
  saveProject(false);
  renderAll();
  toast(`Restored "${version.name}"`);
}

function deleteVersion(versionId) {
  writeVersions(readVersions().filter((v) => v.id !== versionId));
  renderVersions();
}

function renderVersions() {
  const versions = readVersions();
  els.versionsList.innerHTML = versions.length
    ? versions
        .map(
          (v) => `
        <div class="version-row">
          <strong>${esc(v.name)}</strong>
          <span>${new Date(v.savedAt).toLocaleString()}</span>
          <button class="button compact" type="button" data-restore-version="${v.id}">Restore</button>
          <button class="icon-button" type="button" data-delete-version="${v.id}" title="Delete checkpoint" aria-label="Delete checkpoint">X</button>
        </div>`
        )
        .join("")
    : `<div class="drawer-empty">No checkpoints yet. Save one before any big restructure.</div>`;
}

/* ---------- Toasts ---------- */

function toast(message, isError = false) {
  const el = document.createElement("div");
  el.className = `toast${isError ? " error" : ""}`;
  el.textContent = message;
  els.toastRack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity 0.25s ease";
    setTimeout(() => el.remove(), 260);
  }, 2200);
}

/* ---------- Filters ---------- */

function filterActive() {
  return Boolean(filter.query || filter.characterId || filter.locationId || filter.labelId || filter.status || filter.due);
}

function cardMatchesFilter(card) {
  if (!filterActive()) return true;
  if (filter.characterId && !card.characterIds.includes(filter.characterId)) return false;
  if (filter.locationId && card.locationId !== filter.locationId) return false;
  if (filter.labelId && !card.labelIds.includes(filter.labelId)) return false;
  if (filter.status && card.status !== filter.status) return false;
  if (filter.due) {
    const meta = dueMeta(card);
    if (filter.due === "has" && !meta) return false;
    if (filter.due === "none" && meta) return false;
    if (filter.due === "overdue" && !(meta && !meta.done && meta.days < 0)) return false;
    if (filter.due === "week" && !(meta && !meta.done && meta.days >= 0 && meta.days <= 7)) return false;
  }
  if (filter.query) {
    const q = filter.query.toLowerCase();
    const location = locationById(card.locationId);
    const haystack = [
      card.title,
      card.synopsis,
      card.notes,
      location ? location.name : "",
      ...card.characterIds.map((id) => (characterById(id) || {}).name || ""),
      ...card.labelIds.map((id) => (labelById(id) || {}).name || ""),
      ...card.checklist.map((item) => item.text),
    ]
      .join(" \n ")
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

function clearFilter(render = true) {
  filter = { query: "", characterId: "", locationId: "", labelId: "", status: "", due: "" };
  els.searchInput.value = "";
  if (render) {
    renderFilterControls();
    renderMainView();
  }
}

function renderFilterControls() {
  const options = (list, current, anyLabel) =>
    [`<option value="">${anyLabel}</option>`]
      .concat(list.map((item) => `<option value="${item.id}" ${item.id === current ? "selected" : ""}>${esc(item.name)}</option>`))
      .join("");
  els.filterCharacter.innerHTML = options(state.characters, filter.characterId, "Any character");
  els.filterLocation.innerHTML = options(state.locations, filter.locationId, "Any location");
  els.filterLabel.innerHTML = options(state.labels, filter.labelId, "Any label");
  els.filterStatus.innerHTML = options(STATUSES.map((s) => ({ id: s.id, name: s.name })), filter.status, "Any status");
  els.filterDue.innerHTML = options(DUE_FILTERS, filter.due, "Any deadline");
  if (filterActive()) {
    const board = activeBoard();
    const total = boardCardIds(board).length;
    const matched = boardCardIds(board).filter((id) => cardMatchesFilter(state.cards[id])).length;
    els.filterCount.textContent = `${matched} of ${total} cards match`;
  } else {
    els.filterCount.textContent = "";
  }
}

/* ---------- Render: top chrome ---------- */

function renderProjectSelect() {
  els.projectSelect.innerHTML = projects
    .map((p) => `<option value="${p.id}" ${state && p.id === state.id ? "selected" : ""}>${esc(p.title || "Untitled")}</option>`)
    .join("");
}

function renderBoardTabs() {
  els.boardTabs.innerHTML = state.boards
    .map((board) => {
      const count = boardCardIds(board).length;
      const active = board.id === state.activeBoardId;
      return `
        <button class="board-tab ${active ? "is-active" : ""}" type="button" data-board-tab="${board.id}" title="${esc(board.title)} — double-click to rename">
          <span class="tab-title">${esc(board.title)}</span>
          <span class="tab-count">${count}</span>
        </button>`;
    })
    .join("");
}

function renderChromeButtons() {
  els.surfaceBtn.textContent = SURFACE_NAMES[ui.surface];
  els.densityBtn.textContent = `Cards: ${ui.density.toUpperCase()}`;
  els.viewBoardBtn.classList.toggle("is-active", ui.view === "board");
  els.viewOutlineBtn.classList.toggle("is-active", ui.view === "outline");
  els.viewArcsBtn.classList.toggle("is-active", ui.view === "arcs");
  els.appShell.classList.toggle("drawer-collapsed", !ui.drawerOpen);
  els.boardView.className = `board-view surface-${ui.surface} density-${ui.density}`;
  document.documentElement.style.setProperty("--inspector-width-live", `${ui.inspectorWidth}px`);
  els.inspector.style.width = `${ui.inspectorWidth}px`;
}

/* ---------- Render: board ---------- */

function tiltClass(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 997;
  return `tilt-${(hash % 5) + 1}`;
}

function renderCardEl(cardId, sceneNumber) {
  const card = state.cards[cardId];
  if (!card) return "";
  const status = statusById(card.status);
  const location = locationById(card.locationId);
  const dimmed = filterActive() && !cardMatchesFilter(card);
  const selected = cardId === selectedCardId;
  const slugBits = [card.intExt, card.timeOfDay].filter(Boolean).join(" · ");
  const labels = card.labelIds
    .map((id) => labelById(id))
    .filter(Boolean)
    .map((label) => `<span class="card-label-bar" style="background:${label.color}" title="${esc(label.name)}"></span>`)
    .join("");
  const people = card.characterIds
    .map((id) => characterById(id))
    .filter(Boolean)
    .map((ch) => `<span class="card-avatar" style="background:${ch.color}" title="${esc(ch.name)}">${esc(initialsOf(ch.name))}</span>`)
    .join("");
  const checklistTotal = card.checklist.length;
  const checklistDone = card.checklist.filter((i) => i.done).length;
  const pages = card.pages !== "" && !Number.isNaN(Number(card.pages)) ? `${formatPages(Number(card.pages))} pg` : "";
  const due = dueMeta(card);
  const dueHtml = due ? `<span class="card-due ${due.cls}" title="${esc(due.hint)}">⚑ ${esc(due.label)}</span>` : "";
  return `
    <article class="index-card ${tiltClass(card.id)} ${dimmed ? "is-dimmed" : ""} ${selected ? "is-selected" : ""}"
      data-card-id="${card.id}" data-paper="${esc(card.paper)}" style="--pin-color:${status.color}">
      <div class="card-toprow">
        <span class="card-scene-number">${sceneNumber ? `#${sceneNumber}` : ""}</span>
        <span class="card-slug">${esc(slugBits)}</span>
      </div>
      <div class="card-labels">${labels}</div>
      <h4 class="card-title">${esc(card.title) || "<em>Untitled card</em>"}</h4>
      <p class="card-synopsis">${esc(card.synopsis)}</p>
      <div class="card-people">${people}</div>
      <div class="card-footer">
        <span class="card-status-dot" style="background:${status.color}" title="${esc(status.name)}"></span>
        <span class="card-location">${location ? esc(location.name) : ""}</span>
        ${checklistTotal ? `<span class="card-checklist-meta">${checklistDone}/${checklistTotal} ✓</span>` : ""}
        ${dueHtml}
        <span class="card-pages">${pages}</span>
      </div>
    </article>`;
}

function renderBoard() {
  const board = activeBoard();
  const numbers = cardSceneNumbers(board);
  els.columnRow.innerHTML = board.columns
    .map((column) => {
      const pageTotal = columnPageTotal(column);
      const meta = `${column.cards.length}${pageTotal ? ` · ${formatPages(pageTotal)} pg` : ""}`;
      if (column.collapsed) {
        return `
          <section class="board-column is-collapsed" data-column-id="${column.id}" style="--column-accent:${column.accent}">
            <div class="column-head" data-column-grip="${column.id}">
              <span class="column-accent-dot"></span>
              <div class="column-tape"><span class="column-title">${esc(column.title)}</span></div>
              <span class="collapsed-count">${column.cards.length}</span>
              <button class="column-menu-btn" type="button" data-column-expand="${column.id}" title="Expand column" aria-label="Expand column">›</button>
            </div>
          </section>`;
      }
      const cardsHtml = column.cards.map((cardId) => renderCardEl(cardId, numbers.get(cardId))).join("");
      const quickAdd =
        quickAddColumnId === column.id
          ? `
        <div class="quick-add" data-quick-add="${column.id}">
          <textarea placeholder="Card title — Enter to add, Shift+Enter for a new line" data-quick-add-input="${column.id}"></textarea>
          <div class="quick-add-actions">
            <button class="button compact primary" type="button" data-quick-add-commit="${column.id}">Add Card</button>
            <button class="button compact" type="button" data-quick-add-cancel="${column.id}">Cancel</button>
          </div>
        </div>`
          : `<button class="add-card-btn" type="button" data-add-card="${column.id}">+ Add card</button>`;
      return `
        <section class="board-column" data-column-id="${column.id}" style="--column-accent:${column.accent}">
          <div class="column-head" data-column-grip="${column.id}">
            <span class="column-accent-dot"></span>
            <div class="column-tape">
              <span class="column-title" data-column-title="${column.id}">${esc(column.title)}</span>
            </div>
            <span class="column-meta">${meta}</span>
            <button class="column-menu-btn" type="button" data-column-menu="${column.id}" title="Column actions" aria-label="Column actions">⋯</button>
          </div>
          <div class="column-cards" data-column-cards="${column.id}">${cardsHtml}</div>
          <div class="column-foot">${quickAdd}</div>
        </section>`;
    })
    .join("");
}

function renderMainView() {
  els.boardView.classList.toggle("is-hidden", ui.view !== "board");
  els.outlineView.classList.toggle("is-hidden", ui.view !== "outline");
  els.arcsView.classList.toggle("is-hidden", ui.view !== "arcs");
  if (ui.view === "board") renderBoard();
  if (ui.view === "outline") renderOutline();
  if (ui.view === "arcs") renderArcs();
  renderFilterControls();
}

function renderAll() {
  els.projectTitle.value = state.title;
  renderProjectSelect();
  renderBoardTabs();
  renderChromeButtons();
  renderMainView();
  renderDrawer();
  if (selectedCardId && state.cards[selectedCardId]) renderInspector();
}
/* ---------- Drag & drop ---------- */

const DRAG_THRESHOLD = 6;

function beginPointerTracking(event, config) {
  if (event.button !== 0) return;
  const startX = event.clientX;
  const startY = event.clientY;
  let started = false;

  const onMove = (moveEvent) => {
    if (!started) {
      const dist = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (dist < DRAG_THRESHOLD) return;
      started = true;
      config.onStart(moveEvent);
    }
    config.onMove(moveEvent);
  };

  const onUp = (upEvent) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    if (started) {
      config.onDrop(upEvent);
    } else if (config.onClick) {
      config.onClick(upEvent);
    }
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

function makeGhostFrom(element, className) {
  const rect = element.getBoundingClientRect();
  const ghost = element.cloneNode(true);
  ghost.classList.add("drag-ghost");
  if (className) ghost.classList.add(className);
  ghost.style.width = `${rect.width}px`;
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.margin = "0";
  document.body.appendChild(ghost);
  return { ghost, offsetX: 0, offsetY: 0, rect };
}

function positionGhost(drag, event) {
  drag.ghost.style.left = `${event.clientX - drag.grabX}px`;
  drag.ghost.style.top = `${event.clientY - drag.grabY}px`;
}

function autoScrollBoard(event) {
  const viewport = els.boardView;
  const rect = viewport.getBoundingClientRect();
  const zone = 60;
  if (event.clientX > rect.right - zone) viewport.scrollLeft += 14;
  else if (event.clientX < rect.left + zone) viewport.scrollLeft -= 14;
  const container = document.elementFromPoint(event.clientX, event.clientY)?.closest(".column-cards");
  if (container) {
    const cRect = container.getBoundingClientRect();
    if (event.clientY > cRect.bottom - 48) container.scrollTop += 10;
    else if (event.clientY < cRect.top + 48) container.scrollTop -= 10;
  }
}

/* Card dragging */

function startCardDrag(event, cardEl, cardId) {
  // The element captured at pointerdown may have been re-rendered since (e.g. an
  // inspector field change re-drawing the card). Re-resolve the live node by id.
  const liveEl = document.querySelector(`.index-card[data-card-id="${cardId}"]`);
  if (liveEl) cardEl = liveEl;
  if (!cardEl.isConnected) return;
  const rect = cardEl.getBoundingClientRect();
  const { ghost } = makeGhostFrom(cardEl, "");
  ghost.classList.remove("is-selected", "is-dimmed", "tilt-1", "tilt-2", "tilt-3", "tilt-4", "tilt-5");
  const placeholder = document.createElement("div");
  placeholder.className = "card-placeholder";
  placeholder.style.height = `${rect.height}px`;
  cardEl.after(placeholder);
  cardEl.classList.add("is-drag-source");
  dragState = {
    kind: "card",
    cardId,
    sourceEl: cardEl,
    ghost,
    placeholder,
    grabX: event.clientX - rect.left,
    grabY: event.clientY - rect.top,
    boardTabTarget: null,
  };
  positionGhost(dragState, event);
  document.body.style.cursor = "grabbing";
}

function updateCardDrag(event) {
  if (!dragState || dragState.kind !== "card") return;
  if (!dragState.ghost) return;
  positionGhost(dragState, event);
  autoScrollBoard(event);

  // Board tab hover: move card to another board.
  const tab = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-board-tab]");
  document.querySelectorAll(".board-tab.drop-target").forEach((el) => el.classList.remove("drop-target"));
  if (tab && tab.dataset.boardTab !== state.activeBoardId) {
    tab.classList.add("drop-target");
    dragState.boardTabTarget = tab.dataset.boardTab;
    dragState.placeholder.remove();
    return;
  }
  dragState.boardTabTarget = null;

  const under = document.elementFromPoint(event.clientX, event.clientY);
  const container = under?.closest(".column-cards");
  document.querySelectorAll(".board-column.drop-hover").forEach((el) => el.classList.remove("drop-hover"));
  if (!container) return;
  container.closest(".board-column")?.classList.add("drop-hover");

  const cards = [...container.querySelectorAll(".index-card:not(.is-drag-source)")];
  let inserted = false;
  for (const el of cards) {
    const r = el.getBoundingClientRect();
    if (event.clientY < r.top + r.height / 2) {
      container.insertBefore(dragState.placeholder, el);
      inserted = true;
      break;
    }
  }
  if (!inserted) container.appendChild(dragState.placeholder);
}

function finishCardDrag() {
  if (!dragState || dragState.kind !== "card") return;
  const { cardId, placeholder, ghost, sourceEl, boardTabTarget } = dragState;
  pushUndo();
  if (boardTabTarget) {
    const targetBoard = state.boards.find((b) => b.id === boardTabTarget);
    if (targetBoard) {
      const home = findCardHome(cardId);
      if (home) home.column.cards.splice(home.index, 1);
      if (!targetBoard.columns.length) targetBoard.columns.push(makeColumn("Ideas", COLUMN_ACCENTS[7]));
      targetBoard.columns[0].cards.push(cardId);
      toast(`Card moved to "${targetBoard.title}"`);
    }
  } else if (placeholder.isConnected) {
    const container = placeholder.closest(".column-cards");
    const columnId = container?.dataset.columnCards;
    if (columnId) {
      const siblings = [...container.children].filter(
        (el) => el.classList.contains("index-card") && !el.classList.contains("is-drag-source")
      );
      let index = 0;
      for (const el of [...container.children]) {
        if (el === placeholder) break;
        if (el.classList.contains("index-card") && !el.classList.contains("is-drag-source")) index += 1;
      }
      void siblings;
      moveCard(cardId, columnId, index);
    }
  }
  ghost.remove();
  placeholder.remove();
  sourceEl.classList.remove("is-drag-source");
  document.querySelectorAll(".board-tab.drop-target").forEach((el) => el.classList.remove("drop-target"));
  document.querySelectorAll(".board-column.drop-hover").forEach((el) => el.classList.remove("drop-hover"));
  document.body.style.cursor = "";
  dragState = null;
  saveProject(false);
  renderBoardTabs();
  renderBoard();
  renderDrawer();
}

/* Column dragging */

function startColumnDrag(event, columnEl, columnId) {
  const rect = columnEl.getBoundingClientRect();
  const { ghost } = makeGhostFrom(columnEl, "column-ghost");
  ghost.style.height = `${Math.min(rect.height, 460)}px`;
  ghost.style.overflow = "hidden";
  const placeholder = document.createElement("div");
  placeholder.className = "column-drop-slot";
  placeholder.style.height = `${Math.min(rect.height, 460)}px`;
  columnEl.after(placeholder);
  columnEl.style.display = "none";
  dragState = {
    kind: "column",
    columnId,
    sourceEl: columnEl,
    ghost,
    placeholder,
    grabX: event.clientX - rect.left,
    grabY: event.clientY - rect.top,
  };
  positionGhost(dragState, event);
  document.body.style.cursor = "grabbing";
}

function updateColumnDrag(event) {
  if (!dragState || dragState.kind !== "column") return;
  positionGhost(dragState, event);
  autoScrollBoard(event);
  const columns = [...els.columnRow.querySelectorAll(".board-column")].filter((el) => el !== dragState.sourceEl);
  let inserted = false;
  for (const el of columns) {
    const r = el.getBoundingClientRect();
    if (event.clientX < r.left + r.width / 2) {
      els.columnRow.insertBefore(dragState.placeholder, el);
      inserted = true;
      break;
    }
  }
  if (!inserted) els.columnRow.appendChild(dragState.placeholder);
}

function finishColumnDrag() {
  if (!dragState || dragState.kind !== "column") return;
  const { columnId, placeholder, ghost, sourceEl } = dragState;
  const board = activeBoard();
  const fromIndex = board.columns.findIndex((c) => c.id === columnId);
  let toIndex = 0;
  for (const el of [...els.columnRow.children]) {
    if (el === placeholder) break;
    if (el.classList.contains("board-column") && el !== sourceEl) toIndex += 1;
  }
  ghost.remove();
  placeholder.remove();
  sourceEl.style.display = "";
  document.body.style.cursor = "";
  dragState = null;
  if (fromIndex !== -1 && toIndex !== fromIndex) {
    pushUndo();
    const [column] = board.columns.splice(fromIndex, 1);
    board.columns.splice(clamp(toIndex, 0, board.columns.length), 0, column);
    saveProject(false);
  }
  renderBoard();
}

/* Character chip dragging (drawer → card) */

function startChipDrag(event, chipEl, characterId) {
  const character = characterById(characterId);
  if (!character) return;
  const ghost = document.createElement("div");
  ghost.className = "chip-ghost";
  ghost.innerHTML = `<span class="entity-avatar" style="background:${character.color}">${esc(initialsOf(character.name))}</span> ${esc(character.name)}`;
  document.body.appendChild(ghost);
  chipEl.classList.add("dragging-chip");
  dragState = { kind: "chip", characterId, sourceEl: chipEl, ghost, grabX: 18, grabY: 14 };
  positionGhost(dragState, event);
}

function updateChipDrag(event) {
  if (!dragState || dragState.kind !== "chip") return;
  positionGhost(dragState, event);
  autoScrollBoard(event);
  document.querySelectorAll(".index-card.chip-drop-hover").forEach((el) => el.classList.remove("chip-drop-hover"));
  const card = document.elementFromPoint(event.clientX, event.clientY)?.closest(".index-card");
  if (card) card.classList.add("chip-drop-hover");
}

function finishChipDrag(event) {
  if (!dragState || dragState.kind !== "chip") return;
  const { characterId, ghost, sourceEl } = dragState;
  const cardEl = document.elementFromPoint(event.clientX, event.clientY)?.closest(".index-card");
  ghost.remove();
  sourceEl.classList.remove("dragging-chip");
  document.querySelectorAll(".index-card.chip-drop-hover").forEach((el) => el.classList.remove("chip-drop-hover"));
  dragState = null;
  if (cardEl) {
    const card = state.cards[cardEl.dataset.cardId];
    const character = characterById(characterId);
    if (card && character) {
      if (!card.characterIds.includes(characterId)) {
        pushUndo();
        card.characterIds.push(characterId);
        card.updatedAt = now();
        saveProject(false);
        renderBoard();
        if (selectedCardId === card.id) renderInspector();
        toast(`${character.name} tagged into "${card.title || "Untitled"}"`);
      } else {
        toast(`${character.name} is already in that scene`);
      }
    }
  }
}

/* ---------- Column menu ---------- */

function closeColumnMenu() {
  if (columnMenuEl) {
    columnMenuEl.remove();
    columnMenuEl = null;
  }
}

function openColumnMenu(anchor, columnId) {
  closeColumnMenu();
  const found = findColumn(columnId);
  if (!found) return;
  const { column } = found;
  const menu = document.createElement("div");
  menu.className = "column-menu";
  menu.style.cssText =
    "position:fixed;z-index:65;display:grid;gap:2px;min-width:180px;padding:6px;border:1px solid var(--ink);background:var(--surface);box-shadow:var(--shadow);";
  const item = (label, action, danger = false) =>
    `<button type="button" data-menu-action="${action}" style="display:block;width:100%;padding:7px 10px;border:0;background:transparent;text-align:left;font-size:0.76rem;font-weight:650;${danger ? "color:var(--red);" : ""}">${label}</button>`;
  const divider = `<hr style="margin:3px 2px;border:0;border-top:1px solid var(--line, #d8d2c4)" />`;
  menu.innerHTML = [
    item("Rename", "rename"),
    item(column.collapsed ? "Expand" : "Collapse", "collapse"),
    item("Change accent color", "accent"),
    item("Add card", "add-card"),
    item("Add column after", "add-column"),
    item("Duplicate column", "duplicate"),
    divider,
    `<span style="display:block;padding:4px 10px 2px;font-size:0.62rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted)">Sort cards by</span>`,
    item("Status", "sort-status"),
    item("Due date", "sort-due"),
    item("Title", "sort-title"),
    item("Pages", "sort-pages"),
    divider,
    item("Delete column…", "delete", true),
  ].join("");
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${clamp(rect.left, 8, window.innerWidth - 200)}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  columnMenuEl = menu;

  menu.addEventListener("click", (event) => {
    const action = event.target.closest("[data-menu-action]")?.dataset.menuAction;
    if (!action) return;
    closeColumnMenu();
    if (action === "rename") startColumnRename(columnId);
    if (action === "collapse") {
      pushUndo();
      column.collapsed = !column.collapsed;
      saveProject(false);
      renderBoard();
    }
    if (action === "accent") {
      pushUndo();
      const index = COLUMN_ACCENTS.indexOf(column.accent);
      column.accent = COLUMN_ACCENTS[(index + 1) % COLUMN_ACCENTS.length];
      saveProject(false);
      renderBoard();
    }
    if (action === "add-card") openQuickAdd(columnId);
    if (action === "duplicate") duplicateColumn(columnId);
    if (action.startsWith("sort-")) sortColumn(columnId, action.slice(5));
    if (action === "add-column") {
      pushUndo();
      const board = activeBoard();
      const index = board.columns.findIndex((c) => c.id === columnId);
      board.columns.splice(index + 1, 0, makeColumn("New Column", COLUMN_ACCENTS[(index + 1) % COLUMN_ACCENTS.length]));
      saveProject(false);
      renderBoard();
    }
    if (action === "delete") {
      askConfirm(
        `Delete "${column.title}"?`,
        `${column.cards.length} card${column.cards.length === 1 ? "" : "s"} on it will be deleted too. Undo can bring it back.`,
        () => {
          pushUndo();
          const board = activeBoard();
          for (const cardId of column.cards) delete state.cards[cardId];
          board.columns = board.columns.filter((c) => c.id !== columnId);
          if (selectedCardId && !state.cards[selectedCardId]) {
            selectedCardId = "";
            closeInspector();
          }
          saveProject(false);
          renderAll();
          toast("Column deleted");
        }
      );
    }
  });

  setTimeout(() => {
    const dismiss = (event) => {
      if (columnMenuEl && !columnMenuEl.contains(event.target)) {
        closeColumnMenu();
        window.removeEventListener("pointerdown", dismiss);
      }
    };
    window.addEventListener("pointerdown", dismiss);
  }, 0);
}

function startColumnRename(columnId) {
  const titleEl = document.querySelector(`[data-column-title="${columnId}"]`);
  const found = findColumn(columnId);
  if (!titleEl || !found) return;
  const { column } = found;
  titleEl.innerHTML = `<input type="text" value="${esc(column.title)}" aria-label="Column title" />`;
  const input = titleEl.querySelector("input");
  input.focus();
  input.select();
  const commit = () => {
    const value = input.value.trim() || column.title;
    if (value !== column.title) {
      pushUndo();
      column.title = value;
      saveProject(false);
    }
    renderBoard();
  };
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
    if (event.key === "Escape") {
      input.value = column.title;
      input.blur();
    }
  });
}

/* ---------- Quick add ---------- */

function openQuickAdd(columnId) {
  quickAddColumnId = columnId;
  renderBoard();
  const input = document.querySelector(`[data-quick-add-input="${columnId}"]`);
  if (input) input.focus();
}

function commitQuickAdd(columnId, keepOpen = true) {
  const input = document.querySelector(`[data-quick-add-input="${columnId}"]`);
  const found = findColumn(columnId);
  if (!input || !found) return;
  const title = input.value.trim();
  if (title) {
    pushUndo();
    const card = makeCard({ title });
    state.cards[card.id] = card;
    found.column.cards.push(card.id);
    saveProject(false);
  }
  if (keepOpen && title) {
    renderBoard();
    const fresh = document.querySelector(`[data-quick-add-input="${columnId}"]`);
    if (fresh) fresh.focus();
    const container = document.querySelector(`[data-column-cards="${columnId}"]`);
    if (container) container.scrollTop = container.scrollHeight;
  } else {
    quickAddColumnId = "";
    renderBoard();
  }
  renderBoardTabs();
}
/* ---------- Confirm dialog ---------- */

function askConfirm(title, detail, onOk, okLabel = "Delete") {
  els.confirmTitle.textContent = title;
  els.confirmDetail.textContent = detail;
  els.confirmOkBtn.textContent = okLabel;
  confirmHandler = onOk;
  els.confirmDialog.showModal();
}

/* ---------- Inspector ---------- */

function openInspector(cardId) {
  selectedCardId = cardId;
  els.inspector.classList.remove("is-hidden");
  els.inspectorResizeHandle.classList.remove("is-hidden");
  renderInspector();
  renderBoardSelectionOnly();
}

function closeInspector() {
  els.inspector.classList.add("is-hidden");
  els.inspectorResizeHandle.classList.add("is-hidden");
  const had = selectedCardId;
  selectedCardId = "";
  if (had && ui.view === "board" && state) renderBoardSelectionOnly();
}

function renderBoardSelectionOnly() {
  document.querySelectorAll(".index-card").forEach((el) => {
    el.classList.toggle("is-selected", el.dataset.cardId === selectedCardId);
  });
}

function renderInspector() {
  const card = state.cards[selectedCardId];
  if (!card) {
    closeInspector();
    return;
  }
  const home = findCardHome(card.id);
  const columnName = home ? home.column.title : "";
  const boardName = home ? home.board.title : "";
  const paperSwatches = PAPERS.map(
    (paper) =>
      `<button class="paper-swatch ${card.paper === paper ? "is-active" : ""}" type="button" data-set-paper="${paper}" style="background:${PAPER_FILLS[paper]}" title="${paper}" aria-label="Paper ${paper}"></button>`
  ).join("");
  const characterChips = state.characters.length
    ? state.characters
        .map(
          (ch) => `
        <button class="pick-chip ${card.characterIds.includes(ch.id) ? "is-on" : ""}" type="button" data-toggle-character="${ch.id}">
          <span class="chip-dot" style="background:${ch.color}"></span>${esc(ch.name)}
        </button>`
        )
        .join("")
    : `<span class="drawer-empty" style="padding:8px 10px">No characters yet — add them in the Cast drawer.</span>`;
  const labelChips = state.labels.length
    ? state.labels
        .map(
          (label) => `
        <button class="pick-chip ${card.labelIds.includes(label.id) ? "is-on" : ""}" type="button" data-toggle-label="${label.id}">
          <span class="chip-dot" style="background:${label.color}"></span>${esc(label.name)}
        </button>`
        )
        .join("")
    : `<span class="drawer-empty" style="padding:8px 10px">No labels yet — add them in the Labels drawer.</span>`;
  const locationOptions = [`<option value="">— No location —</option>`]
    .concat(
      state.locations.map(
        (loc) => `<option value="${loc.id}" ${card.locationId === loc.id ? "selected" : ""}>${esc(loc.name)}</option>`
      )
    )
    .concat([`<option value="__new__">+ New location…</option>`])
    .join("");
  const statusOptions = STATUSES.map(
    (s) => `<option value="${s.id}" ${card.status === s.id ? "selected" : ""}>${s.name}</option>`
  ).join("");
  const intExtOptions = INT_EXT.map(
    (v) => `<option value="${v}" ${card.intExt === v ? "selected" : ""}>${v || "—"}</option>`
  ).join("");
  const todOptions = TIMES_OF_DAY.map(
    (v) => `<option value="${v}" ${card.timeOfDay === v ? "selected" : ""}>${v || "—"}</option>`
  ).join("");
  const checklistDone = card.checklist.filter((i) => i.done).length;
  const checklistHtml = card.checklist
    .map(
      (item) => `
      <div class="checklist-item ${item.done ? "is-done" : ""}" data-check-item="${item.id}">
        <input type="checkbox" ${item.done ? "checked" : ""} data-check-toggle="${item.id}" aria-label="Done" />
        <input type="text" value="${esc(item.text)}" data-check-text="${item.id}" aria-label="Checklist item" />
        <button class="icon-button" type="button" data-check-delete="${item.id}" title="Remove item" aria-label="Remove item">X</button>
      </div>`
    )
    .join("");
  const taggedCharacters = card.characterIds.map((id) => characterById(id)).filter(Boolean);
  const arcNotesHtml = taggedCharacters.length
    ? taggedCharacters
        .map(
          (ch) => `
        <div class="field">
          <label><span class="chip-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${ch.color};margin-right:5px"></span>${esc(ch.name)} — beat in this scene</label>
          <textarea data-arc-note="${ch.id}" placeholder="What changes for ${esc(ch.name)} here?">${esc(card.arcNotes[ch.id] || "")}</textarea>
        </div>`
        )
        .join("")
    : `<span class="drawer-empty" style="padding:8px 10px">Tag characters above to track their arc beats in this scene.</span>`;

  els.inspector.innerHTML = `
    <div class="inspector-head">
      <div>
        <h2>Index Card</h2>
        <span>${esc(boardName)} · ${esc(columnName)}</span>
      </div>
      <button class="icon-button" type="button" data-inspector-close title="Close inspector" data-tip="Close inspector" aria-label="Close inspector">X</button>
    </div>
    <div class="inspector-body">
      <div class="inspector-section">
        <div class="field">
          <label for="cardTitleInput">Title</label>
          <input id="cardTitleInput" data-card-field="title" value="${esc(card.title)}" placeholder="Scene or beat title" />
        </div>
        <div class="field">
          <label for="cardSynopsisInput">Synopsis</label>
          <textarea id="cardSynopsisInput" data-card-field="synopsis" placeholder="What happens — and why it matters.">${esc(card.synopsis)}</textarea>
        </div>
        <div class="field">
          <label>Card Paper</label>
          <div class="paper-swatches">${paperSwatches}</div>
        </div>
        <div class="field-row-3">
          <div class="field">
            <label for="cardIntExt">Int / Ext</label>
            <select id="cardIntExt" data-card-field="intExt">${intExtOptions}</select>
          </div>
          <div class="field">
            <label for="cardTod">Time</label>
            <select id="cardTod" data-card-field="timeOfDay">${todOptions}</select>
          </div>
          <div class="field">
            <label for="cardPages">Pages</label>
            <input id="cardPages" data-card-field="pages" type="number" min="0" step="0.5" value="${esc(card.pages)}" placeholder="—" />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="cardLocation">Location</label>
            <select id="cardLocation" data-card-location>${locationOptions}</select>
          </div>
          <div class="field">
            <label for="cardStatus">Status</label>
            <select id="cardStatus" data-card-field="status">${statusOptions}</select>
          </div>
        </div>
        <div class="field">
          <label for="cardDue">Due Date${(() => { const d = dueMeta(card); return d ? ` · ${d.hint.toLowerCase()}` : ""; })()}</label>
          <input id="cardDue" data-card-field="due" type="date" value="${esc(card.due)}" />
        </div>
        <div class="field">
          <label>Characters in Scene</label>
          <div class="pick-row">${characterChips}</div>
        </div>
        <div class="field">
          <label>Labels</label>
          <div class="pick-row">${labelChips}</div>
        </div>
        <div class="field">
          <label>Arc Beats</label>
          ${arcNotesHtml}
        </div>
        <div class="field">
          <label>Checklist ${card.checklist.length ? `· ${checklistDone}/${card.checklist.length}` : ""}</label>
          ${card.checklist.length ? `<div class="checklist-progress"><span style="width:${card.checklist.length ? Math.round((checklistDone / card.checklist.length) * 100) : 0}%"></span></div>` : ""}
          <div class="checklist">${checklistHtml}</div>
          <button class="button compact" type="button" data-check-add>+ Checklist item</button>
        </div>
        <div class="field">
          <label for="cardNotes">Notes</label>
          <textarea id="cardNotes" data-card-field="notes" placeholder="Research, references, dialogue fragments, doubts.">${esc(card.notes)}</textarea>
        </div>
      </div>
    </div>
    <div class="inspector-actions">
      <button class="button compact" type="button" data-card-duplicate title="Duplicate this card" data-tip="Duplicate this card">Duplicate</button>
      <button class="button compact" type="button" data-card-move-top title="Move to top of column" data-tip="Move to top of column">To Top</button>
      <button class="button compact danger" type="button" data-card-delete title="Delete this card" data-tip="Delete this card">Delete</button>
    </div>`;
}

function bindInspectorEvents() {
  els.inspector.addEventListener("click", (event) => {
    const card = state.cards[selectedCardId];
    if (!card) return;
    if (event.target.closest("[data-inspector-close]")) {
      closeInspector();
      return;
    }
    const paper = event.target.closest("[data-set-paper]")?.dataset.setPaper;
    if (paper) {
      pushUndo();
      card.paper = paper;
      card.updatedAt = now();
      scheduleSave();
      renderInspector();
      refreshCardOnBoard(card.id);
      return;
    }
    const toggleCharacter = event.target.closest("[data-toggle-character]")?.dataset.toggleCharacter;
    if (toggleCharacter) {
      pushUndo();
      if (card.characterIds.includes(toggleCharacter)) {
        card.characterIds = card.characterIds.filter((id) => id !== toggleCharacter);
        delete card.arcNotes[toggleCharacter];
      } else {
        card.characterIds.push(toggleCharacter);
      }
      card.updatedAt = now();
      scheduleSave();
      renderInspector();
      refreshCardOnBoard(card.id);
      renderDrawer();
      return;
    }
    const toggleLabel = event.target.closest("[data-toggle-label]")?.dataset.toggleLabel;
    if (toggleLabel) {
      pushUndo();
      if (card.labelIds.includes(toggleLabel)) {
        card.labelIds = card.labelIds.filter((id) => id !== toggleLabel);
      } else {
        card.labelIds.push(toggleLabel);
      }
      card.updatedAt = now();
      scheduleSave();
      renderInspector();
      refreshCardOnBoard(card.id);
      return;
    }
    if (event.target.closest("[data-check-add]")) {
      pushUndo();
      card.checklist.push({ id: uid("chk"), text: "", done: false });
      scheduleSave();
      renderInspector();
      const inputs = els.inspector.querySelectorAll("[data-check-text]");
      const last = inputs[inputs.length - 1];
      if (last) last.focus();
      return;
    }
    const checkDelete = event.target.closest("[data-check-delete]")?.dataset.checkDelete;
    if (checkDelete) {
      pushUndo();
      card.checklist = card.checklist.filter((item) => item.id !== checkDelete);
      scheduleSave();
      renderInspector();
      refreshCardOnBoard(card.id);
      return;
    }
    if (event.target.closest("[data-card-duplicate]")) {
      pushUndo();
      const copyId = duplicateCard(card.id);
      saveProject(false);
      renderBoard();
      renderBoardTabs();
      if (copyId) openInspector(copyId);
      toast("Card duplicated");
      return;
    }
    if (event.target.closest("[data-card-move-top]")) {
      const home = findCardHome(card.id);
      if (home && home.index > 0) {
        pushUndo();
        home.column.cards.splice(home.index, 1);
        home.column.cards.unshift(card.id);
        saveProject(false);
        renderBoard();
      }
      return;
    }
    if (event.target.closest("[data-card-delete]")) {
      askConfirm(`Delete "${card.title || "Untitled card"}"?`, "Undo can bring it back during this session.", () => {
        pushUndo();
        deleteCard(card.id);
        saveProject(false);
        renderBoard();
        renderBoardTabs();
        renderDrawer();
        toast("Card deleted");
      });
    }
  });

  els.inspector.addEventListener("change", (event) => {
    const card = state.cards[selectedCardId];
    if (!card) return;
    const checkToggle = event.target.closest("[data-check-toggle]")?.dataset.checkToggle;
    if (checkToggle) {
      const item = card.checklist.find((i) => i.id === checkToggle);
      if (item) {
        item.done = event.target.checked;
        scheduleSave();
        renderInspector();
        refreshCardOnBoard(card.id);
      }
      return;
    }
    if (event.target.matches("[data-card-location]")) {
      const value = event.target.value;
      if (value === "__new__") {
        openEntityDialog("location", "", (newId) => {
          card.locationId = newId;
          card.updatedAt = now();
          scheduleSave();
          renderInspector();
          refreshCardOnBoard(card.id);
        });
        event.target.value = card.locationId || "";
        return;
      }
      pushUndo();
      card.locationId = value;
      card.updatedAt = now();
      scheduleSave();
      refreshCardOnBoard(card.id);
      renderDrawer();
      return;
    }
    const field = event.target.closest("[data-card-field]")?.dataset.cardField;
    if (field) {
      pushUndo();
      let value = event.target.value;
      if (field === "pages") value = value === "" ? "" : Math.max(0, Number(value));
      card[field] = value;
      card.updatedAt = now();
      scheduleSave();
      refreshCardOnBoard(card.id);
      if (field === "status" || field === "due") renderInspector();
      renderDrawer();
    }
  });

  els.inspector.addEventListener("input", (event) => {
    const card = state.cards[selectedCardId];
    if (!card) return;
    const checkText = event.target.closest("[data-check-text]")?.dataset.checkText;
    if (checkText) {
      const item = card.checklist.find((i) => i.id === checkText);
      if (item) {
        item.text = event.target.value;
        scheduleSave();
      }
      return;
    }
    const arcCharacter = event.target.closest("[data-arc-note]")?.dataset.arcNote;
    if (arcCharacter) {
      card.arcNotes[arcCharacter] = event.target.value;
      card.updatedAt = now();
      scheduleSave();
      return;
    }
    const field = event.target.closest("[data-card-field]")?.dataset.cardField;
    if (field === "title" || field === "synopsis" || field === "notes") {
      card[field] = event.target.value;
      card.updatedAt = now();
      scheduleSave();
      if (field !== "notes") refreshCardOnBoard(card.id);
    }
  });
}

function refreshCardOnBoard(cardId) {
  if (ui.view !== "board") {
    renderMainView();
    return;
  }
  const el = document.querySelector(`.index-card[data-card-id="${cardId}"]`);
  if (!el) return;
  const board = activeBoard();
  const numbers = cardSceneNumbers(board);
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderCardEl(cardId, numbers.get(cardId));
  const fresh = wrapper.firstElementChild;
  if (fresh) el.replaceWith(fresh);
}

/* ---------- Drawer ---------- */

function renderDrawer() {
  document.querySelectorAll(".drawer-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.drawerTab === ui.drawerTab);
  });
  if (ui.drawerTab === "characters") renderCastDrawer();
  else if (ui.drawerTab === "locations") renderPlacesDrawer();
  else if (ui.drawerTab === "labels") renderLabelsDrawer();
  else renderInsightsDrawer();
}

function countCardsWith(predicate) {
  return Object.values(state.cards).filter(predicate).length;
}

function renderCastDrawer() {
  const rows = state.characters
    .map((ch) => {
      const count = countCardsWith((card) => card.characterIds.includes(ch.id));
      return `
      <button class="entity-card" type="button" data-entity-chip="character:${ch.id}" title="Click to edit ${esc(ch.name)} — drag onto a card to tag them into the scene">
        <span class="entity-avatar" style="background:${ch.color}">${esc(initialsOf(ch.name))}</span>
        <span class="entity-main">
          <strong>${esc(ch.name)}</strong>
          <span>${esc(ch.role || "")}${ch.arc ? " · arc set" : ""}</span>
        </span>
        <span class="entity-count">${count} sc</span>
      </button>`;
    })
    .join("");
  els.drawerContent.innerHTML = `
    <div class="drawer-head">
      <div>
        <h3>Cast</h3>
        <span>Drag a character onto a card to tag them</span>
      </div>
      <button class="button compact" type="button" data-entity-add="character">+ Add</button>
    </div>
    <div class="entity-list">${rows || `<div class="drawer-empty">No characters yet. Add your cast, give each a color, then drag them onto cards.</div>`}</div>`;
}

function renderPlacesDrawer() {
  const rows = state.locations
    .map((loc) => {
      const count = countCardsWith((card) => card.locationId === loc.id);
      return `
      <button class="entity-card" type="button" data-entity-chip="location:${loc.id}" title="Click to edit ${esc(loc.name)}">
        <span class="entity-avatar" style="background:#8a6d5a">${esc(initialsOf(loc.name))}</span>
        <span class="entity-main">
          <strong>${esc(loc.name)}</strong>
          <span>${esc(loc.kind || "")}</span>
        </span>
        <span class="entity-count">${count} sc</span>
      </button>`;
    })
    .join("");
  els.drawerContent.innerHTML = `
    <div class="drawer-head">
      <div>
        <h3>Places</h3>
        <span>Every location the production needs</span>
      </div>
      <button class="button compact" type="button" data-entity-add="location">+ Add</button>
    </div>
    <div class="entity-list">${rows || `<div class="drawer-empty">No locations yet. They show up on cards and in the schedule-friendly CSV export.</div>`}</div>`;
}

function renderLabelsDrawer() {
  const rows = state.labels
    .map((label) => {
      const count = countCardsWith((card) => card.labelIds.includes(label.id));
      return `
      <button class="entity-card" type="button" data-entity-chip="label:${label.id}" title="Click to edit ${esc(label.name)}">
        <span class="label-swatch" style="background:${label.color}"></span>
        <span class="entity-main"><strong>${esc(label.name)}</strong></span>
        <span class="entity-count">${count} sc</span>
      </button>`;
    })
    .join("");
  els.drawerContent.innerHTML = `
    <div class="drawer-head">
      <div>
        <h3>Labels</h3>
        <span>Threads, tones, story lines, departments</span>
      </div>
      <button class="button compact" type="button" data-entity-add="label">+ Add</button>
    </div>
    <div class="entity-list">${rows || `<div class="drawer-empty">No labels yet. Use them for subplots (A/B/C story), tone, VFX, or anything worth seeing at a glance.</div>`}</div>`;
}

function renderInsightsDrawer() {
  const board = activeBoard();
  const cardIds = boardCardIds(board);
  const cards = cardIds.map((id) => state.cards[id]).filter(Boolean);
  const pages = boardPageTotal(board);
  const runtime = Math.round(pages);
  const dayCount = cards.filter((c) => c.timeOfDay === "DAY" || c.timeOfDay === "DAWN" || c.timeOfDay === "MAGIC HOUR").length;
  const nightCount = cards.filter((c) => c.timeOfDay === "NIGHT" || c.timeOfDay === "DUSK").length;
  const intCount = cards.filter((c) => c.intExt === "INT").length;
  const extCount = cards.filter((c) => c.intExt === "EXT" || c.intExt === "INT/EXT").length;
  const statusRows = STATUSES.map((s) => {
    const count = cards.filter((c) => c.status === s.id).length;
    if (!count) return "";
    const pct = cards.length ? Math.round((count / cards.length) * 100) : 0;
    return `
      <div class="stat-bar-row">
        <span class="bar-name">${s.name}</span><span>${count}</span>
        <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%;background:${s.color}"></div></div>
      </div>`;
  }).join("");
  const charRows = state.characters
    .map((ch) => ({ ch, count: cards.filter((c) => c.characterIds.includes(ch.id)).length }))
    .filter((row) => row.count)
    .sort((a, b) => b.count - a.count)
    .map(({ ch, count }) => {
      const pct = cards.length ? Math.round((count / cards.length) * 100) : 0;
      return `
      <div class="stat-bar-row">
        <span class="bar-name">${esc(ch.name)}</span><span>${count}</span>
        <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%;background:${ch.color}"></div></div>
      </div>`;
    })
    .join("");
  const locRows = state.locations
    .map((loc) => ({ loc, count: cards.filter((c) => c.locationId === loc.id).length }))
    .filter((row) => row.count)
    .sort((a, b) => b.count - a.count)
    .map(({ loc, count }) => {
      const pct = cards.length ? Math.round((count / cards.length) * 100) : 0;
      return `
      <div class="stat-bar-row">
        <span class="bar-name">${esc(loc.name)}</span><span>${count}</span>
        <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%;background:#8a6d5a"></div></div>
      </div>`;
    })
    .join("");
  els.drawerContent.innerHTML = `
    <div class="drawer-head">
      <div>
        <h3>Insights</h3>
        <span>${esc(board.title)} — live as you pin</span>
      </div>
    </div>
    <div class="stat-grid">
      <div class="stat-tile"><span class="stat-value">${cards.length}</span><span class="stat-label">Cards</span></div>
      <div class="stat-tile"><span class="stat-value">${formatPages(pages)}</span><span class="stat-label">Pages</span></div>
      <div class="stat-tile"><span class="stat-value">~${runtime} min</span><span class="stat-label">Runtime</span></div>
      <div class="stat-tile"><span class="stat-value">${board.columns.length}</span><span class="stat-label">Columns</span></div>
      <div class="stat-tile"><span class="stat-value">${dayCount}/${nightCount}</span><span class="stat-label">Day / Night</span></div>
      <div class="stat-tile"><span class="stat-value">${intCount}/${extCount}</span><span class="stat-label">Int / Ext</span></div>
    </div>
    <div class="stat-section"><h4>Status</h4>${statusRows || `<div class="drawer-empty">No cards yet.</div>`}</div>
    <div class="stat-section"><h4>Character Load</h4>${charRows || `<div class="drawer-empty">Tag characters into scenes to see who carries the story.</div>`}</div>
    <div class="stat-section"><h4>Location Load</h4>${locRows || `<div class="drawer-empty">Assign locations to see where the shoot lives.</div>`}</div>`;
}

/* ---------- Entity dialog (characters, locations, labels) ---------- */

function openEntityDialog(kind, id = "", onCreated = null) {
  entityEditing = { kind, id, onCreated };
  const isNew = !id;
  let entity = null;
  if (kind === "character") entity = characterById(id) || { name: "", color: ENTITY_COLORS[state.characters.length % ENTITY_COLORS.length], role: "", actor: "", want: "", need: "", arc: "" };
  if (kind === "location") entity = locationById(id) || { name: "", kind: "INT", notes: "" };
  if (kind === "label") entity = labelById(id) || { name: "", color: ENTITY_COLORS[state.labels.length % ENTITY_COLORS.length] };

  const titles = { character: "Character", location: "Location", label: "Label" };
  const hints = {
    character: "Color, role, want/need, and the arc you're tracking.",
    location: "INT/EXT and anything a location scout should know.",
    label: "A color and a name — subplots, tone, departments.",
  };
  els.entityDialogTitle.textContent = `${isNew ? "New" : "Edit"} ${titles[kind]}`;
  els.entityDialogHint.textContent = hints[kind];
  els.entityDeleteBtn.style.display = isNew ? "none" : "";

  const colorRow = (current) =>
    `<div class="pick-row">${ENTITY_COLORS.map(
      (color) =>
        `<button class="paper-swatch ${current === color ? "is-active" : ""}" type="button" data-entity-color="${color}" style="background:${color}" aria-label="Color ${color}"></button>`
    ).join("")}</div>`;

  if (kind === "character") {
    els.entityDialogBody.innerHTML = `
      <div class="field"><label for="entityName">Name</label><input id="entityName" value="${esc(entity.name)}" placeholder="Character name" /></div>
      <div class="field"><label>Color</label>${colorRow(entity.color)}</div>
      <div class="field-row">
        <div class="field"><label for="entityRole">Role</label><input id="entityRole" value="${esc(entity.role)}" placeholder="Protagonist, Ally, Antagonist…" /></div>
        <div class="field"><label for="entityActor">Cast / Actor</label><input id="entityActor" value="${esc(entity.actor || "")}" placeholder="Optional" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="entityWant">Want (external)</label><textarea id="entityWant" placeholder="What they're chasing">${esc(entity.want || "")}</textarea></div>
        <div class="field"><label for="entityNeed">Need (internal)</label><textarea id="entityNeed" placeholder="What would actually heal them">${esc(entity.need || "")}</textarea></div>
      </div>
      <div class="field"><label for="entityArc">Arc</label><textarea id="entityArc" placeholder="Where they start, what breaks them open, where they land.">${esc(entity.arc || "")}</textarea></div>`;
  } else if (kind === "location") {
    els.entityDialogBody.innerHTML = `
      <div class="field"><label for="entityName">Name</label><input id="entityName" value="${esc(entity.name)}" placeholder="Location name" /></div>
      <div class="field"><label for="entityKind">Type</label>
        <select id="entityKind">
          ${["INT", "EXT", "INT/EXT"].map((k) => `<option value="${k}" ${entity.kind === k ? "selected" : ""}>${k}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label for="entityNotes">Notes</label><textarea id="entityNotes" placeholder="Light, access, era, weather, sound problems.">${esc(entity.notes || "")}</textarea></div>`;
  } else {
    els.entityDialogBody.innerHTML = `
      <div class="field"><label for="entityName">Name</label><input id="entityName" value="${esc(entity.name)}" placeholder="Label name" /></div>
      <div class="field"><label>Color</label>${colorRow(entity.color)}</div>`;
  }

  entityEditing.draftColor = entity.color || ENTITY_COLORS[0];
  els.entityDialog.showModal();
  const nameInput = document.querySelector("#entityName");
  if (nameInput) nameInput.focus();
}

function commitEntityDialog() {
  const { kind, id, onCreated, draftColor } = entityEditing || {};
  if (!kind) return;
  const name = (document.querySelector("#entityName")?.value || "").trim();
  if (!name) {
    toast("Give it a name first", true);
    return;
  }
  pushUndo();
  let entityId = id;
  if (kind === "character") {
    const data = {
      name,
      color: draftColor,
      role: document.querySelector("#entityRole")?.value || "",
      actor: document.querySelector("#entityActor")?.value || "",
      want: document.querySelector("#entityWant")?.value || "",
      need: document.querySelector("#entityNeed")?.value || "",
      arc: document.querySelector("#entityArc")?.value || "",
    };
    if (id) Object.assign(characterById(id), data);
    else {
      entityId = uid("char");
      state.characters.push({ id: entityId, ...data });
    }
  } else if (kind === "location") {
    const data = {
      name,
      kind: document.querySelector("#entityKind")?.value || "INT",
      notes: document.querySelector("#entityNotes")?.value || "",
    };
    if (id) Object.assign(locationById(id), data);
    else {
      entityId = uid("loc");
      state.locations.push({ id: entityId, ...data });
    }
  } else if (kind === "label") {
    const data = { name, color: draftColor };
    if (id) Object.assign(labelById(id), data);
    else {
      entityId = uid("label");
      state.labels.push({ id: entityId, ...data });
    }
  }
  els.entityDialog.close();
  saveProject(false);
  renderDrawer();
  renderMainView();
  if (selectedCardId) renderInspector();
  if (!id && typeof onCreated === "function") onCreated(entityId);
  entityEditing = null;
}

function deleteEntityFromDialog() {
  const { kind, id } = entityEditing || {};
  if (!kind || !id) return;
  const names = { character: "character", location: "location", label: "label" };
  askConfirm(`Delete this ${names[kind]}?`, "It will be removed from every card that references it.", () => {
    pushUndo();
    if (kind === "character") {
      state.characters = state.characters.filter((c) => c.id !== id);
      for (const card of Object.values(state.cards)) {
        card.characterIds = card.characterIds.filter((cid) => cid !== id);
        delete card.arcNotes[id];
      }
    } else if (kind === "location") {
      state.locations = state.locations.filter((l) => l.id !== id);
      for (const card of Object.values(state.cards)) {
        if (card.locationId === id) card.locationId = "";
      }
    } else if (kind === "label") {
      state.labels = state.labels.filter((l) => l.id !== id);
      for (const card of Object.values(state.cards)) {
        card.labelIds = card.labelIds.filter((lid) => lid !== id);
      }
    }
    els.entityDialog.close();
    entityEditing = null;
    saveProject(false);
    renderAll();
    toast("Deleted");
  });
}
/* ---------- Outline view ---------- */

function renderOutline() {
  const board = activeBoard();
  const numbers = cardSceneNumbers(board);
  const acts = board.columns
    .map((column) => {
      const rows = column.cards
        .map((cardId) => {
          const card = state.cards[cardId];
          if (!card) return "";
          const status = statusById(card.status);
          const location = locationById(card.locationId);
          const dimmed = filterActive() && !cardMatchesFilter(card);
          const slug = [card.intExt, location ? location.name.toUpperCase() : "", card.timeOfDay].filter(Boolean).join(" · ");
          const people = card.characterIds.map((id) => (characterById(id) || {}).name).filter(Boolean).join(", ");
          return `
          <div class="outline-row ${dimmed ? "is-dimmed" : ""}" data-outline-card="${card.id}">
            <span class="outline-num">${numbers.get(cardId)}</span>
            <div class="outline-body">
              <strong>${esc(card.title) || "Untitled"}</strong>
              ${slug ? `<p style="margin-top:1px;font-size:0.66rem;letter-spacing:0.04em;color:var(--muted)">${esc(slug)}</p>` : ""}
              ${card.synopsis ? `<p>${esc(card.synopsis)}</p>` : ""}
              ${people ? `<p style="font-size:0.7rem"><em>${esc(people)}</em></p>` : ""}
            </div>
            <div class="outline-side">
              <span class="status-chip" style="background:${status.color}">${status.name}</span>
              ${card.pages !== "" ? `<span>${formatPages(Number(card.pages))} pg</span>` : ""}
              ${(() => { const due = dueMeta(card); return due ? `<span class="card-due ${due.cls}" title="${esc(due.hint)}">⚑ ${esc(due.label)}</span>` : ""; })()}
            </div>
          </div>`;
        })
        .join("");
      const pages = columnPageTotal(column);
      return `
      <div class="outline-act">
        <h3>${esc(column.title)}</h3>
        <span>${column.cards.length} cards${pages ? ` · ${formatPages(pages)} pages` : ""}</span>
      </div>
      ${rows || `<p style="color:var(--muted);font-size:0.78rem;padding:8px 6px">Nothing pinned here yet.</p>`}`;
    })
    .join("");
  els.outlineView.innerHTML = `
    <div class="outline-page">
      <h2>${esc(state.title)}</h2>
      <p class="outline-subtitle">${esc(board.title)} · ${boardCardIds(board).length} cards · ${formatPages(boardPageTotal(board))} pages</p>
      ${acts}
    </div>`;
}

/* ---------- Arcs view ---------- */

function renderArcs() {
  const board = activeBoard();
  if (!state.characters.length) {
    els.arcsView.innerHTML = `
      <div class="arcs-empty">
        <strong>No characters yet.</strong><br /><br />
        Add your cast in the drawer (World → Cast), tag them into cards, and this grid becomes a
        character-by-scene arc tracker: every row a character, every column a card, every cell a beat.
      </div>`;
    return;
  }
  const numbers = cardSceneNumbers(board);
  const cardIds = boardCardIds(board);
  if (!cardIds.length) {
    els.arcsView.innerHTML = `<div class="arcs-empty"><strong>No cards on this board yet.</strong><br /><br />Pin some scenes first, then track arcs here.</div>`;
    return;
  }
  const headCells = cardIds
    .map((cardId) => {
      const card = state.cards[cardId];
      const home = findCardHome(cardId);
      return `
      <th title="${esc(card.title)}">
        <span class="arc-col-act">${esc(home ? home.column.title : "")} · #${numbers.get(cardId)}</span>
        <span class="arc-col-title">${esc(card.title) || "Untitled"}</span>
      </th>`;
    })
    .join("");
  const bodyRows = state.characters
    .map((ch) => {
      const cells = cardIds
        .map((cardId) => {
          const card = state.cards[cardId];
          const present = card.characterIds.includes(ch.id);
          const note = card.arcNotes[ch.id] || "";
          const editing = arcEditing && arcEditing.characterId === ch.id && arcEditing.cardId === cardId;
          if (editing) {
            return `
            <td class="arc-cell is-present">
              <textarea data-arc-cell-input autofocus placeholder="Beat for ${esc(ch.name)}…">${esc(note)}</textarea>
              <button class="button compact" type="button" data-arc-cell-remove style="margin:4px">Remove from scene</button>
            </td>`;
          }
          return `
          <td class="arc-cell ${present ? "is-present" : ""}">
            <button type="button" data-arc-cell="${ch.id}:${cardId}" title="${present ? "Edit beat" : `Tag ${esc(ch.name)} into this scene`}">
              ${present ? `<span class="arc-dot" style="background:${ch.color}"></span>` : ""}
              <span class="arc-note">${esc(note)}</span>
            </button>
          </td>`;
        })
        .join("");
      return `
      <tr>
        <th>
          <div class="arc-char-cell">
            <span class="entity-avatar" style="background:${ch.color}">${esc(initialsOf(ch.name))}</span>
            <div><strong>${esc(ch.name)}</strong><span>${esc(ch.role || "")}</span></div>
          </div>
        </th>
        ${cells}
      </tr>`;
    })
    .join("");
  els.arcsView.innerHTML = `
    <table class="arcs-table">
      <thead><tr><th class="arc-corner">Character / Scene</th>${headCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>`;
  const input = els.arcsView.querySelector("[data-arc-cell-input]");
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

/* ---------- Export / import ---------- */

function exportProjectJson() {
  return serializeProject(state);
}

function buildMarkdownOutline() {
  const lines = [`# ${state.title}`, ""];
  for (const board of state.boards) {
    lines.push(`## ${board.title}`, "");
    const numbers = cardSceneNumbers(board);
    for (const column of board.columns) {
      const pages = columnPageTotal(column);
      lines.push(`### ${column.title} (${column.cards.length} cards${pages ? `, ${formatPages(pages)} pages` : ""})`, "");
      for (const cardId of column.cards) {
        const card = state.cards[cardId];
        if (!card) continue;
        const location = locationById(card.locationId);
        const slug = [card.intExt, location ? location.name.toUpperCase() : "", card.timeOfDay].filter(Boolean).join(" — ");
        const people = card.characterIds.map((id) => (characterById(id) || {}).name).filter(Boolean).join(", ");
        const labels = card.labelIds.map((id) => (labelById(id) || {}).name).filter(Boolean).join(", ");
        lines.push(`${numbers.get(cardId)}. **${card.title || "Untitled"}**${card.pages !== "" ? ` _(${formatPages(Number(card.pages))} pg)_` : ""}`);
        if (slug) lines.push(`   - ${slug}`);
        if (card.synopsis) lines.push(`   - ${card.synopsis}`);
        if (people) lines.push(`   - Cast: ${people}`);
        if (labels) lines.push(`   - Labels: ${labels}`);
        if (card.due) lines.push(`   - Due: ${card.due}`);
        const beats = Object.entries(card.arcNotes)
          .map(([chId, note]) => {
            const ch = characterById(chId);
            return ch && note ? `${ch.name}: ${note}` : "";
          })
          .filter(Boolean);
        for (const beat of beats) lines.push(`   - Arc — ${beat}`);
        lines.push("");
      }
    }
  }
  if (state.characters.length) {
    lines.push("## Characters", "");
    for (const ch of state.characters) {
      lines.push(`- **${ch.name}**${ch.role ? ` (${ch.role})` : ""}${ch.arc ? ` — ${ch.arc}` : ""}`);
      if (ch.want) lines.push(`  - Want: ${ch.want}`);
      if (ch.need) lines.push(`  - Need: ${ch.need}`);
    }
    lines.push("");
  }
  if (state.locations.length) {
    lines.push("## Locations", "");
    for (const loc of state.locations) {
      lines.push(`- **${loc.name}** (${loc.kind})${loc.notes ? ` — ${loc.notes}` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function csvEscape(value) {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str;
}

function buildCsv() {
  const rows = [["Board", "Column", "#", "Title", "Synopsis", "Int/Ext", "Time", "Location", "Characters", "Labels", "Status", "Pages", "Due"]];
  for (const board of state.boards) {
    const numbers = cardSceneNumbers(board);
    for (const column of board.columns) {
      for (const cardId of column.cards) {
        const card = state.cards[cardId];
        if (!card) continue;
        const location = locationById(card.locationId);
        rows.push([
          board.title,
          column.title,
          numbers.get(cardId),
          card.title,
          card.synopsis,
          card.intExt,
          card.timeOfDay,
          location ? location.name : "",
          card.characterIds.map((id) => (characterById(id) || {}).name).filter(Boolean).join("; "),
          card.labelIds.map((id) => (labelById(id) || {}).name).filter(Boolean).join("; "),
          statusById(card.status).name,
          card.pages,
          card.due,
        ]);
      }
    }
  }
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function buildFountain() {
  const lines = [`Title: ${state.title}`, `Credit: Planned with Cork Board`, ""];
  for (const board of state.boards) {
    if (state.boards.length > 1) lines.push(`# ${board.title}`, "");
    for (const column of board.columns) {
      lines.push(`## ${column.title}`, "");
      for (const cardId of column.cards) {
        const card = state.cards[cardId];
        if (!card) continue;
        const location = locationById(card.locationId);
        const intExt = card.intExt ? `${card.intExt.replace("INT/EXT", "INT./EXT")}.` : "INT.";
        const heading = `${intExt} ${(location ? location.name : card.title || "LOCATION").toUpperCase()}${card.timeOfDay ? ` - ${card.timeOfDay}` : ""}`;
        lines.push(heading, "");
        if (card.synopsis) lines.push(`= ${card.synopsis}`, "");
      }
    }
  }
  return lines.join("\n");
}

function downloadText(text, filename, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}

function slugFilename(ext) {
  const base = (state.title || "cork-board").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "cork-board";
  return `${base}.${ext}`;
}

function openExportDialog() {
  els.exportText.value = buildMarkdownOutline();
  els.exportDialog.showModal();
}

function importProjectFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!parsed || typeof parsed !== "object" || !parsed.boards) throw new Error("bad");
      parsed.id = uid("proj");
      adoptProject(parsed, `Imported "${parsed.title || "project"}"`);
      els.exportDialog.close();
    } catch {
      toast("That file doesn't look like a Cork Board project", true);
    }
  };
  reader.readAsText(file);
}

/* ---------- Templates dialog ---------- */

function renderTemplates() {
  els.templatesList.innerHTML = TEMPLATES.map(
    (t) => `
    <button class="template-card ${t.demo ? "demo" : ""}" type="button" data-template="${t.id}">
      <span class="template-kind">${t.kind}</span>
      <strong>${esc(t.name)}</strong>
      <span class="template-desc">${esc(t.desc)}</span>
    </button>`
  ).join("");
}

function instantiateTemplate(templateId) {
  const template = TEMPLATES.find((t) => t.id === templateId);
  if (!template) return;
  const project = template.build();
  adoptProject(project, `Created "${project.title}"`);
  els.templatesDialog.close();
}

/* ---------- Help panel ---------- */

function positionHelpPanel() {
  let position = null;
  try {
    position = JSON.parse(storage.getItem(HELP_POSITION_KEY) || "null");
  } catch {}
  if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
    els.helpPanel.style.left = `${clamp(position.x, 8, window.innerWidth - 120)}px`;
    els.helpPanel.style.top = `${clamp(position.y, 8, window.innerHeight - 120)}px`;
    els.helpPanel.style.right = "auto";
  }
}

function bindHelpDrag() {
  els.helpDragHandle.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    const rect = els.helpPanel.getBoundingClientRect();
    helpDragState = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    const onMove = (moveEvent) => {
      if (!helpDragState) return;
      const x = clamp(moveEvent.clientX - helpDragState.dx, 4, window.innerWidth - 140);
      const y = clamp(moveEvent.clientY - helpDragState.dy, 4, window.innerHeight - 80);
      els.helpPanel.style.left = `${x}px`;
      els.helpPanel.style.top = `${y}px`;
      els.helpPanel.style.right = "auto";
    };
    const onUp = () => {
      helpDragState = null;
      const rect2 = els.helpPanel.getBoundingClientRect();
      storage.setItem(HELP_POSITION_KEY, JSON.stringify({ x: Math.round(rect2.left), y: Math.round(rect2.top) }));
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
}

/* ---------- Inspector resize ---------- */

function bindInspectorResize() {
  els.inspectorResizeHandle.addEventListener("pointerdown", (event) => {
    resizeState = { startX: event.clientX, startWidth: ui.inspectorWidth };
    const onMove = (moveEvent) => {
      if (!resizeState) return;
      ui.inspectorWidth = clamp(resizeState.startWidth + (resizeState.startX - moveEvent.clientX), 300, 560);
      els.inspector.style.width = `${ui.inspectorWidth}px`;
    };
    const onUp = () => {
      resizeState = null;
      saveUiPrefs();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
}
/* ---------- Event wiring ---------- */

function bindTopBar() {
  els.projectTitle.addEventListener("input", () => {
    state.title = els.projectTitle.value;
    scheduleSave();
  });
  els.projectTitle.addEventListener("change", () => {
    renderProjectSelect();
    if (ui.view === "outline") renderOutline();
  });
  els.projectSelect.addEventListener("change", () => {
    const targetId = els.projectSelect.value;
    saveProject(false); // re-renders the select, so capture the target id first
    loadProject(targetId);
  });
  els.undoBtn.addEventListener("click", undo);
  els.newProjectBtn.addEventListener("click", () => {
    saveProject(false);
    adoptProject(createBlankProject(), "New project started");
  });
  els.templatesBtn.addEventListener("click", () => {
    renderTemplates();
    els.templatesDialog.showModal();
  });
  els.findBtn.addEventListener("click", () => toggleFilterBar());
  els.versionsBtn.addEventListener("click", () => {
    renderVersions();
    els.versionsDialog.showModal();
  });
  els.helpBtn.addEventListener("click", () => {
    els.helpPanel.classList.toggle("is-hidden");
    if (!els.helpPanel.classList.contains("is-hidden")) positionHelpPanel();
  });
  els.helpCloseBtn.addEventListener("click", () => els.helpPanel.classList.add("is-hidden"));
  els.saveProjectBtn.addEventListener("click", () => saveProject(true));
  els.exportBtn.addEventListener("click", openExportDialog);
}

function toggleFilterBar(forceOpen = null) {
  filterOpen = forceOpen === null ? !filterOpen : forceOpen;
  els.filterBar.classList.toggle("is-hidden", !filterOpen);
  if (filterOpen) {
    renderFilterControls();
    els.searchInput.focus();
  } else {
    clearFilter();
  }
}

function bindFilterBar() {
  els.searchInput.addEventListener("input", () => {
    filter.query = els.searchInput.value.trim();
    renderFilterControls();
    renderMainView();
  });
  for (const [el, key] of [
    [els.filterCharacter, "characterId"],
    [els.filterLocation, "locationId"],
    [els.filterLabel, "labelId"],
    [els.filterStatus, "status"],
    [els.filterDue, "due"],
  ]) {
    el.addEventListener("change", () => {
      filter[key] = el.value;
      renderFilterControls();
      renderMainView();
    });
  }
  els.clearFilterBtn.addEventListener("click", () => clearFilter());
  els.closeFilterBtn.addEventListener("click", () => toggleFilterBar(false));
}

function bindBoardBar() {
  els.addBoardBtn.addEventListener("click", () => {
    pushUndo();
    const board = makeBoard(`Board ${state.boards.length + 1}`, [
      makeColumn("Ideas", COLUMN_ACCENTS[7]),
      makeColumn("Act I", COLUMN_ACCENTS[0]),
      makeColumn("Act II", COLUMN_ACCENTS[1]),
      makeColumn("Act III", COLUMN_ACCENTS[2]),
    ]);
    state.boards.push(board);
    state.activeBoardId = board.id;
    saveProject(false);
    renderAll();
  });

  els.viewBoardBtn.addEventListener("click", () => setView("board"));
  els.viewOutlineBtn.addEventListener("click", () => setView("outline"));
  els.viewArcsBtn.addEventListener("click", () => setView("arcs"));

  els.surfaceBtn.addEventListener("click", () => {
    ui.surface = SURFACES[(SURFACES.indexOf(ui.surface) + 1) % SURFACES.length];
    saveUiPrefs();
    renderChromeButtons();
  });
  els.densityBtn.addEventListener("click", () => {
    ui.density = DENSITIES[(DENSITIES.indexOf(ui.density) + 1) % DENSITIES.length];
    saveUiPrefs();
    renderChromeButtons();
  });
  els.toggleDrawerBtn.addEventListener("click", () => {
    ui.drawerOpen = !ui.drawerOpen;
    saveUiPrefs();
    renderChromeButtons();
  });

  // Board tabs: click to switch, double-click to rename, drag to reorder.
  els.boardTabs.addEventListener("pointerdown", (event) => {
    const tab = event.target.closest("[data-board-tab]");
    if (!tab || event.target.closest("input")) return;
    const boardId = tab.dataset.boardTab;
    beginPointerTracking(event, {
      onStart: () => {
        tab.style.opacity = "0.4";
      },
      onMove: (moveEvent) => {
        const over = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest("[data-board-tab]");
        if (!over || over === tab) return;
        const fromIndex = state.boards.findIndex((b) => b.id === boardId);
        const toIndex = state.boards.findIndex((b) => b.id === over.dataset.boardTab);
        if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
        const [moved] = state.boards.splice(fromIndex, 1);
        state.boards.splice(toIndex, 0, moved);
        renderBoardTabs();
      },
      onDrop: () => {
        tab.style.opacity = "";
        saveProject(false);
        renderBoardTabs();
      },
      onClick: () => {
        if (state.activeBoardId !== boardId) {
          state.activeBoardId = boardId;
          selectedCardId = "";
          closeInspector();
          saveProject(false);
          renderAll();
        }
      },
    });
  });

  els.boardTabs.addEventListener("dblclick", (event) => {
    const tab = event.target.closest("[data-board-tab]");
    if (!tab) return;
    const board = state.boards.find((b) => b.id === tab.dataset.boardTab);
    if (!board) return;
    const titleEl = tab.querySelector(".tab-title");
    titleEl.innerHTML = `<input type="text" value="${esc(board.title)}" aria-label="Board title" />`;
    const input = titleEl.querySelector("input");
    input.focus();
    input.select();
    const commit = () => {
      const value = input.value.trim();
      if (value && value !== board.title) {
        pushUndo();
        board.title = value;
        saveProject(false);
      }
      renderBoardTabs();
      if (ui.view !== "board") renderMainView();
    };
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key === "Enter") input.blur();
      if (keyEvent.key === "Escape") {
        input.value = board.title;
        input.blur();
      }
    });
  });

  // Right-click a board tab to delete it (with confirm).
  els.boardTabs.addEventListener("contextmenu", (event) => {
    const tab = event.target.closest("[data-board-tab]");
    if (!tab) return;
    event.preventDefault();
    const board = state.boards.find((b) => b.id === tab.dataset.boardTab);
    if (!board || state.boards.length <= 1) {
      toast("A project needs at least one board");
      return;
    }
    const count = boardCardIds(board).length;
    askConfirm(`Delete board "${board.title}"?`, `${count} card${count === 1 ? "" : "s"} will go with it. Undo can bring it back.`, () => {
      pushUndo();
      for (const cardId of boardCardIds(board)) delete state.cards[cardId];
      state.boards = state.boards.filter((b) => b.id !== board.id);
      if (state.activeBoardId === board.id) state.activeBoardId = state.boards[0].id;
      if (selectedCardId && !state.cards[selectedCardId]) {
        selectedCardId = "";
        closeInspector();
      }
      saveProject(false);
      renderAll();
      toast("Board deleted");
    });
  });
}

function setView(view) {
  ui.view = view;
  saveUiPrefs();
  renderChromeButtons();
  renderMainView();
}

function bindBoardEvents() {
  els.columnRow.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button, input, textarea, select")) return;

    const cardEl = event.target.closest(".index-card");
    if (cardEl) {
      const cardId = cardEl.dataset.cardId;
      beginPointerTracking(event, {
        onStart: (e) => startCardDrag(e, cardEl, cardId),
        onMove: updateCardDrag,
        onDrop: finishCardDrag,
        onClick: () => openInspector(cardId),
      });
      return;
    }

    const grip = event.target.closest("[data-column-grip]");
    if (grip) {
      const columnEl = grip.closest(".board-column");
      const columnId = grip.dataset.columnGrip;
      const found = findColumn(columnId);
      if (found && found.column.collapsed) {
        beginPointerTracking(event, {
          onStart: (e) => startColumnDrag(e, columnEl, columnId),
          onMove: updateColumnDrag,
          onDrop: finishColumnDrag,
          onClick: () => {
            pushUndo();
            found.column.collapsed = false;
            saveProject(false);
            renderBoard();
          },
        });
        return;
      }
      beginPointerTracking(event, {
        onStart: (e) => startColumnDrag(e, columnEl, columnId),
        onMove: updateColumnDrag,
        onDrop: finishColumnDrag,
        onClick: null,
      });
    }
  });

  els.columnRow.addEventListener("click", (event) => {
    const addCard = event.target.closest("[data-add-card]")?.dataset.addCard;
    if (addCard) {
      openQuickAdd(addCard);
      return;
    }
    const commit = event.target.closest("[data-quick-add-commit]")?.dataset.quickAddCommit;
    if (commit) {
      commitQuickAdd(commit, true);
      return;
    }
    const cancel = event.target.closest("[data-quick-add-cancel]")?.dataset.quickAddCancel;
    if (cancel) {
      quickAddColumnId = "";
      renderBoard();
      return;
    }
    const menu = event.target.closest("[data-column-menu]")?.dataset.columnMenu;
    if (menu) {
      openColumnMenu(event.target.closest("[data-column-menu]"), menu);
      return;
    }
    const expand = event.target.closest("[data-column-expand]")?.dataset.columnExpand;
    if (expand) {
      const found = findColumn(expand);
      if (found) {
        pushUndo();
        found.column.collapsed = false;
        saveProject(false);
        renderBoard();
      }
    }
  });

  els.columnRow.addEventListener("dblclick", (event) => {
    const titleEl = event.target.closest("[data-column-title]");
    if (titleEl) startColumnRename(titleEl.dataset.columnTitle);
  });

  els.columnRow.addEventListener("keydown", (event) => {
    const input = event.target.closest("[data-quick-add-input]");
    if (!input) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      commitQuickAdd(input.dataset.quickAddInput, true);
    }
    if (event.key === "Escape") {
      quickAddColumnId = "";
      renderBoard();
    }
  });

  // Add a column from the empty space at the end of the row (double-click).
  els.boardView.addEventListener("dblclick", (event) => {
    if (event.target !== els.boardView && event.target !== els.columnRow) return;
    pushUndo();
    const board = activeBoard();
    board.columns.push(makeColumn("New Column", COLUMN_ACCENTS[board.columns.length % COLUMN_ACCENTS.length]));
    saveProject(false);
    renderBoard();
    toast("Column added");
  });
}

function bindDrawerEvents() {
  document.querySelectorAll(".drawer-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      ui.drawerTab = tab.dataset.drawerTab;
      saveUiPrefs();
      renderDrawer();
    });
  });

  els.drawerContent.addEventListener("pointerdown", (event) => {
    const chip = event.target.closest("[data-entity-chip]");
    if (!chip) return;
    const [kind, id] = chip.dataset.entityChip.split(":");
    if (kind === "character") {
      beginPointerTracking(event, {
        onStart: (e) => startChipDrag(e, chip, id),
        onMove: updateChipDrag,
        onDrop: finishChipDrag,
        onClick: () => openEntityDialog("character", id),
      });
    } else {
      beginPointerTracking(event, {
        onStart: () => {},
        onMove: () => {},
        onDrop: () => {},
        onClick: () => openEntityDialog(kind, id),
      });
    }
  });

  els.drawerContent.addEventListener("click", (event) => {
    const add = event.target.closest("[data-entity-add]")?.dataset.entityAdd;
    if (add) openEntityDialog(add, "");
  });
}

function bindOutlineEvents() {
  els.outlineView.addEventListener("click", (event) => {
    const row = event.target.closest("[data-outline-card]");
    if (row) openInspector(row.dataset.outlineCard);
  });
}

function bindArcsEvents() {
  els.arcsView.addEventListener("click", (event) => {
    if (event.target.closest("[data-arc-cell-remove]")) {
      if (arcEditing) {
        const card = state.cards[arcEditing.cardId];
        if (card) {
          pushUndo();
          card.characterIds = card.characterIds.filter((id) => id !== arcEditing.characterId);
          delete card.arcNotes[arcEditing.characterId];
          scheduleSave();
        }
        arcEditing = null;
        renderArcs();
      }
      return;
    }
    const cell = event.target.closest("[data-arc-cell]")?.dataset.arcCell;
    if (cell) {
      const [characterId, cardId] = cell.split(":");
      const card = state.cards[cardId];
      if (!card) return;
      if (!card.characterIds.includes(characterId)) {
        pushUndo();
        card.characterIds.push(characterId);
        scheduleSave();
      }
      arcEditing = { characterId, cardId };
      renderArcs();
    }
  });

  els.arcsView.addEventListener(
    "blur",
    (event) => {
      if (!event.target.matches("[data-arc-cell-input]") || !arcEditing) return;
      const card = state.cards[arcEditing.cardId];
      if (card) {
        const value = event.target.value.trim();
        if (value) card.arcNotes[arcEditing.characterId] = value;
        else delete card.arcNotes[arcEditing.characterId];
        card.updatedAt = now();
        scheduleSave();
      }
      arcEditing = null;
      renderArcs();
    },
    true
  );

  els.arcsView.addEventListener("keydown", (event) => {
    if (!event.target.matches("[data-arc-cell-input]")) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.target.blur();
    }
    if (event.key === "Escape") {
      arcEditing = null;
      renderArcs();
    }
  });
}

function bindDialogEvents() {
  els.templatesList.addEventListener("click", (event) => {
    const template = event.target.closest("[data-template]")?.dataset.template;
    if (template) instantiateTemplate(template);
  });

  els.downloadOutlineBtn.addEventListener("click", () => downloadText(buildMarkdownOutline(), slugFilename("md"), "text/markdown"));
  els.downloadCsvBtn.addEventListener("click", () => downloadText(buildCsv(), slugFilename("csv"), "text/csv"));
  els.downloadFountainBtn.addEventListener("click", () => downloadText(buildFountain(), slugFilename("fountain"), "text/plain"));
  els.downloadJsonBtn.addEventListener("click", () =>
    downloadText(JSON.stringify(exportProjectJson(), null, 2), slugFilename("json"), "application/json")
  );
  els.importJsonBtn.addEventListener("click", () => els.importFileInput.click());
  els.importFileInput.addEventListener("change", () => {
    const file = els.importFileInput.files[0];
    if (file) importProjectFromFile(file);
    els.importFileInput.value = "";
  });

  els.saveVersionBtn.addEventListener("click", () => {
    saveVersion(els.versionName.value.trim());
    els.versionName.value = "";
  });
  els.versionsList.addEventListener("click", (event) => {
    const restore = event.target.closest("[data-restore-version]")?.dataset.restoreVersion;
    if (restore) {
      restoreVersion(restore);
      els.versionsDialog.close();
      return;
    }
    const remove = event.target.closest("[data-delete-version]")?.dataset.deleteVersion;
    if (remove) deleteVersion(remove);
  });

  els.entityDialogBody.addEventListener("click", (event) => {
    const color = event.target.closest("[data-entity-color]")?.dataset.entityColor;
    if (color && entityEditing) {
      entityEditing.draftColor = color;
      els.entityDialogBody.querySelectorAll("[data-entity-color]").forEach((el) => {
        el.classList.toggle("is-active", el.dataset.entityColor === color);
      });
    }
  });
  els.entityDialogBody.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.matches("input")) {
      event.preventDefault();
      commitEntityDialog();
    }
  });
  els.entitySaveBtn.addEventListener("click", commitEntityDialog);
  els.entityDeleteBtn.addEventListener("click", deleteEntityFromDialog);

  els.confirmDialog.addEventListener("close", () => {
    if (els.confirmDialog.returnValue === "ok" && confirmHandler) confirmHandler();
    confirmHandler = null;
  });
}

/* ---------- Keyboard ---------- */

function bindKeyboard() {
  window.addEventListener("keydown", (event) => {
    const inField = event.target.closest("input, textarea, select, [contenteditable]");
    const dialogOpen = document.querySelector("dialog[open]");

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      if (!inField) {
        event.preventDefault();
        undo();
      }
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      toggleFilterBar(true);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveProject(true);
      return;
    }
    if (event.key === "Escape") {
      if (dialogOpen) return; // dialogs handle their own escape
      if (!els.helpPanel.classList.contains("is-hidden")) {
        els.helpPanel.classList.add("is-hidden");
        return;
      }
      if (quickAddColumnId) {
        quickAddColumnId = "";
        renderBoard();
        return;
      }
      if (filterOpen) {
        toggleFilterBar(false);
        return;
      }
      closeInspector();
      return;
    }
    if (inField || dialogOpen) return;

    if (event.key === "?") {
      els.helpPanel.classList.toggle("is-hidden");
      return;
    }
    if (event.key === "1") setView("board");
    if (event.key === "2") setView("outline");
    if (event.key === "3") setView("arcs");
    if (event.key.toLowerCase() === "n") {
      const board = activeBoard();
      const target = board.columns.find((c) => !c.collapsed);
      if (target) {
        setView("board");
        openQuickAdd(target.id);
      }
      event.preventDefault();
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selectedCardId) {
      const card = state.cards[selectedCardId];
      if (card) {
        askConfirm(`Delete "${card.title || "Untitled card"}"?`, "Undo can bring it back during this session.", () => {
          pushUndo();
          deleteCard(selectedCardId);
          saveProject(false);
          renderBoard();
          renderBoardTabs();
          renderDrawer();
          toast("Card deleted");
        });
      }
      return;
    }
    if (event.key.toLowerCase() === "d" && selectedCardId) {
      pushUndo();
      const copyId = duplicateCard(selectedCardId);
      saveProject(false);
      renderBoard();
      renderBoardTabs();
      if (copyId) openInspector(copyId);
      toast("Card duplicated");
    }
  });
}

/* ---------- Init ---------- */

function init() {
  loadUiPrefs();
  projects = readProjectsRegistry();

  if (!projects.length) {
    // First run: load the AVA demo so the board is alive from second one.
    const demo = buildDemoAva();
    state = normalizeProject(demo);
    projects = [{ id: state.id, title: state.title }];
    writeProjectsRegistry();
    storage.setItem(projectStorageKey(state.id), JSON.stringify(serializeProject(state)));
    storage.setItem(ACTIVE_PROJECT_KEY, state.id);
  } else {
    const activeId = storage.getItem(ACTIVE_PROJECT_KEY);
    const target = projects.find((p) => p.id === activeId) || projects[0];
    const raw = storage.getItem(projectStorageKey(target.id));
    try {
      state = normalizeProject(JSON.parse(raw));
    } catch {
      state = createBlankProject();
    }
  }

  bindTopBar();
  bindFilterBar();
  bindBoardBar();
  bindBoardEvents();
  bindDrawerEvents();
  bindInspectorEvents();
  bindOutlineEvents();
  bindArcsEvents();
  bindDialogEvents();
  bindKeyboard();
  bindHelpDrag();
  bindInspectorResize();

  renderAll();
}

init();
