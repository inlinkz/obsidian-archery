import { Plugin } from 'obsidian';
import { ARCHERY_EXTENSION, createScorecardFile } from './services/markdownSync';
import {
	ArcherySettingTab,
	DEFAULT_SETTINGS,
	normalizeSettings,
	type ArcheryPluginSettings,
} from './settings';
import { ScorecardView, VIEW_TYPE_SCORECARD } from './views/ScorecardView';

export default class ArcheryPlugin extends Plugin {
	settings: ArcheryPluginSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_SCORECARD,
			(leaf) => new ScorecardView(leaf),
		);

		this.registerExtensions([ARCHERY_EXTENSION], VIEW_TYPE_SCORECARD);

		this.addSettingTab(new ArcherySettingTab(this.app, this));

		this.addRibbonIcon('target', 'New archery scorecard', () => {
			void this.createAndOpenScorecard();
		});

		this.addCommand({
			id: 'new-archery-scorecard',
			name: 'New archery scorecard',
			callback: () => {
				void this.createAndOpenScorecard();
			},
		});

		this.addCommand({
			id: 'reset-archery-scorecard',
			name: 'Reset archery scorecard',
			checkCallback: (checking) => {
				const view = this.getActiveScorecardView();
				if (!view) return false;
				if (!checking) {
					void view.resetSession();
				}
				return true;
			},
		});
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_SCORECARD);
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings({
			...DEFAULT_SETTINGS,
			...((await this.loadData()) as ArcheryPluginSettings | null),
		});
	}

	async saveSettings(): Promise<void> {
		this.settings = normalizeSettings(this.settings);
		await this.saveData(this.settings);
	}

	getActiveScorecardView(): ScorecardView | null {
		const leaf = this.app.workspace.getActiveViewOfType(ScorecardView);
		return leaf ?? null;
	}

	async createAndOpenScorecard(): Promise<void> {
		const file = await createScorecardFile(this.app, this.settings);
		if (!file) return;

		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
	}
}
