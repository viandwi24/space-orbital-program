/** Plan 040 / ADR 0078: the shock layer follows the stack's silhouette. */
import { describe, expect, test } from 'bun:test';
import {
	CAP_RINGS,
	PROFILE_BINS,
	SHELL_RINGS,
	SHELL_SEGMENTS,
	VISUAL_STANDOFF_GAIN,
	shellIndices,
	shellRings,
	silhouetteOfShape,
	silhouetteProfile,
	standoff,
	standoffRatio,
	writeShell,
	type SilhouettePart
} from '../src/effects/plasma-shape.ts';

const Q0 = { x: 0, y: 0, z: 0, w: 1 };
const part = (y: number, radius: number, halfLength: number, x = 0): SilhouettePart => ({
	position: { x, y, z: 0 },
	orientation: Q0,
	radius,
	halfLength
});

/** A narrow nose, a wide tank and a wide base: a pod on a stack with fat boosters at the tail. */
const stack = [
	part(5, 0.5, 0.5), // nose, y 4.5..5.5
	part(3, 0.625, 1), // tank
	part(1.2, 0.625, 0.6), // engine
	part(2.2, 0.4, 1.6, 1.0), // booster, off axis
	part(2.2, 0.4, 1.6, -1.0) // booster, other side
];

describe('silhouetteProfile', () => {
	test('nose first: the radius at the wide base is larger than at the nose', () => {
		const p = silhouetteProfile(stack, { x: 0, y: 1, z: 0 });
		expect(p.front).toBeCloseTo(5.5, 6);
		expect(p.radii.length).toBe(PROFILE_BINS);
		expect(p.radii[0]!).toBeCloseTo(0.5, 6); // the nose slice sees only the nose
		const wide = Math.max(...p.radii);
		expect(wide).toBeGreaterThan(1.3); // boosters at +-1 with radius 0.4
		expect(wide).toBeGreaterThan(p.radii[0]! * 2);
	});

	test('tail first: the order is reversed, the wide slices come first', () => {
		const p = silhouetteProfile(stack, { x: 0, y: -1, z: 0 });
		expect(p.front).toBeCloseTo(-0.6 + 0, 1); // the engine's tail end (y 0.6) is the front
		const up = silhouetteProfile(stack, { x: 0, y: 1, z: 0 });
		const rev = Array.from(up.radii).reverse();
		for (let i = 0; i < PROFILE_BINS; i++) expect(p.radii[i]!).toBeCloseTo(rev[i]!, 6);
		// the boosters end where the engine does, so the wide slices start at the tail and the nose is narrow
		expect(p.radii[PROFILE_BINS - 1]!).toBeCloseTo(0.5, 6);
		expect(p.radii[0]!).toBeGreaterThan(p.radii[PROFILE_BINS - 1]! * 2);
	});

	test('a single cylinder along the flow is its radius everywhere', () => {
		const p = silhouetteProfile([part(0, 0.7, 2)], { x: 0, y: 1, z: 0 });
		for (const r of p.radii) expect(r).toBeCloseTo(0.7, 9);
		expect(p.front - p.back).toBeCloseTo(4, 9);
	});

	test('the axis follows the stack when it is off to one side', () => {
		const p = silhouetteProfile([part(0, 0.5, 1, 3)], { x: 0, y: 1, z: 0 });
		for (const r of p.radii) expect(r).toBeCloseTo(0.5, 9);
		expect(Math.hypot(p.axisPoint.x, p.axisPoint.y, p.axisPoint.z)).toBeCloseTo(3, 9);
	});

	test('a cylinder across the flow is as wide as it is long', () => {
		const across: SilhouettePart = {
			position: { x: 0, y: 0, z: 0 },
			orientation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }, // axis +Y turned onto -X
			radius: 0.3,
			halfLength: 2
		};
		const p = silhouetteProfile([across], { x: 0, y: 1, z: 0 });
		expect(Math.max(...p.radii)).toBeGreaterThan(1.9);
		expect(p.front).toBeCloseTo(0.3, 6);
	});

	test('no parts gives an empty profile, not NaN', () => {
		const p = silhouetteProfile([], { x: 0, y: 1, z: 0 });
		expect(p.step).toBe(0);
		for (const r of p.radii) expect(r).toBe(0);
	});
});

describe('stand-off', () => {
	test('follows Billig 0.143 exp(3.24 / M^2) and falls as the Mach number rises', () => {
		for (const m of [2, 3, 5, 8, 20]) {
			expect(standoffRatio(m)).toBeCloseTo(0.143 * Math.exp(3.24 / (m * m)), 12);
		}
		expect(standoffRatio(5)).toBeGreaterThan(standoffRatio(10));
		expect(standoffRatio(10)).toBeGreaterThan(0.143);
		// held finite towards Mach 1
		expect(Number.isFinite(standoffRatio(1))).toBe(true);
		expect(standoffRatio(1)).toBe(standoffRatio(1.5));
	});

	test('scales with the nose radius and the airspeed through the Mach number', () => {
		expect(standoff(1, 3_400)).toBeCloseTo(standoffRatio(10), 12);
		expect(standoff(2, 3_400)).toBeCloseTo(2 * standoff(1, 3_400), 12);
	});
});

describe('shellRings', () => {
	const profile = silhouetteProfile(stack, { x: 0, y: 1, z: 0 });
	const rings = shellRings(profile, 2_200);

	test('has the fixed ring count and never turns back along the flow', () => {
		expect(rings.length).toBe(SHELL_RINGS);
		for (let i = 1; i < rings.length; i++) {
			expect(rings[i]!.s).toBeLessThanOrEqual(rings[i - 1]!.s + 1e-12);
		}
	});

	test('starts at a point in front of the nose by the visual stand-off', () => {
		const nose = Math.max(0.3, profile.radii[0]!);
		const delta = standoff(nose, 2_200) * VISUAL_STANDOFF_GAIN;
		expect(rings[0]!.r).toBe(0);
		expect(rings[0]!.s).toBeCloseTo(profile.front + delta, 9);
	});

	test('the shell is outside the vessel: at every slice at least the profile plus the stand-off', () => {
		const nose = Math.max(0.3, profile.radii[0]!);
		const delta = standoff(nose, 2_200) * VISUAL_STANDOFF_GAIN;
		for (let i = 0; i < PROFILE_BINS; i++) {
			const ring = rings[CAP_RINGS + 1 + i]!;
			expect(ring.r).toBeGreaterThanOrEqual(profile.radii[i]! + delta - 1e-9);
		}
	});

	test('follows the stack: wider where the stack is wider', () => {
		const narrow = rings[CAP_RINGS + 1]!.r;
		const widest = Math.max(...rings.map((r) => r.r));
		expect(widest).toBeGreaterThan(narrow * 1.5);
		// and a lone cylinder gives a nearly straight sleeve, not a ball
		const lone = shellRings(silhouetteProfile([part(0, 0.7, 2)], { x: 0, y: 1, z: 0 }), 2_200);
		const r0 = lone[CAP_RINGS + 1]!.r;
		const r9 = lone[CAP_RINGS + PROFILE_BINS]!.r;
		expect(r9 / r0).toBeLessThan(2.6);
	});

	test('thickens with the stand-off gain at lower Mach', () => {
		const slow = shellRings(profile, 700);
		expect(slow[0]!.s - profile.front).toBeGreaterThan(rings[0]!.s - profile.front);
	});
});

describe('writeShell', () => {
	test('fills every vertex with finite positions and unit-length normals, tip on the axis', () => {
		const profile = silhouetteProfile(stack, { x: 0, y: 1, z: 0 });
		const rings = shellRings(profile, 2_200);
		const n = SHELL_RINGS * (SHELL_SEGMENTS + 1);
		const pos = new Float32Array(n * 3);
		const nor = new Float32Array(n * 3);
		writeShell(rings, profile.front, pos, nor);
		for (let i = 0; i < n; i++) {
			expect(Number.isFinite(pos[i * 3]! + pos[i * 3 + 1]! + pos[i * 3 + 2]!)).toBe(true);
			expect(Math.hypot(nor[i * 3]!, nor[i * 3 + 1]!, nor[i * 3 + 2]!)).toBeGreaterThan(0.99);
		}
		// the tip ring is a single point
		expect(Math.hypot(pos[0]!, pos[2]!)).toBeCloseTo(0, 6);
		// normals on the cap point forward, on the sleeve outwards
		expect(nor[1]!).toBeGreaterThan(0.5);
		const sleeve = (CAP_RINGS + 4) * (SHELL_SEGMENTS + 1) * 3;
		expect(Math.hypot(nor[sleeve]!, nor[sleeve + 2]!)).toBeGreaterThan(0.7);
		expect(shellIndices().length).toBe((SHELL_RINGS - 1) * SHELL_SEGMENTS * 6);
	});

	test('building the profile and the rings for a 40-part stack takes well under 0.1 ms', () => {
		const big: SilhouettePart[] = Array.from({ length: 40 }, (_, i) => part(i * 0.8, 0.625, 0.4));
		const dir = { x: 0.05, y: 0.99, z: 0.1 };
		for (let i = 0; i < 50; i++) shellRings(silhouetteProfile(big, dir), 2_500); // warm up
		const runs = 400;
		const t0 = performance.now();
		for (let i = 0; i < runs; i++) shellRings(silhouetteProfile(big, dir), 2_500);
		const each = (performance.now() - t0) / runs;
		console.log(`plasma profile + rings, 40 parts: ${(each * 1000).toFixed(1)} us`);
		// a timing budget measured on the M5: CI runners only log the number
		if (!process.env.CI) expect(each).toBeLessThan(0.1);
	});
});

describe('silhouetteOfShape', () => {
	test('a cylinder is itself, a box uses its wider horizontal half side', () => {
		expect(silhouetteOfShape({ kind: 'cylinder', radius: 0.625, height: 2 })).toEqual({
			radius: 0.625,
			halfLength: 1
		});
		expect(silhouetteOfShape({ kind: 'box', size: { x: 3, y: 0.2, z: 1 } })).toEqual({
			radius: 1.5,
			halfLength: 0.1
		});
		expect(silhouetteOfShape(undefined)).toBeUndefined();
	});
});

describe('PlasmaEffect writes the shell into the buffers the GPU reads', () => {
	test('the geometry attributes hold the rings after an update (not a copy made at construction)', async () => {
		const { PlasmaEffect } = await import('../src/effects/plasma-mesh.ts');
		const fx = new PlasmaEffect();
		const profile = silhouetteProfile(stack, { x: 0, y: 1, z: 0 });
		const rings = shellRings(profile, 2_200);
		fx.update({
			intensity: 0.8,
			forward: { x: 0, y: 1, z: 0 },
			front: { x: 0, y: 6, z: 0 },
			extent: 6,
			radius: 1.5,
			shell: { rings, front: profile.front, origin: { x: 0, y: 5.5, z: 0 } },
			time: 0
		});
		const shell = fx.root.children[0] as import('three').Mesh;
		const pos = shell.geometry.getAttribute('position').array as Float32Array;
		let widest = 0;
		for (let i = 0; i < pos.length; i += 3)
			widest = Math.max(widest, Math.hypot(pos[i]!, pos[i + 2]!));
		expect(widest).toBeGreaterThan(1.3);
		expect(shell.position.y).toBe(5.5);
		// without part data it is a unit ball, scaled
		fx.update({
			intensity: 0.8,
			forward: { x: 0, y: 1, z: 0 },
			front: { x: 0, y: 6, z: 0 },
			extent: 6,
			radius: 1.5,
			time: 0
		});
		let ball = 0;
		for (let i = 0; i < pos.length; i += 3)
			ball = Math.max(ball, Math.hypot(pos[i]!, pos[i + 1]!, pos[i + 2]!));
		expect(ball).toBeCloseTo(1, 5);
		expect(shell.scale.x).toBeGreaterThan(1.6);
		fx.dispose();
	});
});
