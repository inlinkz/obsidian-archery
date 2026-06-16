export const ENDS_PER_CARD = 6;
export const ARROWS_PER_END = 6;
export const CARDS_COUNT = 2;

export const MISS_SCORE = 0;

export type ArrowScore = number | null;

const SCORE_COLOR_CLASSES = [
	'archery-score-yellow',
	'archery-score-red',
	'archery-score-blue',
	'archery-score-grey',
	'archery-score-white',
	'archery-score-miss',
] as const;

export function scoreColorClass(score: ArrowScore): string | null {
	if (score === null) return null;
	if (score === MISS_SCORE) return 'archery-score-miss';
	if (score >= 9) return 'archery-score-yellow';
	if (score >= 7) return 'archery-score-red';
	if (score >= 5) return 'archery-score-blue';
	if (score >= 3) return 'archery-score-grey';
	return 'archery-score-white';
}

export function applyScoreColorClass(el: HTMLElement, score: ArrowScore): void {
	for (const cls of SCORE_COLOR_CLASSES) {
		el.removeClass(cls);
	}
	const colorClass = scoreColorClass(score);
	if (colorClass) {
		el.addClass(colorClass);
	}
}

export interface Scorecard {
	ends: ArrowScore[][];
}

export interface Cursor {
	card: 0 | 1;
	end: number;
	arrow: number;
}

export interface SessionState {
	cards: [Scorecard, Scorecard];
}

export function createEmptyScorecard(): Scorecard {
	return {
		ends: Array.from({ length: ENDS_PER_CARD }, () =>
			Array.from<ArrowScore>({ length: ARROWS_PER_END }).fill(null),
		),
	};
}

export function createSessionState(): SessionState {
	return {
		cards: [createEmptyScorecard(), createEmptyScorecard()],
	};
}

export function endTotal(end: ArrowScore[]): number {
	return end.reduce<number>((sum, score) => sum + (score ?? 0), 0);
}

export function endIsComplete(end: ArrowScore[]): boolean {
	return end.every((score) => score !== null);
}

export function cardGrandTotal(card: Scorecard): number {
	return card.ends.reduce((sum, end) => sum + endTotal(end), 0);
}

export function sessionGrandTotal(state: SessionState): number {
	return cardGrandTotal(state.cards[0]) + cardGrandTotal(state.cards[1]);
}

export function countFilledArrows(state: SessionState): number {
	let count = 0;
	for (const card of state.cards) {
		for (const end of card.ends) {
			for (const score of end) {
				if (score !== null) count++;
			}
		}
	}
	return count;
}

export function nextCursor(state: SessionState): Cursor | null {
	for (let card = 0; card < CARDS_COUNT; card++) {
		const scorecard = state.cards[card]!;
		for (let end = 0; end < ENDS_PER_CARD; end++) {
			const arrows = scorecard.ends[end]!;
			for (let arrow = 0; arrow < ARROWS_PER_END; arrow++) {
				if (arrows[arrow] === null) {
					return { card: card as 0 | 1, end, arrow };
				}
			}
		}
	}
	return null;
}

export function lastFilledCursor(state: SessionState): Cursor | null {
	for (let card = CARDS_COUNT - 1; card >= 0; card--) {
		const scorecard = state.cards[card]!;
		for (let end = ENDS_PER_CARD - 1; end >= 0; end--) {
			const arrows = scorecard.ends[end]!;
			for (let arrow = ARROWS_PER_END - 1; arrow >= 0; arrow--) {
				if (arrows[arrow] !== null) {
					return { card: card as 0 | 1, end, arrow };
				}
			}
		}
	}
	return null;
}

export function applyScore(state: SessionState, value: number): SessionState {
	const cursor = nextCursor(state);
	if (!cursor) return state;

	const next: SessionState = {
		cards: [
			{ ends: state.cards[0].ends.map((end) => [...end]) },
			{ ends: state.cards[1].ends.map((end) => [...end]) },
		],
	};

	const end = next.cards[cursor.card].ends[cursor.end]!;
	end[cursor.arrow] = value;
	return next;
}

export function undoLast(state: SessionState): SessionState {
	const cursor = lastFilledCursor(state);
	if (!cursor) return state;

	const next: SessionState = {
		cards: [
			{ ends: state.cards[0].ends.map((end) => [...end]) },
			{ ends: state.cards[1].ends.map((end) => [...end]) },
		],
	};

	const end = next.cards[cursor.card].ends[cursor.end]!;
	end[cursor.arrow] = null;
	return next;
}

export function formatScore(score: ArrowScore): string {
	if (score === null) return '·';
	if (score === MISS_SCORE) return 'M';
	return String(score);
}

export function isValidArrowScore(value: number): boolean {
	return Number.isInteger(value) && value >= MISS_SCORE && value <= 10;
}
