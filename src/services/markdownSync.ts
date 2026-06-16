import { Notice } from 'obsidian';
import type { TFile } from 'obsidian';
import type { App } from 'obsidian';
import {
	ARROWS_PER_END,
	CARDS_COUNT,
	createSessionState,
	ENDS_PER_CARD,
	MISS_SCORE,
	type ArrowScore,
	type SessionState,
} from '../model/scorecard';

export const MARKER_START = '<!-- archery-scorecard:start -->';
export const MARKER_END = '<!-- archery-scorecard:end -->';
export const ARCHERY_EXTENSION = 'archery';

function formatCell(score: ArrowScore): string {
	if (score === null) return '';
	if (score === MISS_SCORE) return 'M';
	return String(score);
}

function parseArrowCell(cell: string): ArrowScore {
	const trimmed = cell.trim();
	if (!trimmed) return null;
	if (trimmed.toUpperCase() === 'M') return MISS_SCORE;
	const value = Number.parseInt(trimmed, 10);
	if (Number.isNaN(value) || value < MISS_SCORE || value > 10) return null;
	return value;
}

function formatDateForFilename(date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function parseScorecardSection(section: string): ArrowScore[][] {
	const ends: ArrowScore[][] = [];

	for (const line of section.split('\n')) {
		if (!line.startsWith('|')) continue;
		if (line.includes('---')) continue;
		if (/\|\s*End\s*\|/i.test(line)) continue;

		const parts = line
			.split('|')
			.map((part) => part.trim())
			.filter((part) => part.length > 0);

		if (parts.length < 8) continue;
		if (!/^\d+$/.test(parts[0]!)) continue;

		const arrows = parts.slice(1, 7).map(parseArrowCell);
		ends.push(arrows);
	}

	while (ends.length < ENDS_PER_CARD) {
		ends.push(Array.from<ArrowScore>({ length: ARROWS_PER_END }).fill(null));
	}

	return ends.slice(0, ENDS_PER_CARD).map((end) => {
		while (end.length < ARROWS_PER_END) {
			end.push(null);
		}
		return end.slice(0, ARROWS_PER_END);
	});
}

export function extractScorecardContent(content: string): string {
	const markers = findMarkerBlock(content);
	if (markers) {
		return content.slice(markers.start, markers.end);
	}
	return content;
}

export function parseScorecardBlock(content: string): SessionState | null {
	const block = extractScorecardContent(content);
	const sections = block.split(/###\s*Scorecard\s+\d+/i).slice(1);

	if (sections.length === 0) {
		return null;
	}

	const state = createSessionState();

	for (let cardIndex = 0; cardIndex < CARDS_COUNT; cardIndex++) {
		const section = sections[cardIndex];
		if (!section) continue;
		state.cards[cardIndex] = { ends: parseScorecardSection(section) };
	}

	return state;
}

export function buildScorecardBlock(state: SessionState): string {
	const lines: string[] = [MARKER_START, ''];

	for (let cardIndex = 0; cardIndex < CARDS_COUNT; cardIndex++) {
		lines.push(`### Scorecard ${cardIndex + 1}`);
		lines.push('| End | 1 | 2 | 3 | 4 | 5 | 6 | Total |');
		lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');

		const card = state.cards[cardIndex]!;
		for (let endIndex = 0; endIndex < ENDS_PER_CARD; endIndex++) {
			const end = card.ends[endIndex]!;
			const cells = end.map((score) => formatCell(score));
			const total = end.reduce<number>((sum, score) => sum + (score ?? 0), 0);
			const hasAny = end.some((score) => score !== null);
			lines.push(
				`| ${endIndex + 1} | ${cells.join(' | ')} | ${hasAny ? total : ''} |`,
			);
		}

		const cardTotal = card.ends.reduce(
			(sum, end) => sum + end.reduce<number>((s, score) => s + (score ?? 0), 0),
			0,
		);
		lines.push('');
		lines.push(`**Scorecard ${cardIndex + 1} total:** ${cardTotal}`);
		lines.push('');
	}

	const grandTotal = state.cards.reduce(
		(sum, card) =>
			sum +
			card.ends.reduce(
				(s, end) => s + end.reduce<number>((e, score) => e + (score ?? 0), 0),
				0,
			),
		0,
	);
	lines.push(`**Grand total:** ${grandTotal}`);
	lines.push('');
	lines.push(MARKER_END);

	return lines.join('\n');
}

export function serializeSession(state: SessionState): string {
	return buildScorecardBlock(state);
}

export function findMarkerBlock(content: string): { start: number; end: number } | null {
	const startIndex = content.indexOf(MARKER_START);
	const endIndex = content.indexOf(MARKER_END);
	if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
		return null;
	}
	return {
		start: startIndex,
		end: endIndex + MARKER_END.length,
	};
}

export async function loadSessionFromFile(
	app: App,
	file: TFile,
): Promise<SessionState> {
	const content = await app.vault.read(file);
	return parseScorecardBlock(content) ?? createSessionState();
}

export async function saveSessionToFile(
	app: App,
	file: TFile,
	state: SessionState,
): Promise<void> {
	await app.vault.modify(file, serializeSession(state));
}

export async function createScorecardFile(app: App): Promise<TFile | null> {
	const folder = app.fileManager.getNewFileParent('');
	const dateLabel = formatDateForFilename();
	const baseName = `Scorecard ${dateLabel}`;
	let path = `${folder.path}/${baseName}.${ARCHERY_EXTENSION}`;
	let counter = 2;

	while (app.vault.getAbstractFileByPath(path)) {
		path = `${folder.path}/${baseName} ${counter}.${ARCHERY_EXTENSION}`;
		counter++;
	}

	try {
		return await app.vault.create(path, serializeSession(createSessionState()));
	} catch {
		new Notice('Could not create scorecard file.');
		return null;
	}
}
