# cork-board-mcp

Headless MCP (Model Context Protocol) server for **[Cork Board](https://github.com/wassermanproductions/cork-board)** — the digital cork board for filmmakers: index cards, acts, arcs, and episodes. With this server connected, an AI agent can read and edit a Cork Board project and produce the app's own exports **without opening the desktop app** — it works directly on the project's JSON data on disk.

An agent can start from a production preset, add acts and scene index cards, write synopses and slug lines, set status and page counts, create and tag cast / places / labels, track a character's arc beat by beat, restructure the wall, and export the whole thing as a Markdown outline, CSV scene list, Fountain scaffold, JSON, or the printable Share Wall.

Zero dependencies. Node ≥ 18. One file.

## What it operates on

Cork Board stores a project as a single JSON object — the same shape the app writes from **Export → JSON** and reads back from **Export → Import**:

```
{ schema, id, title, type, boards[], activeBoardId, cards{}, characters[], locations[], labels[] }
```

A **project** is a wall of index cards. A **board** is one wall (a feature is usually one board; a series has a season board plus a board per episode). An **act** is a column on a board (Act I, Teaser, Verse 1, Ep 101…). A **card** is a scene index card, referenced by id from its act and stored in the project's `cards` map. Scene numbers are derived per board, counting top-to-bottom through the acts — they follow position, they are not stored. This server reads and writes that JSON directly, in the exact shape the app normalizes on load, so a board an agent edits opens cleanly in Cork Board.

The project file is resolved in this order:

1. the `projectPath` argument on a tool call, if given;
2. the `CORK_BOARD_PROJECT` environment variable;
3. the default app-data location — `~/Library/Application Support/cork-board/cork-board-project.json` on macOS (`%APPDATA%\cork-board\…` on Windows, `$XDG_CONFIG_HOME/cork-board/…` on Linux).

Typical loop: **Export → JSON** from Cork Board (or let the agent `create_project` / `apply_preset`), point the server at that file, let the agent work, then **Export → Import** the file back into the app.

## Requirements

- **Node ≥ 18.** No build step, no `npm install` — the server uses only Node built-ins.
- A Cork Board project JSON file (create one with `create_project` or `apply_preset`, or point at a project you exported from the app).

## Connect

### Hermes

Add to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  cork-board:
    command: "node"
    args: ["/absolute/path/to/cork-board/mcp/cork-board-mcp.mjs"]
    env:
      CORK_BOARD_PROJECT: "/absolute/path/to/your/cork-board-project.json"
```

### Claude Code

```bash
claude mcp add cork-board \
  --env CORK_BOARD_PROJECT=/absolute/path/to/your/cork-board-project.json \
  -- node /absolute/path/to/cork-board/mcp/cork-board-mcp.mjs
```

### Codex

Add to your Codex MCP config (`~/.codex/config.toml`):

```toml
[mcp_servers.cork-board]
command = "node"
args = ["/absolute/path/to/cork-board/mcp/cork-board-mcp.mjs"]
env = { CORK_BOARD_PROJECT = "/absolute/path/to/your/cork-board-project.json" }
```

### Any MCP client (generic stdio config)

```json
{
  "mcpServers": {
    "cork-board": {
      "command": "node",
      "args": ["/absolute/path/to/cork-board/mcp/cork-board-mcp.mjs"],
      "env": { "CORK_BOARD_PROJECT": "/absolute/path/to/your/cork-board-project.json" }
    }
  }
}
```

## Tools (25)

Call **`get_board` first** — its response explains the data conventions (boards, acts, derived scene numbers, cards, cast/places/labels).

| Tool | What it does |
| --- | --- |
| `get_board` | Read the whole wall: project, every board summary, one board fully expanded (acts + cards), and the cast, places, and labels. Start here. |
| `create_project` | Create a new empty project (Ideas + three acts). |
| `list_presets` | List the 13 built-in production structures. |
| `apply_preset` | Create a new project from a preset (AVA demo, Save the Cat, One-Hour Pilot, Season Arc Wall, Documentary, …). |
| `list_cards` | List scene cards with board, act, scene number, title, slug, status, pages, due. |
| `get_card` | Full record of one scene card. |
| `add_card` | Pin a new scene card into an act, with fields. |
| `update_card` | Change fields on a card (synopsis, INT/EXT, time, location, status, pages, due, paper…). |
| `move_card` | Move a card to another act and/or reorder it. |
| `delete_card` | Remove a scene card. |
| `tag_card` | Add/remove a cast member, place, or label on a card. |
| `set_arc_beat` | Set or clear a character's arc beat on a card (one Arcs-grid cell). |
| `add_act` | Add an act (column) to a board. |
| `rename_act` | Rename an act (and optionally recolor it). |
| `reorder_acts` | Reorder a board's acts. |
| `delete_act` | Delete an act and its cards. |
| `add_board` | Add a board (wall) — e.g. an episode alongside a season wall. |
| `rename_board` | Rename a board. |
| `add_entity` | Create a cast member, place, or label. |
| `update_entity` | Edit a cast member, place, or label. |
| `export_outline` | Return the Markdown outline (the app's Outline export). |
| `export_scene_list` | Return the CSV scene list (schedule-friendly). |
| `export_fountain` | Return the Fountain scaffold with scene headings. |
| `export_json` | Return the full project JSON. |
| `export_share_html` | Return the printable Share Wall HTML (project JSON embedded). |

The five `export_*` tools reproduce Cork Board's own export functions, so their output matches what the app writes from its Export dialog. `apply_preset` builds the exact boards, acts, guide cards, and labels — and for the AVA demo the full six-character cast, ten locations, six labels, and 36 scenes — that the app's Presets dialog creates.

A typical agent session: `apply_preset` (or `create_project`) → `add_entity` (cast/places/labels) → `add_act` → `add_card` (scenes) → `tag_card` + `set_arc_beat` → `move_card` / `reorder_acts` to structure → `export_outline` / `export_fountain`, then **Export → Import** the file into Cork Board.

## Security

This server only touches the local filesystem: it reads and writes the Cork Board project JSON you point it at. It opens no network connections and exposes nothing off-machine. Point it only at project paths you trust.

## License & credit

Apache-2.0 — see the repository [LICENSE](../LICENSE) and [NOTICE](../NOTICE). Please credit **Sam Wasserman ([wassermanproductions.com](https://wassermanproductions.com))** in uses, forks, and redistributions.
