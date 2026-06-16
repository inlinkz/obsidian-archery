import { FileView, Notice, WorkspaceLeaf, type TFile } from 'obsidian';
import {
	applyScore,
	applyScoreColorClass,
	cardGrandTotal,
	CONFIG_LIMITS,
	createSessionState,
	endIsComplete,
	endTotal,
	formatScore,
	gridColumnStyle,
	MISS_SCORE,
	nextCursor,
	resizeSessionState,
	scoreColorClass,
	sessionGrandTotal,
	undoLast,
	type SessionConfig,
	type SessionState,
} from '../model/scorecard';
import {
	parseScorecardBlock,
	serializeSession,
} from '../services/markdownSync';

export const VIEW_TYPE_SCORECARD = 'obsidian-archery-scorecard';

type ViewMode = 'view' | 'edit';

interface CellRef {
	el: HTMLElement;
}

interface EndTotalRef {
	el: HTMLElement;
}

export class ScorecardView extends FileView {
	private state: SessionState = createSessionState();
	private mode: ViewMode = 'view';
	private cellRefs: CellRef[][][] = [];
	private endTotalRefs: EndTotalRef[][] = [];
	private grandTotalEls: HTMLElement[] = [];
	private combinedTotalEl: HTMLElement | null = null;
	private headerEl: HTMLElement | null = null;
	private viewModeBtn: HTMLButtonElement | null = null;
	private editModeBtn: HTMLButtonElement | null = null;
	private viewContainer: HTMLElement | null = null;
	private editContainer: HTMLElement | null = null;
	private sourceEditor: HTMLTextAreaElement | null = null;
	private scorePadEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_SCORECARD;
	}

	getDisplayText(): string {
		return this.file?.basename ?? 'Archery scorecard';
	}

	getIcon(): string {
		return 'target';
	}

	async onLoadFile(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);
		this.state = parseScorecardBlock(content) ?? createSessionState();
		this.mode = 'view';
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
		this.viewModeBtn = null;
		this.editModeBtn = null;
		this.viewContainer = null;
		this.editContainer = null;
		this.sourceEditor = null;
		this.scorePadEl = null;
	}

	private render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass('archery-scorecard-view');
		this.resetRefs();

		this.headerEl = container.createDiv({ cls: 'archery-header' });

		const toolbar = this.headerEl.createDiv({ cls: 'archery-toolbar' });
		this.viewModeBtn = toolbar.createEl('button', {
			cls: 'archery-mode-btn',
			text: 'View',
		});
		this.editModeBtn = toolbar.createEl('button', {
			cls: 'archery-mode-btn',
			text: 'Edit',
		});
		this.viewModeBtn.addEventListener('click', () => this.setMode('view'));
		this.editModeBtn.addEventListener('click', () => this.setMode('edit'));

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
		this.viewContainer.empty();

		const { config } = this.state;
		this.cellRefs = Array.from({ length: config.cardsCount }, () => []);
		this.endTotalRefs = Array.from({ length: config.cardsCount }, () => []);
		this.grandTotalEls = [];

		this.renderResizePanel();

		const grids = this.viewContainer.createDiv({ cls: 'archery-grids' });
		for (let card = 0; card < config.cardsCount; card++) {
			this.renderScorecard(grids, card);
		}

		const footer = this.viewContainer.createDiv({ cls: 'archery-footer' });
		for (let card = 0; card < config.cardsCount; card++) {
			const row = footer.createDiv({ cls: 'archery-grand-total-row' });
			row.createSpan({ text: `Scorecard ${card + 1} total: ` });
			const totalEl = row.createSpan({ cls: 'archery-grand-total-value' });
			totalEl.setText('0');
			this.grandTotalEls[card] = totalEl;
		}
		const combinedRow = footer.createDiv({
			cls: 'archery-grand-total-row archery-combined-total',
		});
		combinedRow.createSpan({ text: 'Combined total: ' });
		this.combinedTotalEl = combinedRow.createSpan({ cls: 'archery-grand-total-value' });
		this.combinedTotalEl.setText('0');

		this.scorePadEl = this.viewContainer.createDiv({ cls: 'archery-score-pad' });
		this.renderScorePad();
		this.refreshAllCells();
	}

	private renderResizePanel(): void {
		if (!this.viewContainer) return;

		const panel = this.viewContainer.createDiv({ cls: 'archery-resize-panel' });
		panel.createDiv({ cls: 'archery-resize-title', text: 'Layout' });

		const row = panel.createDiv({ cls: 'archery-resize-row' });
		const { config } = this.state;

		this.renderResizeControl(row, 'Ends', config.endsPerCard, CONFIG_LIMITS.endsPerCard, (value) =>
			this.applyLayoutChange({ endsPerCard: value }),
		);
		this.renderResizeControl(row, 'Arrows', config.arrowsPerEnd, CONFIG_LIMITS.arrowsPerEnd, (value) =>
			this.applyLayoutChange({ arrowsPerEnd: value }),
		);
		this.renderResizeControl(row, 'Cards', config.cardsCount, CONFIG_LIMITS.cardsCount, (value) =>
			this.applyLayoutChange({ cardsCount: value }),
		);
	}

	private renderResizeControl(
		parent: HTMLElement,
		label: string,
		value: number,
		limits: { min: number; max: number },
		onChange: (value: number) => void,
	): void {
		const control = parent.createDiv({ cls: 'archery-resize-control' });
		control.createSpan({ cls: 'archery-resize-label', text: label });

		const minusBtn = control.createEl('button', {
			cls: 'archery-resize-btn',
			text: '−',
			attr: { 'aria-label': `Decrease ${label.toLowerCase()}` },
		});
		const valueEl = control.createSpan({ cls: 'archery-resize-value', text: String(value) });
		const plusBtn = control.createEl('button', {
			cls: 'archery-resize-btn',
			text: '+',
			attr: { 'aria-label': `Increase ${label.toLowerCase()}` },
		});

		minusBtn.disabled = value <= limits.min;
		plusBtn.disabled = value >= limits.max;

		minusBtn.addEventListener('click', () => onChange(value - 1));
		plusBtn.addEventListener('click', () => onChange(value + 1));

		valueEl.setText(String(value));
	}

	private applyLayoutChange(partial: Partial<SessionConfig>): void {
		const next = resizeSessionState(this.state, partial);
		if (
			next.config.endsPerCard === this.state.config.endsPerCard &&
			next.config.arrowsPerEnd === this.state.config.arrowsPerEnd &&
			next.config.cardsCount === this.state.config.cardsCount
		) {
			return;
		}

		this.state = next;
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
		this.viewModeBtn?.toggleClass('archery-mode-btn-active', this.mode === 'view');
		this.editModeBtn?.toggleClass('archery-mode-btn-active', this.mode === 'edit');
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

		for (let end = 0; end < config.endsPerCard; end++) {
			const row = grid.createDiv({ cls: 'archery-grid-row' });
			row.style.gridTemplateColumns = gridColumnStyle(config.arrowsPerEnd);
			row.createDiv({ cls: 'archery-cell archery-cell-label', text: String(end + 1) });

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

		const actions = this.scorePadEl.createDiv({ cls: 'archery-score-actions' });
		const undoBtn = actions.createEl('button', {
			cls: 'archery-undo-btn',
			text: 'Undo',
		});
		undoBtn.addEventListener('click', () => this.handleUndo());
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
					const score = arrows[arrow] ?? null;
					ref.el.setText(formatScore(score));
					ref.el.toggleClass('archery-cell-active', this.isActiveCell(card, end, arrow));
					ref.el.toggleClass('archery-cell-filled', score !== null);
					applyScoreColorClass(ref.el, score);
				}

				const totalRef = this.endTotalRefs[card]?.[end];
				if (totalRef) {
					const hasAny = arrows.some((s) => s !== null);
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
	}

	private handleScore(value: number): void {
		if (this.mode !== 'view' || !nextCursor(this.state)) return;

		this.state = applyScore(this.state, value);
		this.refreshAllCells();
		void this.persistState();
	}

	private handleUndo(): void {
		if (this.mode !== 'view') return;

		this.state = undoLast(this.state);
		this.refreshAllCells();
		void this.persistState();
	}

	async resetSession(): Promise<void> {
		this.state = createSessionState(this.state.config);
		this.syncEditBufferFromState();
		this.refreshAllCells();
		await this.persistState();
	}
}
