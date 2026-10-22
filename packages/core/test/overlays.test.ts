/** Plan 347, ADR 0296: overlay shapes are checked and kept within their budgets. */
import { describe, expect, test } from 'bun:test';
import { clampOverlay, cleanMeta, dashSegments, OVERLAY_LIMITS, type OverlayShape } from '../src/index.ts';

const line = (n: number): OverlayShape => ({
	kind: 'polyline',
	body: 'stock.home',
	frame: 'body-fixed',
	color: '#4caf50',
	points: Array.from({ length: n }, (_, i) => ({ x: i, y: 0, z: 0 }))
});

describe('overlays', () => {
	test('invalid shapes are dropped with the reason; valid ones kept', () => {
		const { shapes, dropped } = clampOverlay([
			line(3),
			{ ...line(3), color: 'green' },
			{ kind: 'marker', body: 'stock.home', frame: 'inertial', color: '#ff000080', position: { x: 1, y: 2, z: 3 }, style: 'cross' },
			{ kind: 'blob' }
		]);
		expect(shapes.map((s) => s.kind)).toEqual(['polyline', 'marker']);
		expect(dropped).toHaveLength(2);
		expect(dropped[0]).toContain('color');
	});

	test('budgets: points, labels, shapes; long text is cut', () => {
		const pts = clampOverlay([line(4_000), line(200)]);
		expect(pts.shapes).toHaveLength(1);
		expect(pts.dropped[0]).toContain('point budget');
		const label = (i: number) => ({ kind: 'label', body: 'b', frame: 'inertial', color: '#ffffff', position: { x: i, y: 0, z: 0 }, text: 'x'.repeat(100) });
		const labels = clampOverlay(Array.from({ length: 20 }, (_, i) => label(i)));
		expect(labels.shapes).toHaveLength(OVERLAY_LIMITS.labels);
		expect((labels.shapes[0] as { text: string }).text).toHaveLength(OVERLAY_LIMITS.text);
		const many = clampOverlay(Array.from({ length: 70 }, () => line(2)));
		expect(many.shapes).toHaveLength(OVERLAY_LIMITS.shapes);
	});

	test('dashes are cut in metres; meta keeps numbers and short strings', () => {
		const segs = dashSegments([{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }], { on: 2, off: 3 });
		expect(segs.map((p) => p.x)).toEqual([0, 2, 5, 7]);
		expect(dashSegments([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }], undefined)).toHaveLength(4);
		expect(cleanMeta({ a: 1, b: 'x', c: Number.NaN, d: {} })).toEqual({ a: 1, b: 'x' });
	});
});
