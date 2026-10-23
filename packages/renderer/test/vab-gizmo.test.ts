/** The Hangar gizmo's screen picking (plan 279): arrows by their shafts, rings by their outlines. */
import { describe, expect, test } from 'bun:test';
import {
	GizmoKit,
	distanceToLoop,
	distanceToSegment,
	insidePolygon,
	nearestGizmoAxis,
	nearestGizmoHandle,
	planeCoordinates,
	planeCorners,
	ringPoints,
	PLANE_AXES,
	PLANE_SIDE,
	PLANE_START
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
		// three arrows and, since plan 304, three plane squares
		const visible = kit.root.children.filter((c) => c.visible);
		expect(visible).toHaveLength(6);
		expect(kit.root.position.y).toBe(2);
		kit.set({ group: 'main', mode: 'rotate', position: [0, 0, 0], axes });
		expect(kit.root.children.filter((c) => c.visible)).toHaveLength(3);
		expect(kit.root.children.filter((c) => c.visible).every((c) => c.type === 'Mesh')).toBe(true);
		kit.set(null);
		expect(kit.root.visible).toBe(false);
		kit.dispose();
	});
});

describe('plane handles (plan 304)', () => {
	const AXES = [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1]
	] as const;

	test('a plane square lies clear of its axes, in the plane of two of them', () => {
		const xy = planeCorners(AXES, 'xy');
		expect(xy).toHaveLength(4);
		for (const c of xy) {
			expect(c[2]).toBe(0);
			expect(c[0]).toBeGreaterThanOrEqual(PLANE_START);
			expect(c[1]).toBeGreaterThanOrEqual(PLANE_START);
		}
		expect(Math.max(...xy.map((c) => c[0]))).toBeCloseTo(PLANE_START + PLANE_SIDE, 12);
		expect(Math.max(...xy.map((c) => c[1]))).toBeCloseTo(PLANE_START + PLANE_SIDE, 12);
		expect(planeCorners(AXES, 'yz').every((c) => c[0] === 0)).toBe(true);
		expect(planeCorners(AXES, 'zx').every((c) => c[1] === 0)).toBe(true);
		expect(PLANE_AXES.xy.normal).toBe('z');
		expect(PLANE_AXES.yz.normal).toBe('x');
		expect(PLANE_AXES.zx.normal).toBe('y');
	});

	test('inside a polygon, by the even-odd rule', () => {
		const sq = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
			{ x: 0, y: 10 }
		];
		expect(insidePolygon({ x: 5, y: 5 }, sq)).toBe(true);
		expect(insidePolygon({ x: 11, y: 5 }, sq)).toBe(false);
		expect(insidePolygon({ x: 5, y: -1 }, sq)).toBe(false);
	});

	const axes = {
		x: [
			{ x: 100, y: 100 },
			{ x: 180, y: 100 }
		],
		y: [
			{ x: 100, y: 100 },
			{ x: 100, y: 20 }
		]
	};
	const planes = {
		xy: [
			{ x: 120, y: 80 },
			{ x: 140, y: 80 },
			{ x: 140, y: 60 },
			{ x: 120, y: 60 }
		]
	};

	test('a pointer in a plane square grabs the plane, on an arrow the arrow, else none', () => {
		expect(nearestGizmoHandle({ x: 130, y: 70 }, axes, planes, 'move', 12)).toBe('xy');
		expect(nearestGizmoHandle({ x: 150, y: 102 }, axes, planes, 'move', 12)).toBe('x');
		expect(nearestGizmoHandle({ x: 100, y: 40 }, axes, planes, 'move', 12)).toBe('y');
		expect(nearestGizmoHandle({ x: 160, y: 40 }, axes, planes, 'move', 12)).toBeNull();
	});

	test('rotate has no plane handles', () => {
		const ring = ringPoints([0, 0, 0], [0, 0, 1], 1).map((p) => ({ x: p[0] * 50, y: p[1] * 50 }));
		expect(nearestGizmoHandle({ x: 30, y: 30 }, { z: ring }, planes, 'rotate', 12)).not.toBe('xy');
	});

	test('a ray through the plane gives the distances along its two axes, and a drag moves in both', () => {
		// a camera 10 m up the z axis looking down at the xy plane through (1, 2, 0)
		const centre = [1, 2, 0] as const;
		const at = (x: number, y: number) => {
			const o = [0, 0, 10] as const;
			const d = [x - o[0], y - o[1], -10] as const;
			const l = Math.hypot(...d);
			return planeCoordinates(
				{ origin: o, dir: [d[0] / l, d[1] / l, d[2] / l] },
				centre,
				[1, 0, 0],
				[0, 1, 0]
			)!;
		};
		const start = at(1.4, 2.3);
		expect(start.u).toBeCloseTo(0.4, 9);
		expect(start.v).toBeCloseTo(0.3, 9);
		const now = at(1.9, 1.5);
		// the drag from start to now: +0.5 along x and -0.8 along y at once
		expect(now.u - start.u).toBeCloseTo(0.5, 9);
		expect(now.v - start.v).toBeCloseTo(-0.8, 9);
	});

	test('a ray parallel to the plane, or crossing it behind, gives nothing', () => {
		expect(
			planeCoordinates({ origin: [0, 0, 5], dir: [1, 0, 0] }, [0, 0, 0], [1, 0, 0], [0, 1, 0])
		).toBeNull();
		expect(
			planeCoordinates({ origin: [0, 0, 5], dir: [0, 0, 1] }, [0, 0, 0], [1, 0, 0], [0, 1, 0])
		).toBeNull();
	});

	test('the kit draws three squares in Move and none in Rotate', () => {
		const kit = new GizmoKit();
		const gizmo = {
			group: 'main',
			mode: 'move' as const,
			position: [0, 0, 0] as [number, number, number],
			axes: AXES as unknown as [
				[number, number, number],
				[number, number, number],
				[number, number, number]
			],
			active: 'xy' as const
		};
		kit.set(gizmo);
		const squares = () =>
			kit.root.children.filter(
				(c) =>
					c.type === 'Mesh' &&
					(c as unknown as { geometry: { type: string } }).geometry.type === 'PlaneGeometry'
			);
		expect(squares()).toHaveLength(3);
		expect(squares().every((m) => m.visible)).toBe(true);
		kit.set({ ...gizmo, mode: 'rotate' });
		expect(squares().every((m) => !m.visible)).toBe(true);
		kit.dispose();
	});
});
