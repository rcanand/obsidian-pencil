# Pencil

An infinite whiteboard for Obsidian. Draw and handwrite with a stylus, mouse, or finger — saved as `.pencil` files right inside your vault.

Pencil is an opinionated, single-slice take on handwriting in Obsidian. The existing whiteboard apps are heavy and loaded with features most people never touch. Pencil does one thing well: a fast, infinite canvas that feels like pen on paper, and nothing more.

## What you get

- **Infinite canvas** — pan and zoom endlessly; your view position is saved with the note.
- **Stylus-first, pressure-aware** — Apple Pencil and other pens get real pressure-thickness variation. Toggle it off anytime.
- **Mouse and finger too** — no stylus? Draw with a mouse or finger. Pressure is simply held constant.
- **Palm rejection** — once you've used a pen, finger touches become panning so you can rest your hand. Two-finger pinch to zoom.
- **Eraser** — stroke-level erase by dragging over what you don't want.
- **Select & move** — box-select strokes and drag them around.
- **Colors & sizes** — 8 built-in colors plus your own custom palette (native color picker, long-press or right-click to remove). Four stroke widths.
- **Undo / redo** — full history (`⌘Z` / `⌘⇧Z`, or `Ctrl`).
- **Saved as vault files** — each whiteboard is a `.pencil` JSON file, versioned and synced with the rest of your notes.
- **Works everywhere** — desktop, iPad, and mobile. The toolbar adapts: icons on desktop, short text labels on mobile.

## Tools & shortcuts

| Tool   | Key | Notes                                   |
| ------ | --- | --------------------------------------- |
| Pencil | `P` | Draw. Pressure varies with pen input.   |
| Eraser | `E` | Drag over strokes to delete them.       |
| Select | `V` | Box-select, then drag to move.          |
| Pan    | `H` | Drag to pan (also: middle/right mouse). |

Other shortcuts: `⌘/Ctrl+Z` undo, `⌘/Ctrl+Shift+Z` redo, `Delete`/`Backspace` removes the current selection.

Scroll to pan; `⌘/Ctrl` + scroll (or pinch on touch) to zoom. Use **Fit** to frame everything you've drawn.

## Creating a whiteboard

Click the pencil icon in the ribbon, or run the **Create new whiteboard** command. A `Whiteboard.pencil` file is created in your active folder and opened immediately (subsequent ones are numbered `Whiteboard 1`, `Whiteboard 2`, …).

## Installation

### From the community plugin browser

1. Open **Settings → Community plugins** in Obsidian.
2. Click **Browse** and search for **Pencil**.
3. Click **Install**, then **Enable**.

### Manual install

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/rcanand/obsidian-pencil/releases).
2. In your vault, create a folder `.obsidian/plugins/obsidian-pencil/`.
3. Copy the three files into that folder.
4. Open **Settings → Community plugins** in Obsidian, reload the plugin list, and enable **Pencil**.

> Pencil works on desktop, iPad, and mobile. No internet connection or sync service is required — every whiteboard is just a `.pencil` file in your vault.

## Usage

1. **Create a whiteboard** — click the pencil icon in the left ribbon, or run the **Create new whiteboard** command from the command palette. A `Whiteboard.pencil` file is created in your active folder and opened immediately.
2. **Draw** — pick the **Pencil** tool (`P`), choose a color and size from the toolbar, and draw with a stylus, mouse, or finger. Pen input gets pressure-thickness variation (toggle it from the toolbar).
3. **Pan & zoom** — scroll to pan, `⌘/Ctrl` + scroll (or two-finger pinch) to zoom. Use **Fit** to frame everything, **Reset view** to return to 100%.
4. **Erase** — select the **Eraser** (`E`) and drag over strokes to delete them.
5. **Select & move** — pick **Select** (`V`), drag a box around strokes, then drag the selection to a new spot. Press `Delete`/`Backspace` to remove it.
6. **Colors** — use the built-in palette, or click **+** to add a custom color via the native picker. Long-press (or right-click) a custom swatch to remove it.
7. **Undo / redo** — `⌘/Ctrl+Z` to undo, `⌘/Ctrl+Shift+Z` (or `⌘/Ctrl+Y`) to redo.

Everything you draw is saved automatically to the `.pencil` file, including your current view position.

## Notes

- Pressure sensitivity is on by default for pen input. Turn it off from the toolbar if you want uniform strokes.
- `.pencil` files are plain JSON, so they're diffable, sync-friendly, and inspectable.

## Author

Anand Ramanathan (rcanand) — [rcanand.com](https://rcanand.com) · [@rcanand on X](https://x.com/rcanand)

More from rcanand:
- [Maibook](https://maibook.app) — a local-first desktop app for personalized AI agents.
- [maiweb](https://maiweb.up.railway.app) — a highly customizable feed of the public web.
- [ollamadash](https://ollamadash.up.railway.app) — Comparing the latest AI models.

If Pencil is useful to you, [buy me a coffee on Ko-fi](https://ko-fi.com/rcanand).
