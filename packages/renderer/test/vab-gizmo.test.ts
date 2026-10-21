/** The Hangar gizmo's screen picking (plan 279): arrows by their shafts, rings by their outlines. */
import { describe, expect, test } from 'bun:test';
import {
	GizmoKit,
	distanceToLoop,
	distanceToSegment,
	nearestGizmoAxis,
	ringPoints
} from '../src/vab/gizmo.ts';

describe('gizmo picking', () => {
	test('distance to a segment clamps to its ends', () => {
		expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
		expect(distanceToSegment({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
	});

	test('the nearest arrow within reach wins; none beyond it', () => {
		const shapes = {
			x: [
				{ x: 100, y: 100 },
				{ x: 180, y: 100 }
			],
			y: [
				{ x: 100, y: 100 },
				{ x: 100, y: 20 }
			],
			z: [
				{ x: 100, y: 100 },
				{ x: 60, y: 140 }
			]
		};
		expect(nearestGizmoAxis({ x: 150, y: 106 }, shapes, 'move', 12)).toBe('x');
		expect(nearestGizmoAxis({ x: 95, y: 40 }, shapes, 'move', 12)).toBe('y');
		expect(nearestGizmoAxis({ x: 300, y: 300 }, shapes, 'move', 12)).toBeNull();
	});

	test('rings are picked by their outline, not their middle', () => {
		const flat = (pts: [number, number, number][]) => pts.map(([x, y]) => ({ x, y }));
		// a ring about the view axis (z) projects to a circle of radius 50 around (0, 0)
		const ring = flat(ringPoints([0, 0, 0], [0, 0, 1], 50));
		expect(distanceToLoop({ x: 50, y: 0 }, ring)).toBeLessThan(1e-9);
		expect(nearestGizmoAxis({ x: 0, y: 51 }, { z: ring }, 'rotate', 6)).toBe('z');
		expect(nearestGizmoAxis({ x: 0, y: 0 }, { z: ring }, 'rotate', 6)).toBeNull();
	});

	test('the kit shows arrows for move and rings for rotate, and highlights the dragged axis', () => {
		const kit = new GizmoKit();
		const axes = [
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1]
		] as const;
		kit.set({ group: 'main', mode: 'move', position: [0, 2, 0], axes, active: 'y' });
		expect(kit.root.visible).toBe(true);
		const visible = kit.root.children.filter((c) => c.visible);
		expect(visible).toHaveLength(3);
		expect(kit.root.position.y).toBe(2);
		kit.set({ group: 'main', mode: 'rotate', position: [0, 0, 0], axes });
		expect(kit.root.children.filter((c) => c.visible)).toHaveLength(3);
		expect(kit.root.children.filter((c) => c.visible).every((c) => c.type === 'Mesh')).toBe(true);
		kit.set(null);
		expect(kit.root.visible).toBe(false);
		kit.dispose();
	});
});
