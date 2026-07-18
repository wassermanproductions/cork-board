# Cork Board — Usage Guide

## The mental model

A **project** is one production. A project has one or more **boards** (walls) — a feature usually needs one; a series gets a season wall plus a board per episode. Each board has **columns** (acts, sequences, song sections, episode slots) and each column holds **index cards** (scenes or beats).

Characters, locations, and labels live at the project level, so the same cast is shared across every episode board.

## Top bar

| Control | What it does |
| --- | --- |
| Project menu | Switch between saved projects. |
| Undo | Reverse the last change (up to 60 steps, Cmd/Ctrl+Z). |
| New | Create a blank project. |
| Presets | Start from a production structure or load the AVA demo. |
| Find | Search text and filter by character, location, label, status, deadline. |
| History | Save or restore named checkpoints. |
| Save | Save now (autosave also runs after every change). |
| Export | Markdown outline, CSV scene list, Fountain scaffold, project JSON, or import JSON. |

## Board bar

- **Board tabs** — one per wall/episode. Click to switch, double-click to rename, drag to reorder, right-click to delete, `+` to add.
- **Board / Outline / Arcs** — the three views (keys `1`, `2`, `3`).
- **Cork / Paper / Midnight** — board surface.
- **Cards: S/M/L** — index card size.
- **World** — show/hide the drawer.

## Working the wall

- **Add a card**: `+ Add card` at the bottom of any column (Enter adds and keeps the box open), or press `N`.
- **Move a card**: drag it. Within a column, across columns, or onto another board tab.
- **Move a column**: drag its header. Use the `⋯` menu for rename, collapse, accent color, insert, duplicate (with cards), sort cards (by status, due date, title, or pages), delete.
- **Edit a card**: click it. The inspector covers synopsis, paper color, INT/EXT, time, pages, location, status, due date, characters, labels, per-character arc beats, checklist, and notes.
- **Deadlines**: set a due date in the inspector. The card's flag turns amber within three days, red when overdue, and stops alarming once the scene is Locked or Cut.
- **Tag a character**: drag their chip from the Cast drawer onto any card, or toggle chips in the inspector.
- **Add a column**: double-click empty cork, or use a column's `⋯` menu.

## Arcs view

Rows are characters, columns are scenes in board order. A colored dot means the character is in the scene; the text is their arc beat for that scene. Click any cell to tag the character and write the beat. The same beats appear in the card inspector under "Arc Beats" and in the Markdown export.

## Keyboard

`Cmd/Ctrl+Z` undo · `Cmd/Ctrl+F` find · `Cmd/Ctrl+S` save · `N` new card · `D` duplicate selected · `Delete` delete selected · `1/2/3` views · `Esc` close · `?` key.

## Data

Everything is saved locally (per project) on every change. Use **History** checkpoints before big restructures, and **Export → Project (JSON)** for backups or to move a project between machines (Import JSON on the other side).
