import type { Vec3 } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import { drawNavball, type NavballTheme } from './hud/navball-draw';
import { referenceFor } from './hud/sas-model';
import { markerDirections, normalize, type MarkerKind } from './navball-math';
import { nextSpeedMode, speedReadout } from './speed';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const POS = v(700_000, 0, 0);
const VEL = v(0, 0, 2_300);
const body = { rotationPeriod: 21_600 };

describe('speed readout in target mode', () => {
	// The target is 1 km ahead (+z) and moves at 3 m/s relative to the vessel, away and sideways.
	const target = { position: v(0, 0, 1_000), velocity: v(0, 3, 4) };
	const base = { position: POS, velocity: VEL, altitude: 100_000, body };

	it('is the vessel velocity relative to the target, speed = relative speed, vertical = range rate', () => {
		const r = speedReadout({ ...base, preference: 'target', target });
		expect(r.mode).toBe('target');
		expect(r.velocity).toEqual(v(0, -3, -4));
		expect(r.speed).toBeCloseTo(5, 12);
		// d|p|/dt = p . w / |p| = 4 (the range opens at 4 m/s).
		expect(r.vertical).toBeCloseTo(4, 12);
	});

	it('closing reads negative', () => {
		const r = speedReadout({
			...base,
			preference: 'target',
			target: { position: v(0, 0, 1_000), velocity: v(0, 0, -2) }
		});
		expect(r.vertical).toBeCloseTo(-2, 12);
		expect(r.speed).toBeCloseTo(2, 12);
	});

	it('falls back to auto without a target, and auto never picks target', () => {
		expect(speedReadout({ ...base, preference: 'target' }).mode).toBe('orbit');
		expect(speedReadout({ ...base, preference: 'target', target: null }).mode).toBe('orbit');
		expect(speedReadout({ ...base, preference: 'auto', target }).mode).toBe('orbit');
	});

	it('V visits target only while there is a target', () => {
		expect(nextSpeedMode('orbit')).toBe('auto');
		expect(nextSpeedMode('orbit', true)).toBe('target');
		expect(nextSpeedMode('target', true)).toBe('auto');
		expect(nextSpeedMode('target')).toBe('auto');
	});

	it('is not a SAS reference', () => {
		expect(referenceFor('target')).toBe('orbit');
		expect(referenceFor('surface')).toBe('surface');
	});
});

describe('navball target markers', () => {
	const target = { position: v(0, 600, 800), velocity: v(0, 3, 4), relative: false };
	const kinds = (m: { kind: MarkerKind }[]): MarkerKind[] => m.map((x) => x.kind);

	it('target and anti-target along and against the relative position', () => {
		const m = markerDirections(POS, VEL, VEL, undefined, target);
		const t = m.find((x) => x.kind === 'target')!;
		const a = m.find((x) => x.kind === 'anti-target')!;
		expect(t.dir).toEqual(normalize(v(0, 600, 800)));
		expect(a.dir.x).toBeCloseTo(0, 15);
		expect(a.dir.y).toBeCloseTo(-0.6, 12);
		expect(a.dir.z).toBeCloseTo(-0.8, 12);
		expect(kinds(m)).toContain('prograde');
		expect(kinds(m)).not.toContain('target-prograde');
	});

	it('in target mode the prograde pair is the relative one: along minus and plus the target velocity', () => {
		const rel = speedReadout({
			position: POS,
			velocity: VEL,
			altitude: 100_000,
			body,
			preference: 'target',
			target
		});
		const m = markerDirections(POS, VEL, rel.velocity, undefined, { ...target, relative: true });
		const pro = m.find((x) => x.kind === 'target-prograde')!;
		const retro = m.find((x) => x.kind === 'target-retrograde')!;
		expect(pro.dir.y).toBeCloseTo(-0.6, 12);
		expect(pro.dir.z).toBeCloseTo(-0.8, 12);
		expect(retro.dir.y).toBeCloseTo(0.6, 12);
		expect(retro.dir.z).toBeCloseTo(0.8, 12);
		expect(kinds(m)).not.toContain('prograde');
		expect(kinds(m)).not.toContain('retrograde');
		expect(kinds(m)).toContain('radial-out');
	});

	it('no relative-velocity markers below 0.5 m/s, the target markers stay', () => {
		const still = { position: v(0, 600, 800), velocity: v(0, 0.1, 0.1), relative: true };
		const m = markerDirections(POS, VEL, v(0, -0.1, -0.1), undefined, still);
		expect(kinds(m)).toEqual(['target', 'anti-target']);
	});

	it('no target markers without a target or on top of it', () => {
		expect(kinds(markerDirections(POS, VEL, VEL))).not.toContain('target');
		const onTop = { position: v(0, 0, 0.2), velocity: v(0, 0, 0), relative: false };
		expect(kinds(markerDirections(POS, VEL, VEL, undefined, onTop))).not.toContain('target');
	});
});

describe('navball painter', () => {
	it('draws every marker kind without throwing', () => {
		const calls: string[] = [];
		const ctx = new Proxy(
			{},
			{
				get: (_t, name: string) => {
					if (name === 'createLinearGradient' || name === 'createRadialGradient')
						return () => ({ addColorStop: () => undefined });
					return (..._a: unknown[]) => void calls.push(name);
				},
				set: () => true
			}
		) as unknown as CanvasRenderingContext2D;
		const theme: NavballTheme = {
			skyTop: '#000',
			skyBottom: '#000',
			groundTop: '#000',
			groundBottom: '#000',
			line: '#fff',
			text: '#fff',
			accent: '#0ff',
			positive: '#0f0',
			violet: '#f0f',
			warning: '#ff0',
			target: '#f88'
		};
		const target = { position: v(0, 600, 800), velocity: v(0, 3, 4), relative: true };
		const markers = markerDirections(POS, VEL, v(0, -3, -4), v(0, 0, 5), target);
		expect(markers.map((m) => m.kind)).toEqual(
			expect.arrayContaining(['target', 'anti-target', 'target-prograde', 'target-retrograde'])
		);
		drawNavball(
			ctx,
			176,
			{ orientation: { x: 0, y: 0, z: 0, w: 1 }, position: POS, markers, heading: 0 },
			theme
		);
		expect(calls.filter((c) => c === 'rect').length).toBe(2);
	});
});
