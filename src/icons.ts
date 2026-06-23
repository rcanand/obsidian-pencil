import { addIcon } from "obsidian";

/**
 * Lucide icon source data. Each entry is the inner SVG markup of the original
 * Lucide icon (24x24 coordinate space). We wrap them at registration time and
 * pass them to Obsidian's addIcon, which scales them to its expected 0 0 100
 * 100 viewBox. Bundling them ourselves avoids the bundled-Lucide version lag
 * on Obsidian Mobile where some names (e.g. lasso-select) aren't recognised.
 */
const LUCIDE_24: Record<string, string> = {
	"pencil-pencil": `
		<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
		<path d="m15 5 4 4" />
	`,
	"pencil-eraser": `
		<path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21" />
		<path d="m5.082 11.09 8.828 8.828" />
	`,
	"pencil-select": `
		<path d="M7 22a5 5 0 0 1-2-4" />
		<path d="M7 16.93c.96.43 1.96.74 2.99.91" />
		<path d="M3.34 14A6.8 6.8 0 0 1 2 10c0-4.42 4.48-8 10-8s10 3.58 10 8a7.19 7.19 0 0 1-.33 2" />
		<path d="M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
		<path d="M14.33 22h-.09a.35.35 0 0 1-.24-.32v-10a.34.34 0 0 1 .33-.34c.08 0 .15.03.21.08l7.34 6a.33.33 0 0 1-.21.59h-4.49l-2.57 3.85a.35.35 0 0 1-.28.14z" />
	`,
	"pencil-hand": `
		<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
		<path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
		<path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
		<path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
	`,
	"pencil-undo": `
		<path d="M9 14 L 4 9 l 5-5" />
		<path d="M4 9 h 10.5 a 5.5 5.5 0 0 1 5.5 5.5 a 5.5 5.5 0 0 1-5.5 5.5 H 11" />
	`,
	"pencil-redo": `
		<path d="m15 14 5-5-5-5" />
		<path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" />
	`,
	"pencil-zoom-in": `
		<circle cx="11" cy="11" r="8" />
		<line x1="21" x2="16.65" y1="21" y2="16.65" />
		<line x1="11" x2="11" y1="8" y2="14" />
		<line x1="8" x2="14" y1="11" y2="11" />
	`,
	"pencil-zoom-out": `
		<circle cx="11" cy="11" r="8" />
		<line x1="21" x2="16.65" y1="21" y2="16.65" />
		<line x1="8" x2="14" y1="11" y2="11" />
	`,
	"pencil-fit": `
		<path d="M15 3h6v6" />
		<path d="m21 3-7 7" />
		<path d="m3 21 7-7" />
		<path d="M9 21H3v-6" />
	`,
	"pencil-reset": `
		<line x1="2" x2="5" y1="12" y2="12" />
		<line x1="19" x2="22" y1="12" y2="12" />
		<line x1="12" x2="12" y1="2" y2="5" />
		<line x1="12" x2="12" y1="19" y2="22" />
		<circle cx="12" cy="12" r="7" />
		<circle cx="12" cy="12" r="3" />
	`,
	"pencil-trash": `
		<path d="M10 11v6" />
		<path d="M14 11v6" />
		<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
		<path d="M3 6h18" />
		<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
	`,
	"pencil-clear": `
		<circle cx="12" cy="12" r="10" />
		<path d="m15 9-6 6" />
		<path d="m9 9 6 6" />
	`,
	// Two strokes of differing weight: a glyph for pressure thickness variation.
	"pencil-pressure": `
		<line x1="4" y1="8" x2="20" y2="8" stroke-width="1" />
		<line x1="4" y1="13" x2="20" y2="13" stroke-width="2.5" />
		<line x1="4" y1="18" x2="20" y2="18" stroke-width="4.5" />
	`,
};

let registered = false;

/**
 * Register all toolbar icons. Safe to call multiple times.
 *
 * Obsidian's addIcon expects markup that fits a 0 0 100 100 viewBox. Lucide
 * icons are authored in a 24-unit grid, so we wrap them in a <g> that scales
 * by ~4.167 and applies Lucide's standard stroke style.
 */
export function registerIcons(): void {
	if (registered) return;
	registered = true;
	for (const [name, inner] of Object.entries(LUCIDE_24)) {
		const svg = `<g transform="scale(4.166667)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
		addIcon(name, svg);
	}
}

export const ICON = {
	pencil: "pencil-pencil",
	eraser: "pencil-eraser",
	select: "pencil-select",
	hand: "pencil-hand",
	undo: "pencil-undo",
	redo: "pencil-redo",
	zoomIn: "pencil-zoom-in",
	zoomOut: "pencil-zoom-out",
	fit: "pencil-fit",
	reset: "pencil-reset",
	trash: "pencil-trash",
	clear: "pencil-clear",
	pressure: "pencil-pressure",
} as const;
