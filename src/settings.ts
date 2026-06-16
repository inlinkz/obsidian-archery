import { App, PluginSettingTab, Setting } from 'obsidian';
import type ArcheryPlugin from './main';
import { DEFAULT_CONFIG, normalizeConfig } from './model/scorecard';

export interface ArcheryPluginSettings {
	defaultEnds: number;
	defaultArrows: number;
	defaultCards: number;
}

export const DEFAULT_SETTINGS: ArcheryPluginSettings = {
	defaultEnds: DEFAULT_CONFIG.endsPerCard,
	defaultArrows: DEFAULT_CONFIG.arrowsPerEnd,
	defaultCards: DEFAULT_CONFIG.cardsCount,
};

export function normalizeSettings(
	settings: ArcheryPluginSettings,
): ArcheryPluginSettings {
	const config = normalizeConfig({
		endsPerCard: settings.defaultEnds,
		arrowsPerEnd: settings.defaultArrows,
		cardsCount: settings.defaultCards,
	});
	return {
		defaultEnds: config.endsPerCard,
		defaultArrows: config.arrowsPerEnd,
		defaultCards: config.cardsCount,
	};
}

export class ArcherySettingTab extends PluginSettingTab {
	plugin: ArcheryPlugin;

	constructor(app: App, plugin: ArcheryPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Obsidian Archery' });
		containerEl.createEl('p', {
			text: 'Defaults used when creating a new .archery scorecard. Each file stores its own dimensions in the markup.',
			cls: 'setting-item-description',
		});

		new Setting(containerEl)
			.setName('Ends per scorecard')
			.setDesc('Number of ends (rows) on each scorecard table.')
			.addText((text) =>
				text
					.setPlaceholder(String(DEFAULT_CONFIG.endsPerCard))
					.setValue(String(this.plugin.settings.defaultEnds))
					.onChange(async (value) => {
						const parsed = Number.parseInt(value, 10);
						if (Number.isNaN(parsed)) return;
						this.plugin.settings.defaultEnds = parsed;
						this.plugin.settings = normalizeSettings(this.plugin.settings);
						await this.plugin.saveSettings();
						text.setValue(String(this.plugin.settings.defaultEnds));
					}),
			);

		new Setting(containerEl)
			.setName('Arrows per end')
			.setDesc('Number of arrow columns on each end row.')
			.addText((text) =>
				text
					.setPlaceholder(String(DEFAULT_CONFIG.arrowsPerEnd))
					.setValue(String(this.plugin.settings.defaultArrows))
					.onChange(async (value) => {
						const parsed = Number.parseInt(value, 10);
						if (Number.isNaN(parsed)) return;
						this.plugin.settings.defaultArrows = parsed;
						this.plugin.settings = normalizeSettings(this.plugin.settings);
						await this.plugin.saveSettings();
						text.setValue(String(this.plugin.settings.defaultArrows));
					}),
			);

		new Setting(containerEl)
			.setName('Scorecards per session')
			.setDesc('How many scorecard tables appear in one .archery file.')
			.addText((text) =>
				text
					.setPlaceholder(String(DEFAULT_CONFIG.cardsCount))
					.setValue(String(this.plugin.settings.defaultCards))
					.onChange(async (value) => {
						const parsed = Number.parseInt(value, 10);
						if (Number.isNaN(parsed)) return;
						this.plugin.settings.defaultCards = parsed;
						this.plugin.settings = normalizeSettings(this.plugin.settings);
						await this.plugin.saveSettings();
						text.setValue(String(this.plugin.settings.defaultCards));
					}),
			);
	}
}
