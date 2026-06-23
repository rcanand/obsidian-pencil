import { Notice, Plugin, TFile, WorkspaceLeaf, normalizePath } from "obsidian";
import { PencilWhiteboardView, VIEW_TYPE_PENCIL } from "./view";
import { EMPTY_DATA, serializeData } from "./types";
import { ICON, registerIcons } from "./icons";

const FILE_EXT = "pencil";

export interface PencilSettings {
	/** Hex colors the user has added to the palette via the picker. */
	customColors: string[];
	/** Whether pen pressure varies stroke thickness (when a pen is in use). */
	pressureEnabled: boolean;
}

const DEFAULT_SETTINGS: PencilSettings = {
	customColors: [],
	pressureEnabled: true,
};

export default class PencilPlugin extends Plugin {
	settings: PencilSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		registerIcons();
		await this.loadSettings();

		this.registerView(VIEW_TYPE_PENCIL, (leaf: WorkspaceLeaf) => new PencilWhiteboardView(leaf, this));
		this.registerExtensions([FILE_EXT], VIEW_TYPE_PENCIL);

		this.addRibbonIcon(ICON.pencil, "New whiteboard", async () => {
			await this.createAndOpenWhiteboard();
		});

		this.addCommand({
			id: "create-whiteboard",
			name: "Create new whiteboard",
			callback: async () => {
				await this.createAndOpenWhiteboard();
			},
		});
	}

	onunload(): void {
		// Obsidian detaches views automatically; nothing else to release.
	}

	private async createAndOpenWhiteboard(): Promise<void> {
		const folder = this.getActiveFolder();
		const base = "Whiteboard";
		const path = await this.uniquePath(folder, base);
		try {
			const file = await this.app.vault.create(path, serializeData({ ...EMPTY_DATA }));
			const leaf = this.app.workspace.getLeaf(true);
			await leaf.openFile(file);
		} catch (e) {
			console.error("Pencil: failed to create whiteboard", e);
			new Notice("Pencil: failed to create whiteboard");
		}
	}

	private getActiveFolder(): string {
		const active = this.app.workspace.getActiveFile();
		if (active && active.parent) return active.parent.path;
		return "";
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<PencilSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
		if (!Array.isArray(this.settings.customColors)) this.settings.customColors = [];
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private async uniquePath(folder: string, base: string): Promise<string> {
		const prefix = folder ? `${folder}/` : "";
		let candidate = normalizePath(`${prefix}${base}.${FILE_EXT}`);
		let i = 1;
		while (this.app.vault.getAbstractFileByPath(candidate) instanceof TFile) {
			candidate = normalizePath(`${prefix}${base} ${i}.${FILE_EXT}`);
			i += 1;
		}
		return candidate;
	}
}
