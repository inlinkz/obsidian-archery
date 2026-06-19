import { FileView, Notice, WorkspaceLeaf, setIcon, type TFile } from 'obsidian';
import type ArcheryPlugin from '../main';
import {
	applyScore,
	applyScoreAt,
	applyScoreColorClass,
	cardGrandTotal,
	createSessionState,
	endIsComplete,
	endTotal,
	formatScore,
	gridColumnStyle,
	hasAnyScore,
	MISS_SCORE,
	nextCursor,
	resizeSessionState,
	scoreColorClass,
	shotHasPlacement,
	sessionGrandTotal,
	undoLast,
	type SessionConfig,
	type SessionState,
} from '../model/scorecard';
import {
	parseScorecardBlock,
	serializeSession,
} from '../services/markdownSync';
import { getAllPresets, type LayoutPreset } from '../settings';
import { TargetFace } from './TargetFace';

export const VIEW_TYPE_SCORECARD = 'obsidian-archery-scorecard';

type ViewMode = 'view' | 'edit';

interface CellRef {
	el: HTMLElement;
}

interface EndTotalRef {
	el: HTMLElement;
}

interface EndLabelRef {
	el: HTMLElement;
}

export class ScorecardView extends FileView {
	private plugin: ArcheryPlugin;
	private state: SessionState = createSessionState();
	private mode: ViewMode = 'view';
	private cellRefs: CellRef[][][] = [];
	private endTotalRefs: EndTotalRef[][] = [];
	private grandTotalEls: HTMLElement[] = [];
	private combinedTotalEl: HTMLElement | null = null;
	private headerEl: HTMLElement | null = null;
	private modeActionBtn: HTMLElement | null = null;
	private targetActionBtn: HTMLElement | null = null;
	private viewContainer: HTMLElement | null = null;
	private scrollBodyEl: HTMLElement | null = null;
	private editContainer: HTMLElement | null = null;
	private sourceEditor: HTMLTextAreaElement | null = null;
	private scorePadEl: HTMLElement | null = null;
	private showTargetFace = false;
	private targetFaces: TargetFace[] = [];
	private endLabelRefs: EndLabelRef[][] = [];
	private visibleEndsPerCard: Set<number>[] = [];

	constructor(leaf: WorkspaceLeaf, plugin: ArcheryPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_SCORECARD;
	}

	onPresetsChanged(): void {
		if (this.file && this.mode === 'view') {
			this.renderViewMode();
		}
	}

	onSettingsChanged(): void {
		if (this.file && this.mode === 'view' && this.showTargetFace) {
			this.refreshTargetFaces();
		}
	}

	getDisplayText(): string {
		return this.file?.basename ?? 'Archery scorecard';
	}

	getIcon(): string {
		return 'target';
	}

	async onOpen(): Promise<void> {
		this.ensureModeAction();
		this.ensureTargetAction();
		this.updateModeUi();
	}

	private ensureModeAction(): void {
		if (this.modeActionBtn) return;
		this.modeActionBtn = this.addAction('code-glyph', 'Edit source', () => {
			this.toggleMode();
		});
	}

	private ensureTargetAction(): void {
		if (this.targetActionBtn) return;
		this.targetActionBtn = this.addAction('target', 'Show target face', () => {
			this.toggleTargetFace();
		});
	}

	private toggleMode(): void {
		this.setMode(this.mode === 'view' ? 'edit' : 'view');
	}

	private toggleTargetFace(): void {
		this.showTargetFace = !this.showTargetFace;
		if (this.showTargetFace) {
			this.initVisibleEnds();
		}
		this.renderViewMode();
		this.updateModeUi();
	}

	async onLoadFile(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);
		this.state = parseScorecardBlock(content) ?? createSessionState();
		this.mode = 'view';
		this.visibleEndsPerCard = [];
		this.render();
	}

	async onUnloadFile(_file: TFile): Promise<void> {
		this.contentEl.empty();
		this.resetRefs();
	}

	private resetRefs(): void {
		this.cellRefs = [];
		this.endTotalRefs = [];
		this.grandTotalEls = [];
		this.combinedTotalEl = null;
		this.headerEl = null;
		this.viewContainer = null;
		this.scrollBodyEl = null;
		this.editContainer = null;
		this.sourceEditor = null;
		this.scorePadEl = null;
		this.targetFaces = [];
		this.endLabelRefs = [];
	}

	private render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass('archery-scorecard-view');
		this.resetRefs();

		this.headerEl = container.createDiv({ cls: 'archery-header' });

		this.headerEl.createEl('h3', { text: this.file?.basename ?? 'Archery Scorecard' });
		this.renderConfigLabel();

		this.viewContainer = container.createDiv({ cls: 'archery-view-container' });
		this.editContainer = container.createDiv({ cls: 'archery-edit-container' });

		this.renderViewMode();
		this.renderEditMode();
		this.updateModeUi();
	}

	private renderConfigLabel(): void {
		const existing = this.headerEl?.querySelector('.archery-note-label');
		existing?.remove();

		const { config } = this.state;
		this.headerEl?.createDiv({
			cls: 'archery-note-label',
			text: `${this.file?.path ?? ''} · ${config.cardsCount}×${config.endsPerCard}×${config.arrowsPerEnd} (cards×ends×arrows)`,
		});
	}

	private renderViewMode(): void {
		if (!this.viewContainer) return;
		this.destroyTargetFaces();
		this.viewContainer.empty();

		const { config } = this.state;
		this.cellRefs = Array.from({ length: config.cardsCount }, () => []);
		this.endTotalRefs = Array.from({ length: config.cardsCount }, () => []);
		this.endLabelRefs = Array.from({ length: config.cardsCount }, () => []);
		this.ensureVisibleEnds();
		this.grandTotalEls = [];
		this.combinedTotalEl = null;

		this.scrollBodyEl = this.viewContainer.createDiv({ cls: 'archery-scroll-body' });

		this.renderPresetPanel(this.scrollBodyEl);

		const grids = this.scrollBodyEl.createDiv({
			cls: config.cardsCount > 1 ? 'archery-grids archery-grids--multi' : 'archery-grids',
		});
		for (let card = 0; card < config.cardsCount; card++) {
			this.renderScorecard(grids, card);
		}

		const stickyFooter = this.viewContainer.createDiv({ cls: 'archery-sticky-footer' });

		const partialTotals = stickyFooter.createDiv({ cls: 'archery-partial-totals' });
		for (let card = 0; card < config.cardsCount; card++) {
			const item = partialTotals.createDiv({ cls: 'archery-partial-total-item' });
			item.createSpan({ cls: 'archery-partial-total-label', text: `Card ${card + 1}` });
			const totalEl = item.createSpan({ cls: 'archery-partial-total-value' });
			totalEl.setText('0');
			this.grandTotalEls[card] = totalEl;
		}

		this.scorePadEl = stickyFooter.createDiv({ cls: 'archery-score-pad' });
		this.renderScorePad();

		const grandTotalBar = stickyFooter.createDiv({ cls: 'archery-grand-total-bar' });
		const grandTotalHeading = grandTotalBar.createEl('h1', { cls: 'archery-grand-total-h1' });
		grandTotalHeading.createSpan({ cls: 'archery-grand-total-label', text: 'Grand total' });
		this.combinedTotalEl = grandTotalHeading.createSpan({ cls: 'archery-grand-total-value' });
		this.combinedTotalEl.setText('0');

		const undoBtn = grandTotalBar.createEl('button', {
			cls: 'archery-undo-btn',
			text: 'Undo',
		});
		undoBtn.addEventListener('click', () => this.handleUndo());

		this.refreshAllCells();
		if (this.showTargetFace) {
			this.refreshEndLabels();
		}
	}

	private ensureVisibleEnds(): void {
		const { cardsCount } = this.state.config;
		while (this.visibleEndsPerCard.length < cardsCount) {
			this.visibleEndsPerCard.push(new Set());
		}
		this.visibleEndsPerCard.length = cardsCount;
	}

	private initVisibleEnds(): void {
		this.ensureVisibleEnds();
		const cursor = nextCursor(this.state);
		for (let card = 0; card < this.state.config.cardsCount; card++) {
			const set = this.visibleEndsPerCard[card]!;
			if (set.size > 0) continue;
			const end = cursor?.card === card ? cursor.end : 0;
			set.add(end);
		}
	}

	private syncVisibleEndsForCursor(): void {
		if (!this.showTargetFace) return;
		const cursor = nextCursor(this.state);
		if (!cursor) return;
		this.visibleEndsPerCard[cursor.card]?.add(cursor.end);
	}

	private toggleEndVisibility(cardIndex: number, endIndex: number): void {
		if (!this.showTargetFace) return;
		const set = this.visibleEndsPerCard[cardIndex];
		if (!set) return;
		if (set.has(endIndex)) {
			set.delete(endIndex);
		} else {
			set.add(endIndex);
		}
		this.refreshEndLabels(cardIndex);
		this.refreshTargetFaces();
	}

	private refreshEndLabels(cardIndex?: number): void {
		const cards =
			cardIndex === undefined
				? Array.from({ length: this.state.config.cardsCount }, (_, i) => i)
				: [cardIndex];

		for (const card of cards) {
			const visible = this.visibleEndsPerCard[card];
			const labels = this.endLabelRefs[card];
			if (!visible || !labels) continue;
			for (let end = 0; end < labels.length; end++) {
				const ref = labels[end];
				if (!ref) continue;
				const onTarget = visible.has(end);
				ref.el.toggleClass('archery-end-on-target', onTarget);
				ref.el.title = onTarget
					? `End ${end + 1} shown on target — click to hide`
					: `End ${end + 1} hidden on target — click to show`;
			}
		}
	}

	private refreshTargetFaces(): void {
		const offset = this.plugin.settings.targetTouchOffsetY;
		for (let cardIndex = 0; cardIndex < this.targetFaces.length; cardIndex++) {
			const face = this.targetFaces[cardIndex];
			if (!face) continue;
			const visible = this.visibleEndsPerCard[cardIndex] ?? new Set();
			face.update(this.state, visible, offset);
		}
	}

	private destroyTargetFaces(): void {
		for (const face of this.targetFaces) {
			face.destroy();
		}
		this.targetFaces = [];
	}

	private renderPresetPanel(parent: HTMLElement): void {
		// Dimensions can only be changed while the scorecard is empty.
		if (hasAnyScore(this.state)) return;

		const panel = parent.createDiv({ cls: 'archery-preset-panel' });

		const presets = getAllPresets(this.plugin.settings);
		const { config } = this.state;
		const activePreset = presets.find((preset) => this.presetMatches(preset, config));

		const chips = panel.createDiv({ cls: 'archery-preset-chips' });
		for (const preset of presets) {
			const chip = chips.createEl('button', {
				cls: 'archery-preset-chip',
				text: preset.name,
			});
			chip.toggleClass('archery-preset-chip-active', preset === activePreset);
			chip.title = `${preset.cardsCount} cards × ${preset.endsPerCard} ends × ${preset.arrowsPerEnd} arrows`;
			chip.addEventListener('click', () => this.applyPreset(preset));
		}

		if (!activePreset) {
			const custom = chips.createSpan({
				cls: 'archery-preset-chip archery-preset-chip-custom',
				text: `Custom · ${config.cardsCount}×${config.endsPerCard}×${config.arrowsPerEnd}`,
			});
			custom.title = 'Current layout does not match a preset';
		}
	}

	private presetMatches(preset: LayoutPreset, config: SessionConfig): boolean {
		return (
			preset.cardsCount === config.cardsCount &&
			preset.endsPerCard === config.endsPerCard &&
			preset.arrowsPerEnd === config.arrowsPerEnd
		);
	}

	private applyPreset(preset: LayoutPreset): void {
		this.applyLayoutChange({
			cardsCount: preset.cardsCount,
			endsPerCard: preset.endsPerCard,
			arrowsPerEnd: preset.arrowsPerEnd,
			roundType: preset.name,
		});
	}

	private applyLayoutChange(partial: Partial<SessionConfig>): void {
		const presets = getAllPresets(this.plugin.settings);
		const roundType =
			partial.roundType ??
			presets.find((preset) =>
				this.presetMatches(preset, { ...this.state.config, ...partial }),
			)?.name ??
			'Custom';

		const next = resizeSessionState(this.state, { ...partial, roundType });
		if (
			next.config.endsPerCard === this.state.config.endsPerCard &&
			next.config.arrowsPerEnd === this.state.config.arrowsPerEnd &&
			next.config.cardsCount === this.state.config.cardsCount
		) {
			return;
		}

		this.state = next;
		this.visibleEndsPerCard = [];
		this.renderConfigLabel();
		this.syncEditBufferFromState();
		this.renderViewMode();
		void this.persistState();
	}

	private renderEditMode(): void {
		if (!this.editContainer) return;
		this.editContainer.empty();

		this.editContainer.createDiv({
			cls: 'archery-edit-hint',
			text: 'Edit the scorecard markup below. Change the config line or table shape, then switch to View to apply.',
		});

		this.sourceEditor = this.editContainer.createEl('textarea', {
			cls: 'archery-source-editor',
		});
		this.sourceEditor.value = serializeSession(this.state);
		this.sourceEditor.spellcheck = false;
	}

	private setMode(mode: ViewMode): void {
		if (mode === this.mode) return;

		if (mode === 'view') {
			if (!this.applyEditBuffer()) return;
		} else {
			this.syncEditBufferFromState();
		}

		this.mode = mode;
		this.updateModeUi();
	}

	private updateModeUi(): void {
		if (this.modeActionBtn) {
			const editing = this.mode === 'edit';
			setIcon(this.modeActionBtn, editing ? 'layout' : 'code-glyph');
			this.modeActionBtn.setAttribute(
				'aria-label',
				editing ? 'Scorecard view' : 'Edit source',
			);
		}
		if (this.targetActionBtn) {
			const inView = this.mode === 'view';
			this.targetActionBtn.style.display = inView ? '' : 'none';
			this.targetActionBtn.toggleClass('is-active', this.showTargetFace);
			this.targetActionBtn.setAttribute(
				'aria-label',
				this.showTargetFace ? 'Hide target face' : 'Show target face',
			);
		}
		this.viewContainer?.toggleClass('archery-hidden', this.mode !== 'view');
		this.editContainer?.toggleClass('archery-hidden', this.mode !== 'edit');
	}

	private syncEditBufferFromState(): void {
		if (this.sourceEditor) {
			this.sourceEditor.value = serializeSession(this.state);
		}
	}

	private applyEditBuffer(): boolean {
		if (!this.sourceEditor) return true;

		const parsed = parseScorecardBlock(this.sourceEditor.value);
		if (!parsed) {
			new Notice('Could not parse scorecard markup. Check the table format.');
			return false;
		}

		const configChanged =
			parsed.config.endsPerCard !== this.state.config.endsPerCard ||
			parsed.config.arrowsPerEnd !== this.state.config.arrowsPerEnd ||
			parsed.config.cardsCount !== this.state.config.cardsCount;

		this.state = parsed;

		if (configChanged) {
			this.render();
			return true;
		}

		this.renderConfigLabel();
		this.refreshAllCells();
		void this.persistState();
		return true;
	}

	private async persistState(): Promise<void> {
		if (!this.file) return;
		const content = serializeSession(this.state);
		await this.app.vault.modify(this.file, content);
		if (this.sourceEditor && this.mode === 'edit') {
			this.sourceEditor.value = content;
		}
	}

	private renderScorecard(parent: HTMLElement, cardIndex: number): void {
		const { config } = this.state;
		const section = parent.createDiv({ cls: 'archery-scorecard-section' });
		section.createEl('h4', { text: `Scorecard ${cardIndex + 1}` });

		if (this.showTargetFace) {
			const targetWrap = section.createDiv({ cls: 'archery-target-wrap' });
			const face = new TargetFace(targetWrap, {
				cardIndex,
				touchOffsetY: this.plugin.settings.targetTouchOffsetY,
				onPlace: (x, y, score) => this.handleTargetPlace(x, y, score),
			});
			const visible = this.visibleEndsPerCard[cardIndex] ?? new Set();
			face.update(this.state, visible, this.plugin.settings.targetTouchOffsetY);
			this.targetFaces.push(face);
		}

		const grid = section.createDiv({ cls: 'archery-scorecard-grid' });

		const headerRow = grid.createDiv({ cls: 'archery-grid-row archery-grid-header' });
		headerRow.style.gridTemplateColumns = gridColumnStyle(config.arrowsPerEnd);
		headerRow.createDiv({ cls: 'archery-cell archery-cell-label', text: 'End' });
		for (let arrow = 1; arrow <= config.arrowsPerEnd; arrow++) {
			headerRow.createDiv({
				cls: 'archery-cell archery-cell-header',
				text: String(arrow),
			});
		}
		headerRow.createDiv({ cls: 'archery-cell archery-cell-header', text: 'Total' });

		this.cellRefs[cardIndex] = [];
		this.endTotalRefs[cardIndex] = [];

		this.endLabelRefs[cardIndex] = [];

		for (let end = 0; end < config.endsPerCard; end++) {
			const row = grid.createDiv({ cls: 'archery-grid-row' });
			row.style.gridTemplateColumns = gridColumnStyle(config.arrowsPerEnd);
			const endLabel = row.createDiv({
				cls: 'archery-cell archery-cell-label',
				text: String(end + 1),
			});
			if (this.showTargetFace) {
				endLabel.addClass('archery-end-label-toggle');
			}
			endLabel.addEventListener('click', () => this.toggleEndVisibility(cardIndex, end));
			this.endLabelRefs[cardIndex]![end] = { el: endLabel };

			const arrowCells: CellRef[] = [];
			for (let arrow = 0; arrow < config.arrowsPerEnd; arrow++) {
				const cell = row.createDiv({ cls: 'archery-cell archery-cell-score' });
				cell.setText('·');
				arrowCells.push({ el: cell });
			}
			this.cellRefs[cardIndex]![end] = arrowCells;

			const totalCell = row.createDiv({ cls: 'archery-cell archery-cell-total' });
			totalCell.setText('');
			this.endTotalRefs[cardIndex]![end] = { el: totalCell };
		}
	}

	private renderScorePad(): void {
		if (!this.scorePadEl) return;
		this.scorePadEl.empty();

		if (this.showTargetFace) {
			const missRow = this.scorePadEl.createDiv({ cls: 'archery-score-row archery-score-row-miss-only' });
			this.createScoreButton(missRow, MISS_SCORE, 'archery-score-miss archery-score-btn-miss-only', 'Miss');
			return;
		}

		const pad = this.scorePadEl.createDiv({ cls: 'archery-score-buttons' });

		const topRow = pad.createDiv({ cls: 'archery-score-row archery-score-row-top' });
		this.createScoreButton(topRow, 10, 'archery-score-btn-wide');
		for (let score = 9; score >= 6; score--) {
			this.createScoreButton(topRow, score);
		}

		const bottomRow = pad.createDiv({ cls: 'archery-score-row archery-score-row-bottom' });
		for (let score = 5; score >= 1; score--) {
			this.createScoreButton(bottomRow, score);
		}
		this.createScoreButton(bottomRow, MISS_SCORE, 'archery-score-miss', 'M');
	}

	private createScoreButton(
		parent: HTMLElement,
		score: number,
		extraClass = '',
		label?: string,
	): void {
		const btn = parent.createEl('button', {
			cls: ['archery-score-btn', extraClass].filter(Boolean).join(' '),
			text: label ?? String(score),
		});
		const colorClass = scoreColorClass(score);
		if (colorClass) btn.addClass(colorClass);
		btn.addEventListener('click', () => this.handleScore(score));
	}

	private isActiveCell(card: number, end: number, arrow: number): boolean {
		const cursor = nextCursor(this.state);
		return (
			cursor !== null &&
			cursor.card === card &&
			cursor.end === end &&
			cursor.arrow === arrow
		);
	}

	private refreshAllCells(): void {
		const { config } = this.state;
		const cursor = nextCursor(this.state);

		for (let card = 0; card < config.cardsCount; card++) {
			const scorecard = this.state.cards[card];
			if (!scorecard) continue;

			for (let end = 0; end < config.endsPerCard; end++) {
				const arrows = scorecard.ends[end];
				if (!arrows) continue;

				for (let arrow = 0; arrow < config.arrowsPerEnd; arrow++) {
					const ref = this.cellRefs[card]?.[end]?.[arrow];
					if (!ref) continue;
					const shot = arrows[arrow];
					const score = shot?.score ?? null;
					ref.el.setText(formatScore(score));
					ref.el.toggleClass('archery-cell-active', this.isActiveCell(card, end, arrow));
					ref.el.toggleClass('archery-cell-filled', score !== null);
					ref.el.toggleClass('archery-cell-placed', shotHasPlacement(shot));
					applyScoreColorClass(ref.el, score);
				}

				const totalRef = this.endTotalRefs[card]?.[end];
				if (totalRef) {
					const hasAny = arrows.some((shot) => shot.score !== null);
					totalRef.el.setText(hasAny ? String(endTotal(arrows)) : '');
					totalRef.el.toggleClass('archery-cell-complete', endIsComplete(arrows));
				}
			}

			const grandEl = this.grandTotalEls[card];
			if (grandEl) {
				grandEl.setText(String(cardGrandTotal(scorecard)));
			}
		}

		if (this.combinedTotalEl) {
			this.combinedTotalEl.setText(String(sessionGrandTotal(this.state)));
		}

		if (this.scorePadEl) {
			const complete = cursor === null;
			this.scorePadEl.toggleClass('archery-session-complete', complete);
		}

		this.syncVisibleEndsForCursor();
		this.refreshEndLabels();
		this.refreshTargetFaces();
	}

	private handleTargetPlace(x: number, y: number, score: number): void {
		if (this.mode !== 'view' || !this.showTargetFace || !nextCursor(this.state)) return;

		const wasEmpty = !hasAnyScore(this.state);
		this.state = applyScoreAt(this.state, x, y, score);
		if (wasEmpty) {
			this.renderViewMode();
		} else {
			this.refreshAllCells();
		}
		void this.persistState();
	}

	private handleScore(value: number): void {
		if (this.mode !== 'view' || !nextCursor(this.state)) return;

		const wasEmpty = !hasAnyScore(this.state);
		this.state = applyScore(this.state, value);
		// First score: rebuild so the preset chips disappear.
		if (wasEmpty) {
			this.renderViewMode();
		} else {
			this.refreshAllCells();
		}
		void this.persistState();
	}

	private handleUndo(): void {
		if (this.mode !== 'view') return;

		const wasNonEmpty = hasAnyScore(this.state);
		this.state = undoLast(this.state);
		// Last score removed: rebuild so the preset chips reappear.
		if (wasNonEmpty && !hasAnyScore(this.state)) {
			this.renderViewMode();
		} else {
			this.refreshAllCells();
		}
		void this.persistState();
	}

	async resetSession(): Promise<void> {
		this.state = createSessionState(this.state.config);
		this.syncEditBufferFromState();
		this.refreshAllCells();
		await this.persistState();
	}
}
