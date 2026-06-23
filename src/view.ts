import { Platform, TextFileView, WorkspaceLeaf, setIcon, Notice } from "obsidian";
import {
	EMPTY_DATA,
	Point,
	Stroke,
	WhiteboardData,
	parseData,
	serializeData,
} from "./types";
import { ICON } from "./icons";
import type PencilPlugin from "./main";

export const VIEW_TYPE_PENCIL = "pencil-whiteboard";

type Tool = "pencil" | "eraser" | "select" | "pan";

interface ViewTransform {
	x: number;
	y: number;
	scale: number;
}

interface ActivePointer {
	id: number;
	type: string;
	clientX: number;
	clientY: number;
	stroke?: Stroke;
}

interface Bounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

const BUILTIN_COLORS = [
	"#ffffff",
	"#f1f1f1",
	"#ffd166",
	"#ef476f",
	"#06d6a0",
	"#118ab2",
	"#c77dff",
	"#222222",
];

const SIZES = [1.5, 3, 6, 12];

const MIN_SCALE = 0.05;
const MAX_SCALE = 20;

function uid(): string {
	return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function strokeBounds(stroke: Stroke): Bounds {
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	const pad = stroke.size;
	for (const p of stroke.points) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
	const dx = bx - ax;
	const dy = by - ay;
	const len2 = dx * dx + dy * dy;
	let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
	if (t < 0) t = 0;
	else if (t > 1) t = 1;
	const cx = ax + t * dx;
	const cy = ay + t * dy;
	const ex = px - cx;
	const ey = py - cy;
	return Math.sqrt(ex * ex + ey * ey);
}

function strokeHit(stroke: Stroke, x: number, y: number, radius: number): boolean {
	const r = radius + stroke.size;
	const b = strokeBounds(stroke);
	if (x < b.minX - r || x > b.maxX + r || y < b.minY - r || y > b.maxY + r) return false;
	const pts = stroke.points;
	if (pts.length === 1) {
		const dx = pts[0].x - x;
		const dy = pts[0].y - y;
		return dx * dx + dy * dy <= r * r;
	}
	for (let i = 1; i < pts.length; i++) {
		if (distToSegment(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= r) return true;
	}
	return false;
}

function rectIntersectsBounds(r: Bounds, b: Bounds): boolean {
	return !(r.maxX < b.minX || r.minX > b.maxX || r.maxY < b.minY || r.minY > b.maxY);
}

export class PencilWhiteboardView extends TextFileView {
	private boardData: WhiteboardData = { ...EMPTY_DATA };

	private canvas!: HTMLCanvasElement;
	private overlay!: HTMLCanvasElement;
	private container!: HTMLDivElement;
	private toolbar!: HTMLDivElement;
	private statusEl!: HTMLDivElement;

	private view: ViewTransform = { x: 0, y: 0, scale: 1 };

	private tool: Tool = "pencil";
	private color: string = BUILTIN_COLORS[0];
	private size: number = SIZES[1];
	private eraseRadius: number = 8;

	private pointers: Map<number, ActivePointer> = new Map();
	private penActive: boolean = false;
	/** Once a pen has been used in this view, finger touches default to pan
	 * (Apple Pencil convention). Until then, single-finger touches draw. */
	private penSeen: boolean = false;
	/** Set once a pressure-capable pen pointer is observed. The pressure
	 * toggle stays disabled until then (mouse-only devices never set it). */
	private pressureAvailable: boolean = false;
	private pressureBtn: HTMLButtonElement | null = null;

	private pinch: null | {
		ids: [number, number];
		startDist: number;
		startScale: number;
		startMidWorld: { x: number; y: number };
	} = null;

	private panStart: null | {
		viewX: number;
		viewY: number;
		clientX: number;
		clientY: number;
	} = null;

	private selectionBox: null | { x0: number; y0: number; x1: number; y1: number } = null;
	private selectedIds: Set<string> = new Set();
	private selectionDrag: null | {
		startClientX: number;
		startClientY: number;
		lastClientX: number;
		lastClientY: number;
		originalPoints: Map<string, Point[]>;
	} = null;

	private undoStack: WhiteboardData[] = [];
	private redoStack: WhiteboardData[] = [];

	private resizeObserver: ResizeObserver | null = null;
	private renderRequested: boolean = false;
	private dpr: number = 1;

	private onWindowKeyDown: (e: KeyboardEvent) => void = () => {};

	private readonly plugin: PencilPlugin;
	private colorPickerInput: HTMLInputElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: PencilPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	private allColors(): string[] {
		return [...BUILTIN_COLORS, ...this.plugin.settings.customColors];
	}

	getViewType(): string {
		return VIEW_TYPE_PENCIL;
	}

	getDisplayText(): string {
		return this.file ? this.file.basename : "Whiteboard";
	}

	getIcon(): string {
		return ICON.pencil;
	}

	getViewData(): string {
		return serializeData(this.boardData);
	}

	setViewData(data: string, _clear: boolean): void {
		this.boardData = parseData(data);
		this.undoStack = [];
		this.redoStack = [];
		this.selectedIds.clear();
		if (this.boardData.view) {
			this.view = { ...this.boardData.view };
		} else {
			this.view = { x: 0, y: 0, scale: 1 };
		}
		this.scheduleRender();
	}

	clear(): void {
		this.boardData = { ...EMPTY_DATA };
		this.undoStack = [];
		this.redoStack = [];
		this.selectedIds.clear();
		this.scheduleRender();
	}

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("pencil-root");

		this.toolbar = root.createDiv({ cls: "pencil-toolbar" });
		this.container = root.createDiv({ cls: "pencil-canvas-wrap" });
		this.canvas = this.container.createEl("canvas", { cls: "pencil-canvas" });
		this.overlay = this.container.createEl("canvas", { cls: "pencil-canvas pencil-overlay" });
		this.statusEl = root.createDiv({ cls: "pencil-status" });

		this.buildToolbar();
		this.attachPointerHandlers();

		this.onWindowKeyDown = (e: KeyboardEvent) => this.handleKey(e);
		window.addEventListener("keydown", this.onWindowKeyDown);

		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(this.container);
		this.resize();
	}

	async onClose(): Promise<void> {
		window.removeEventListener("keydown", this.onWindowKeyDown);
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
		this.contentEl.empty();
	}

	private buildToolbar(): void {
		const tb = this.toolbar;
		tb.empty();

		// Obsidian Mobile (iOS/Android) bundles an older, incomplete Lucide set
		// and does not reliably render plugin-registered custom SVG icons, so
		// toolbar buttons come up blank there. On mobile we render short text
		// labels instead; desktop keeps the icons.
		const useText = Platform.isMobile;

		const makeBtn = (
			label: string,
			shortLabel: string,
			icon: string,
			onClick: () => void,
			isActive?: () => boolean,
		): HTMLButtonElement => {
			const btn = tb.createEl("button", {
				cls: useText ? "pencil-btn pencil-btn-text" : "pencil-btn",
				attr: { "aria-label": label, title: label },
			});
			if (useText) {
				btn.setText(shortLabel);
			} else {
				setIcon(btn, icon);
			}
			btn.addEventListener("click", (e) => {
				e.preventDefault();
				onClick();
				this.refreshToolbarState();
			});
			if (isActive) btn.dataset.activeCheck = "1";
			(btn as any).__isActive = isActive;
			return btn;
		};

		makeBtn("Pencil", "Pen", ICON.pencil, () => (this.tool = "pencil"), () => this.tool === "pencil");
		makeBtn("Eraser", "Erase", ICON.eraser, () => (this.tool = "eraser"), () => this.tool === "eraser");
		makeBtn("Select", "Select", ICON.select, () => (this.tool = "select"), () => this.tool === "select");
		makeBtn("Pan", "Pan", ICON.hand, () => (this.tool = "pan"), () => this.tool === "pan");

		tb.createDiv({ cls: "pencil-sep" });

		const builtinCount = BUILTIN_COLORS.length;
		const palette = this.allColors();
		for (let i = 0; i < palette.length; i++) {
			const c = palette[i];
			const isCustom = i >= builtinCount;
			const sw = tb.createDiv({
				cls: isCustom ? "pencil-swatch pencil-swatch-custom" : "pencil-swatch",
				attr: {
					"aria-label": `Color ${c}`,
					title: isCustom ? `${c} (long-press to remove)` : c,
				},
			});
			sw.style.backgroundColor = c;
			sw.addEventListener("click", (e) => {
				e.preventDefault();
				this.color = c;
				this.refreshToolbarState();
			});
			if (isCustom) this.attachLongPressRemove(sw, c);
			(sw as any).__isActive = () => this.color === c;
		}

		const addBtn = tb.createDiv({
			cls: "pencil-swatch pencil-swatch-add",
			attr: { "aria-label": "Add color", title: "Add custom color" },
		});
		addBtn.setText("+");
		addBtn.addEventListener("click", (e) => {
			e.preventDefault();
			this.openColorPicker();
		});

		tb.createDiv({ cls: "pencil-sep" });

		for (const s of SIZES) {
			const sw = tb.createDiv({ cls: "pencil-size", attr: { "aria-label": `Size ${s}`, title: `Size ${s}` } });
			const dot = sw.createDiv({ cls: "pencil-size-dot" });
			const px = Math.max(2, Math.min(20, s * 2));
			dot.style.width = `${px}px`;
			dot.style.height = `${px}px`;
			sw.addEventListener("click", (e) => {
				e.preventDefault();
				this.size = s;
				this.refreshToolbarState();
			});
			(sw as any).__isActive = () => this.size === s;
		}

		this.pressureBtn = makeBtn(
			"Pressure (pen thickness)",
			"Pressure",
			ICON.pressure,
			() => this.togglePressure(),
			() => this.pressureAvailable && this.plugin.settings.pressureEnabled,
		);

		tb.createDiv({ cls: "pencil-sep" });

		makeBtn("Undo", "Undo", ICON.undo, () => this.undo());
		makeBtn("Redo", "Redo", ICON.redo, () => this.redo());

		tb.createDiv({ cls: "pencil-sep" });

		makeBtn("Zoom in", "+", ICON.zoomIn, () => this.zoomAtCenter(1.2));
		makeBtn("Zoom out", "−", ICON.zoomOut, () => this.zoomAtCenter(1 / 1.2));
		makeBtn("Fit", "Fit", ICON.fit, () => this.zoomToFit());
		makeBtn("Reset view", "Reset", ICON.reset, () => this.resetView());

		tb.createDiv({ cls: "pencil-sep" });

		makeBtn("Delete selection", "Del", ICON.trash, () => this.deleteSelection());
		makeBtn("Clear all", "Clear", ICON.clear, () => this.clearAllPrompt());

		this.refreshToolbarState();
	}

	private openColorPicker(): void {
		// Reuse one hidden <input type="color">. Native picker works on
		// desktop, iOS (WKWebView), and Android.
		if (!this.colorPickerInput) {
			const input = this.contentEl.createEl("input", { type: "color" });
			input.addClass("pencil-color-input");
			input.value = "#5b9dff";
			input.addEventListener("change", () => {
				const value = input.value;
				if (value) this.addCustomColor(value);
			});
			this.colorPickerInput = input;
		}
		this.colorPickerInput.value = this.color || "#5b9dff";
		this.colorPickerInput.click();
	}

	private async addCustomColor(hex: string): Promise<void> {
		const normalized = hex.toLowerCase();
		const all = this.allColors().map((c) => c.toLowerCase());
		if (!all.includes(normalized)) {
			this.plugin.settings.customColors.push(normalized);
			await this.plugin.saveSettings();
		}
		this.color = normalized;
		this.buildToolbar();
	}

	private async removeCustomColor(hex: string): Promise<void> {
		const normalized = hex.toLowerCase();
		const list = this.plugin.settings.customColors;
		const idx = list.findIndex((c) => c.toLowerCase() === normalized);
		if (idx === -1) return;
		list.splice(idx, 1);
		await this.plugin.saveSettings();
		if (this.color.toLowerCase() === normalized) this.color = BUILTIN_COLORS[0];
		this.buildToolbar();
	}

	private attachLongPressRemove(el: HTMLElement, hex: string): void {
		let timer: number | null = null;
		let fired = false;
		const clear = () => {
			if (timer !== null) {
				window.clearTimeout(timer);
				timer = null;
			}
		};
		el.addEventListener("pointerdown", (e) => {
			if (e.button !== undefined && e.button !== 0) return;
			fired = false;
			clear();
			timer = window.setTimeout(() => {
				fired = true;
				timer = null;
				if (confirm(`Remove color ${hex} from the palette?`)) {
					void this.removeCustomColor(hex);
				}
			}, 600);
		});
		el.addEventListener("pointerup", clear);
		el.addEventListener("pointerleave", clear);
		el.addEventListener("pointercancel", clear);
		// Right-click on desktop is a quick alternative to long-press.
		el.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			if (confirm(`Remove color ${hex} from the palette?`)) {
				void this.removeCustomColor(hex);
			}
		});
		// Swallow the click that follows a successful long-press so the color
		// isn't also selected.
		el.addEventListener(
			"click",
			(e) => {
				if (fired) {
					e.preventDefault();
					e.stopImmediatePropagation();
					fired = false;
				}
			},
			true,
		);
	}

	private togglePressure(): void {
		if (!this.pressureAvailable) return;
		this.plugin.settings.pressureEnabled = !this.plugin.settings.pressureEnabled;
		void this.plugin.saveSettings();
		this.refreshToolbarState();
	}

	private refreshToolbarState(): void {
		const els = this.toolbar.querySelectorAll<HTMLElement>("button, .pencil-swatch, .pencil-size");
		els.forEach((el) => {
			const check = (el as any).__isActive as (() => boolean) | undefined;
			if (check) el.toggleClass("is-active", check());
		});
		if (this.pressureBtn) {
			this.pressureBtn.disabled = !this.pressureAvailable;
			this.pressureBtn.toggleClass("is-disabled", !this.pressureAvailable);
			this.pressureBtn.setAttr(
				"title",
				this.pressureAvailable
					? this.plugin.settings.pressureEnabled
						? "Pressure thickness: on (tap to turn off)"
						: "Pressure thickness: off (tap to turn on)"
					: "Pressure thickness: unavailable (no pen detected)",
			);
		}
	}

	private resize(): void {
		const rect = this.container.getBoundingClientRect();
		this.dpr = window.devicePixelRatio || 1;
		for (const c of [this.canvas, this.overlay]) {
			c.width = Math.max(1, Math.floor(rect.width * this.dpr));
			c.height = Math.max(1, Math.floor(rect.height * this.dpr));
			c.style.width = `${rect.width}px`;
			c.style.height = `${rect.height}px`;
		}
		this.scheduleRender();
	}

	private scheduleRender(): void {
		if (this.renderRequested) return;
		this.renderRequested = true;
		requestAnimationFrame(() => {
			this.renderRequested = false;
			this.render();
		});
	}

	private screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
		const rect = this.container.getBoundingClientRect();
		const sx = clientX - rect.left;
		const sy = clientY - rect.top;
		return {
			x: (sx - this.view.x) / this.view.scale,
			y: (sy - this.view.y) / this.view.scale,
		};
	}

	private render(): void {
		const ctx = this.canvas.getContext("2d");
		if (!ctx) return;
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = "#1a1a1a";
		ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		ctx.translate(this.view.x, this.view.y);
		ctx.scale(this.view.scale, this.view.scale);

		for (const stroke of this.boardData.strokes) {
			this.drawStroke(ctx, stroke, this.selectedIds.has(stroke.id));
		}

		ctx.restore();

		this.renderOverlay();
		this.updateStatus();
	}

	private drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, selected: boolean): void {
		const pts = stroke.points;
		if (pts.length === 0) return;
		ctx.strokeStyle = stroke.color;
		ctx.fillStyle = stroke.color;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";

		if (pts.length === 1) {
			const p = pts[0];
			const r = Math.max(0.5, stroke.size * (p.p ?? 0.5));
			ctx.beginPath();
			ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
			ctx.fill();
		} else {
			for (let i = 1; i < pts.length; i++) {
				const a = pts[i - 1];
				const b = pts[i];
				const pa = a.p ?? 0.5;
				const pb = b.p ?? 0.5;
				ctx.lineWidth = Math.max(0.5, stroke.size * (pa + pb));
				ctx.beginPath();
				ctx.moveTo(a.x, a.y);
				ctx.lineTo(b.x, b.y);
				ctx.stroke();
			}
		}

		if (selected) {
			const b = strokeBounds(stroke);
			ctx.save();
			ctx.lineWidth = 1 / this.view.scale;
			ctx.strokeStyle = "#5b9dff";
			ctx.setLineDash([4 / this.view.scale, 4 / this.view.scale]);
			ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
			ctx.restore();
		}
	}

	private renderOverlay(): void {
		const ctx = this.overlay.getContext("2d");
		if (!ctx) return;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

		if (this.selectionBox) {
			const { x0, y0, x1, y1 } = this.selectionBox;
			const x = Math.min(x0, x1);
			const y = Math.min(y0, y1);
			const w = Math.abs(x1 - x0);
			const h = Math.abs(y1 - y0);
			ctx.save();
			ctx.fillStyle = "rgba(91,157,255,0.12)";
			ctx.strokeStyle = "rgba(91,157,255,0.8)";
			ctx.lineWidth = 1;
			ctx.setLineDash([4, 4]);
			ctx.fillRect(x, y, w, h);
			ctx.strokeRect(x, y, w, h);
			ctx.restore();
		}
	}

	private updateStatus(): void {
		const zoom = Math.round(this.view.scale * 100);
		const sel = this.selectedIds.size;
		const parts = [`${this.boardData.strokes.length} strokes`, `${zoom}%`];
		if (sel > 0) parts.push(`${sel} selected`);
		this.statusEl.setText(parts.join("  ·  "));
	}

	private attachPointerHandlers(): void {
		const el = this.container;
		el.style.touchAction = "none";

		el.addEventListener("pointerdown", (e) => this.onPointerDown(e));
		el.addEventListener("pointermove", (e) => this.onPointerMove(e));
		el.addEventListener("pointerup", (e) => this.onPointerUp(e));
		el.addEventListener("pointercancel", (e) => this.onPointerUp(e));
		el.addEventListener("pointerleave", (e) => this.onPointerUp(e));

		el.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
		el.addEventListener("contextmenu", (e) => e.preventDefault());
	}

	private isPenLikeForDrawing(e: PointerEvent): boolean {
		if (e.pointerType === "pen") return true;
		if (e.pointerType === "mouse" && e.button === 0) return true;
		return false;
	}

	private onPointerDown(e: PointerEvent): void {
		(e.target as Element).setPointerCapture?.(e.pointerId);

		const isPen = e.pointerType === "pen";
		const isTouch = e.pointerType === "touch";

		if (isPen) {
			this.penActive = true;
			this.penSeen = true;
			// A pen reports real pressure, so the pressure toggle is meaningful.
			// Enable it the first time we see one.
			if (!this.pressureAvailable) {
				this.pressureAvailable = true;
				this.refreshToolbarState();
			}
			// Pen takes over: abandon any finger pan/pinch/stroke in progress.
			this.panStart = null;
			this.pinch = null;
			this.cancelInProgressStroke();
		}

		this.pointers.set(e.pointerId, {
			id: e.pointerId,
			type: e.pointerType,
			clientX: e.clientX,
			clientY: e.clientY,
		});

		if (isTouch) {
			const touches = [...this.pointers.values()].filter((p) => p.type === "touch");
			if (this.penActive) {
				// Apple Pencil is active; ignore finger touches (palm rejection).
				return;
			}
			if (touches.length >= 2) {
				this.beginPinch(touches[0], touches[1]);
				this.cancelInProgressStroke();
				return;
			}
			// Single finger: pan in Apple-Pencil mode or when Pan tool is selected,
			// otherwise treat it as the drawing device.
			if (this.penSeen || this.tool === "pan") {
				this.beginPan(e);
				return;
			}
		}

		if (e.pointerType === "mouse" && (e.button === 1 || e.button === 2)) {
			this.beginPan(e);
			return;
		}

		if (this.tool === "pan") {
			this.beginPan(e);
			return;
		}

		if (!this.isPenLikeForDrawing(e) && !isTouch) return;

		const world = this.screenToWorld(e.clientX, e.clientY);

		if (this.tool === "pencil") {
			this.beginStroke(e, world);
		} else if (this.tool === "eraser") {
			this.pushUndoSnapshot();
			this.eraseAt(world.x, world.y);
		} else if (this.tool === "select") {
			this.beginSelection(e, world);
		}
	}

	private onPointerMove(e: PointerEvent): void {
		const prev = this.pointers.get(e.pointerId);
		if (!prev) return;
		prev.clientX = e.clientX;
		prev.clientY = e.clientY;

		if (this.pinch && (e.pointerId === this.pinch.ids[0] || e.pointerId === this.pinch.ids[1])) {
			this.updatePinch();
			return;
		}

		if (this.panStart) {
			const dx = e.clientX - this.panStart.clientX;
			const dy = e.clientY - this.panStart.clientY;
			this.view.x = this.panStart.viewX + dx;
			this.view.y = this.panStart.viewY + dy;
			this.scheduleRender();
			return;
		}

		const world = this.screenToWorld(e.clientX, e.clientY);

		if (prev.stroke) {
			this.extendStroke(prev.stroke, world, e);
			this.scheduleRender();
			return;
		}

		if (this.tool === "eraser" && e.buttons !== 0) {
			this.eraseAt(world.x, world.y);
			return;
		}

		if (this.selectionDrag) {
			this.continueSelectionDrag(e);
			return;
		}

		if (this.selectionBox && e.buttons !== 0) {
			this.selectionBox.x1 = world.x;
			this.selectionBox.y1 = world.y;
			this.scheduleRender();
		}
	}

	private onPointerUp(e: PointerEvent): void {
		const p = this.pointers.get(e.pointerId);
		if (!p) return;

		if (p.stroke) {
			this.finishStroke(p.stroke);
		}

		this.pointers.delete(e.pointerId);

		if (e.pointerType === "pen") {
			// Pen lifted; if no other pen, mark inactive.
			const anyPen = [...this.pointers.values()].some((pp) => pp.type === "pen");
			if (!anyPen) this.penActive = false;
		}

		if (this.pinch) {
			const a = this.pointers.get(this.pinch.ids[0]);
			const b = this.pointers.get(this.pinch.ids[1]);
			if (!a || !b) this.pinch = null;
		}

		if (this.panStart && this.pointers.size === 0) {
			this.panStart = null;
		}

		if (this.selectionBox && e.buttons === 0) {
			this.commitSelectionBox();
		}

		if (this.selectionDrag && this.pointers.size === 0) {
			this.selectionDrag = null;
			this.scheduleSave();
		}
	}

	private beginPan(e: PointerEvent): void {
		this.panStart = {
			viewX: this.view.x,
			viewY: this.view.y,
			clientX: e.clientX,
			clientY: e.clientY,
		};
	}

	private beginPinch(a: ActivePointer, b: ActivePointer): void {
		const dx = a.clientX - b.clientX;
		const dy = a.clientY - b.clientY;
		const dist = Math.hypot(dx, dy);
		const rect = this.container.getBoundingClientRect();
		const midClient = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
		const midScreen = { x: midClient.x - rect.left, y: midClient.y - rect.top };
		const midWorld = {
			x: (midScreen.x - this.view.x) / this.view.scale,
			y: (midScreen.y - this.view.y) / this.view.scale,
		};
		this.pinch = {
			ids: [a.id, b.id],
			startDist: Math.max(1, dist),
			startScale: this.view.scale,
			startMidWorld: midWorld,
		};
		this.panStart = null;
	}

	private updatePinch(): void {
		if (!this.pinch) return;
		const a = this.pointers.get(this.pinch.ids[0]);
		const b = this.pointers.get(this.pinch.ids[1]);
		if (!a || !b) return;
		const dx = a.clientX - b.clientX;
		const dy = a.clientY - b.clientY;
		const dist = Math.max(1, Math.hypot(dx, dy));
		const ratio = dist / this.pinch.startDist;
		const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.pinch.startScale * ratio));
		const rect = this.container.getBoundingClientRect();
		const midScreen = {
			x: (a.clientX + b.clientX) / 2 - rect.left,
			y: (a.clientY + b.clientY) / 2 - rect.top,
		};
		this.view.scale = newScale;
		this.view.x = midScreen.x - this.pinch.startMidWorld.x * newScale;
		this.view.y = midScreen.y - this.pinch.startMidWorld.y * newScale;
		this.scheduleRender();
	}

	private onWheel(e: WheelEvent): void {
		e.preventDefault();
		if (e.ctrlKey || e.metaKey) {
			const factor = Math.exp(-e.deltaY * 0.002);
			this.zoomAtClient(e.clientX, e.clientY, factor);
		} else {
			this.view.x -= e.deltaX;
			this.view.y -= e.deltaY;
			this.scheduleRender();
		}
	}

	private zoomAtClient(clientX: number, clientY: number, factor: number): void {
		const rect = this.container.getBoundingClientRect();
		const sx = clientX - rect.left;
		const sy = clientY - rect.top;
		const wx = (sx - this.view.x) / this.view.scale;
		const wy = (sy - this.view.y) / this.view.scale;
		const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.view.scale * factor));
		this.view.scale = newScale;
		this.view.x = sx - wx * newScale;
		this.view.y = sy - wy * newScale;
		this.scheduleRender();
	}

	private zoomAtCenter(factor: number): void {
		const rect = this.container.getBoundingClientRect();
		this.zoomAtClient(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
	}

	private zoomToFit(): void {
		if (this.boardData.strokes.length === 0) {
			this.resetView();
			return;
		}
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		for (const s of this.boardData.strokes) {
			const b = strokeBounds(s);
			if (b.minX < minX) minX = b.minX;
			if (b.minY < minY) minY = b.minY;
			if (b.maxX > maxX) maxX = b.maxX;
			if (b.maxY > maxY) maxY = b.maxY;
		}
		const w = maxX - minX;
		const h = maxY - minY;
		const rect = this.container.getBoundingClientRect();
		const pad = 40;
		const scale = Math.max(
			MIN_SCALE,
			Math.min(MAX_SCALE, Math.min((rect.width - pad * 2) / Math.max(w, 1), (rect.height - pad * 2) / Math.max(h, 1))),
		);
		this.view.scale = scale;
		this.view.x = rect.width / 2 - ((minX + maxX) / 2) * scale;
		this.view.y = rect.height / 2 - ((minY + maxY) / 2) * scale;
		this.scheduleRender();
	}

	private resetView(): void {
		this.view = { x: 0, y: 0, scale: 1 };
		this.scheduleRender();
	}

	private beginStroke(e: PointerEvent, world: { x: number; y: number }): void {
		this.pushUndoSnapshot();
		const stroke: Stroke = {
			id: uid(),
			color: this.color,
			size: this.size,
			points: [{ x: world.x, y: world.y, p: this.pressureFor(e) }],
		};
		this.boardData.strokes.push(stroke);
		const p = this.pointers.get(e.pointerId);
		if (p) p.stroke = stroke;
		this.scheduleRender();
	}

	private extendStroke(stroke: Stroke, world: { x: number; y: number }, e: PointerEvent): void {
		const last = stroke.points[stroke.points.length - 1];
		const dx = world.x - last.x;
		const dy = world.y - last.y;
		if (dx * dx + dy * dy < 0.25 / (this.view.scale * this.view.scale)) return;
		stroke.points.push({ x: world.x, y: world.y, p: this.pressureFor(e) });
	}

	private finishStroke(stroke: Stroke): void {
		if (stroke.points.length === 0) {
			this.boardData.strokes = this.boardData.strokes.filter((s) => s !== stroke);
		}
		this.scheduleSave();
	}

	private cancelInProgressStroke(): void {
		let changed = false;
		for (const p of this.pointers.values()) {
			if (p.stroke) {
				this.boardData.strokes = this.boardData.strokes.filter((s) => s !== p.stroke);
				p.stroke = undefined;
				changed = true;
			}
		}
		if (changed) {
			// drop the most recent undo snapshot we'd have created for the cancelled stroke
			if (this.undoStack.length > 0) this.undoStack.pop();
			this.scheduleRender();
		}
	}

	private pressureFor(e: PointerEvent): number {
		// 0.5 yields constant (nominal) thickness. Only vary by pressure for a
		// pen when the user has the pressure effect enabled.
		if (e.pointerType === "pen" && this.plugin.settings.pressureEnabled) {
			// Some browsers report 0 pressure for hover events; clamp away from 0.
			return Math.max(0.05, Math.min(1, e.pressure || 0.5));
		}
		return 0.5;
	}

	private eraseAt(x: number, y: number): void {
		const r = this.eraseRadius / this.view.scale;
		const before = this.boardData.strokes.length;
		this.boardData.strokes = this.boardData.strokes.filter((s) => !strokeHit(s, x, y, r));
		if (this.boardData.strokes.length !== before) {
			this.scheduleRender();
			this.scheduleSave();
		}
	}

	private beginSelection(e: PointerEvent, world: { x: number; y: number }): void {
		// Click on an already-selected stroke: start dragging the selection.
		const r = 4 / this.view.scale;
		const hit = this.boardData.strokes.find((s) => strokeHit(s, world.x, world.y, r));
		if (hit && this.selectedIds.has(hit.id)) {
			this.beginSelectionDrag(e);
			return;
		}
		if (hit) {
			this.selectedIds.clear();
			this.selectedIds.add(hit.id);
			this.beginSelectionDrag(e);
			this.scheduleRender();
			return;
		}
		this.selectedIds.clear();
		this.selectionBox = { x0: world.x, y0: world.y, x1: world.x, y1: world.y };
		this.scheduleRender();
	}

	private commitSelectionBox(): void {
		if (!this.selectionBox) return;
		const { x0, y0, x1, y1 } = this.selectionBox;
		const box: Bounds = {
			minX: Math.min(x0, x1),
			minY: Math.min(y0, y1),
			maxX: Math.max(x0, x1),
			maxY: Math.max(y0, y1),
		};
		this.selectedIds.clear();
		if (box.maxX - box.minX > 2 && box.maxY - box.minY > 2) {
			for (const s of this.boardData.strokes) {
				if (rectIntersectsBounds(box, strokeBounds(s))) this.selectedIds.add(s.id);
			}
		}
		this.selectionBox = null;
		this.scheduleRender();
	}

	private beginSelectionDrag(e: PointerEvent): void {
		const originalPoints = new Map<string, Point[]>();
		for (const s of this.boardData.strokes) {
			if (this.selectedIds.has(s.id)) {
				originalPoints.set(
					s.id,
					s.points.map((p) => ({ x: p.x, y: p.y, p: p.p })),
				);
			}
		}
		this.pushUndoSnapshot();
		this.selectionDrag = {
			startClientX: e.clientX,
			startClientY: e.clientY,
			lastClientX: e.clientX,
			lastClientY: e.clientY,
			originalPoints,
		};
	}

	private continueSelectionDrag(e: PointerEvent): void {
		if (!this.selectionDrag) return;
		const dx = (e.clientX - this.selectionDrag.startClientX) / this.view.scale;
		const dy = (e.clientY - this.selectionDrag.startClientY) / this.view.scale;
		for (const s of this.boardData.strokes) {
			const orig = this.selectionDrag.originalPoints.get(s.id);
			if (!orig) continue;
			for (let i = 0; i < s.points.length; i++) {
				s.points[i].x = orig[i].x + dx;
				s.points[i].y = orig[i].y + dy;
			}
		}
		this.selectionDrag.lastClientX = e.clientX;
		this.selectionDrag.lastClientY = e.clientY;
		this.scheduleRender();
	}

	private deleteSelection(): void {
		if (this.selectedIds.size === 0) return;
		this.pushUndoSnapshot();
		this.boardData.strokes = this.boardData.strokes.filter((s) => !this.selectedIds.has(s.id));
		this.selectedIds.clear();
		this.scheduleRender();
		this.scheduleSave();
	}

	private clearAllPrompt(): void {
		if (this.boardData.strokes.length === 0) return;
		if (!confirm("Clear the entire whiteboard?")) return;
		this.pushUndoSnapshot();
		this.boardData.strokes = [];
		this.selectedIds.clear();
		this.scheduleRender();
		this.scheduleSave();
	}

	private handleKey(e: KeyboardEvent): void {
		if (!this.isActiveLeaf()) return;
		if (this.isEditableTarget(e.target)) return;
		const mod = e.metaKey || e.ctrlKey;
		if (mod && !e.shiftKey && e.key.toLowerCase() === "z") {
			e.preventDefault();
			this.undo();
		} else if (mod && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
			e.preventDefault();
			this.redo();
		} else if (!mod && (e.key === "Delete" || e.key === "Backspace") && this.selectedIds.size > 0) {
			e.preventDefault();
			this.deleteSelection();
		} else if (!mod && e.key.toLowerCase() === "p") {
			this.tool = "pencil";
			this.refreshToolbarState();
		} else if (!mod && e.key.toLowerCase() === "e") {
			this.tool = "eraser";
			this.refreshToolbarState();
		} else if (!mod && e.key.toLowerCase() === "v") {
			this.tool = "select";
			this.refreshToolbarState();
		} else if (!mod && e.key.toLowerCase() === "h") {
			this.tool = "pan";
			this.refreshToolbarState();
		}
	}

	private isActiveLeaf(): boolean {
		return this.app.workspace.getActiveViewOfType(PencilWhiteboardView) === this;
	}

	private isEditableTarget(target: EventTarget | null): boolean {
		const el = target as HTMLElement | null;
		if (!el) return false;
		const tag = el.tagName;
		if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
		if (el.isContentEditable) return true;
		return false;
	}

	private pushUndoSnapshot(): void {
		this.undoStack.push(this.cloneData());
		if (this.undoStack.length > 200) this.undoStack.shift();
		this.redoStack = [];
	}

	private cloneData(): WhiteboardData {
		return JSON.parse(JSON.stringify(this.boardData));
	}

	private undo(): void {
		const prev = this.undoStack.pop();
		if (!prev) return;
		this.redoStack.push(this.cloneData());
		this.boardData = prev;
		this.selectedIds.clear();
		this.scheduleRender();
		this.scheduleSave();
	}

	private redo(): void {
		const next = this.redoStack.pop();
		if (!next) return;
		this.undoStack.push(this.cloneData());
		this.boardData = next;
		this.selectedIds.clear();
		this.scheduleRender();
		this.scheduleSave();
	}

	private scheduleSave(): void {
		this.boardData.view = { ...this.view };
		try {
			// TextFileView.requestSave is a debounced property that picks up
			// getViewData() and writes it to the backing file.
			this.requestSave();
		} catch (e) {
			console.error("Pencil: failed to save", e);
			new Notice("Pencil: failed to save whiteboard");
		}
	}
}
