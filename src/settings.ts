import { App, PluginSettingTab } from "obsidian";
import type PencilPlugin from "./main";

export class PencilSettingTab extends PluginSettingTab {
	plugin: PencilPlugin;

	constructor(app: App, plugin: PencilPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("pencil-settings");

		containerEl.createEl("h2", { text: "Pencil" });

		const intro = containerEl.createEl("p");
		intro.setText(
			"Infinite whiteboard for handwriting with Apple Pencil, finger, or mouse. " +
				"Notes are saved as .pencil files (JSON) in your vault.",
		);

		// Placeholder doc section. Fill in with usage notes, shortcuts, file
		// format details, troubleshooting, etc.
		containerEl.createEl("h3", { text: "Documentation" });
		const doc = containerEl.createEl("p");
		doc.setText("TODO: add usage notes, tool descriptions, and shortcuts here.");
	}
}
