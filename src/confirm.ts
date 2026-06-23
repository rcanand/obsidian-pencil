import { App, Modal, Setting } from "obsidian";

/** A small async-friendly replacement for the blocking native `confirm()`. */
export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly message: string,
		private readonly onConfirm: () => void,
		private readonly confirmText = "Confirm",
		private readonly cancelText = "Cancel",
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("p", { text: this.message });
		new Setting(contentEl)
			.addButton((b) =>
				b.setButtonText(this.cancelText).onClick(() => this.close()),
			)
			.addButton((b) =>
				b
					.setButtonText(this.confirmText)
					.setCta()
					.onClick(() => {
						this.onConfirm();
						this.close();
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
