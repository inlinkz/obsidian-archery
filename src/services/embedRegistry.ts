import type { Component, Plugin, TFile } from 'obsidian';
import { ARCHERY_EXTENSION } from './markdownSync';
import { ArcheryEmbed } from '../views/ArcheryEmbed';

interface EmbedContext {
	containerEl: HTMLElement;
}

interface EmbedRegistry {
	registerExtension(
		extension: string,
		embedCreator: (context: EmbedContext, file: TFile) => Component,
	): void;
	unregisterExtension(extension: string): void;
}

interface AppWithEmbedRegistry {
	embedRegistry?: EmbedRegistry;
}

export function registerArcheryEmbed(plugin: Plugin): void {
	const registry = (plugin.app as unknown as AppWithEmbedRegistry).embedRegistry;
	if (!registry) {
		return;
	}

	registry.registerExtension(ARCHERY_EXTENSION, (context, file) => {
		return new ArcheryEmbed(context.containerEl, plugin.app, file);
	});

	plugin.register(() => {
		registry.unregisterExtension(ARCHERY_EXTENSION);
	});
}
