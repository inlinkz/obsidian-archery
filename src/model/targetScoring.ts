export const TARGET_RADIUS = 10;

/** Outer radius of each ring (score 10 = index 0, score 1 = index 9). */
const RING_OUTER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function scoreFromPoint(x: number, y: number): number | null {
	const distance = Math.hypot(x, y);
	if (distance > TARGET_RADIUS) {
		return null;
	}
	for (let i = 0; i < RING_OUTER.length; i++) {
		if (distance <= RING_OUTER[i]!) {
			return 10 - i;
		}
	}
	return 1;
}

export function ringFillClass(score: number): string {
	if (score >= 9) return 'archery-target-yellow';
	if (score >= 7) return 'archery-target-red';
	if (score >= 5) return 'archery-target-blue';
	if (score >= 3) return 'archery-target-grey';
	return 'archery-target-white';
}

export function roundCoord(value: number): number {
	return Math.round(value * 10) / 10;
}

export function clientToTargetCoords(
	svg: SVGSVGElement,
	clientX: number,
	clientY: number,
	previewOffsetY = 0,
): { x: number; y: number } {
	const rect = svg.getBoundingClientRect();
	const nx = (((clientX - rect.left) / rect.width) * 2 - 1) * TARGET_RADIUS;
	const ny =
		-(((clientY - rect.top - previewOffsetY) / rect.height) * 2 - 1) * TARGET_RADIUS;
	return { x: roundCoord(nx), y: roundCoord(ny) };
}
