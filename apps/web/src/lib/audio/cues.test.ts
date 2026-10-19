/**
 * The cue table and the director's cues (plan 227, ADR 0210): every cue has a visual sign and a gain
 * under the bus limit; an old settings profile gets Music 0.25; explosions play once per destroyed
 * part and never more than 4 at once; a hard landing is heard as a touchdown.
 */
import { describe, expect, it } from 'vitest';
import { parseSettings } from '../settings/settings';
import { BUS_LIMIT, CUES, CUE_IDS, EXPLOSION_MAX, musicForPath } from './cues';
import { createDirector, type AudioFlightView } from './director';
import type { AudioEngine, OneShot } from './engine';

function fakeEngine() {
	const shots: Array<{ kind: OneShot; intensity?: number }> = [];
	const engine = {
		state: 'running',
		activeShots: 0,
		setVolumes() {},
		setFlight() {},
		setMusic() {},
		oneShot(kind: OneShot, intensity?: number) {
			shots.push({ kind, intensity });
		},
		level: () => 0,
		dispose() {}
	} as unknown as AudioEngine;
	return { engine, shots };
}

const view = (radar: number | null): AudioFlightView => ({
	throttle: 0,
	engineOn: false,
	altitude: 100,
	speed: 0,
	heat: 0,
	atmosphere: undefined,
	radar
});

describe('the cue table (plan 227)', () => {
	it('gives every cue a visual sign and a gain within the bus limit', () => {
		expect(CUE_IDS.length).toBeGreaterThanOrEqual(13);
		for (const id of CUE_IDS) {
			const cue = CUES[id];
			expect(cue.visual.trim().length, id).toBeGreaterThan(5);
			expect(cue.gain, id).toBeGreaterThan(0);
			expect(cue.gain, id).toBeLessThanOrEqual(BUS_LIMIT);
		}
	});

	it('gives an old settings profile the quiet Music default', () => {
		const old = parseSettings(
			JSON.stringify({
				v: 2,
				units: 'metric',
				tutorial: { status: 'done', step: 0 },
				bindings: {},
				audio: { master: 0.5, effects: 0.8, ui: 0.6, muted: false },
				touch: 'auto'
			})
		);
		expect(old.audio.music).toBe(0.25);
		expect(old.audio.master).toBe(0.5);
		const v4 = parseSettings(
			JSON.stringify({ ...old, audio: { master: 0.5, effects: 0.8, ui: 0.6, muted: false } })
		);
		expect(v4.audio.music).toBe(0.25);
	});

	it('picks a music bed per page', () => {
		expect(musicForPath('/')).toBe('menu');
		expect(musicForPath('/space-center')).toBe('space-center');
		expect(musicForPath('/vab')).toBe('hangar');
		expect(musicForPath('/flight')).toBe('space');
		expect(musicForPath('/credits')).toBeNull();
	});
});

describe('the director (plan 227)', () => {
	it('plays an explosion once per destroyed part, never more than 4 at once', () => {
		const { engine, shots } = fakeEngine();
		const d = createDirector(engine);
		// a breakup: six parts destroyed in the same instant
		const played = [0, 1, 2, 3, 4, 5].map(() => d.cue('explosion', 1, 1000));
		expect(played.filter(Boolean)).toHaveLength(EXPLOSION_MAX);
		expect(shots.filter((s) => s.kind === 'explosion')).toHaveLength(EXPLOSION_MAX);
		// later ones sound again once the first have died away
		expect(d.cue('explosion', 1, 3000)).toBe(true);
		expect(d.played.explosion).toBe(EXPLOSION_MAX + 1);
	});

	it('hears a touchdown in the radar altitude, scaled by its speed, once', () => {
		const { engine, shots } = fakeEngine();
		const seen: number[] = [];
		const d = createDirector(engine, { onCue: (_id, x) => seen.push(x.speed ?? 0) });
		// falling 6 m/s: radar readings 100 ms apart
		let t = 0;
		for (const h of [3, 2.4, 1.8, 1.2, 0.6, 0, 0, 0]) {
			d.frame(t, view(h), 1, false);
			t += 100;
		}
		const touch = shots.filter((s) => s.kind === 'touchdown');
		expect(touch).toHaveLength(1);
		expect(seen[0]).toBeCloseTo(6, 6);
		expect(touch[0]!.intensity).toBeCloseTo(6 / 8, 6);
		expect(d.played.touchdown).toBe(1);
	});

	it('does not hear a touchdown while warping or when the ground rises slowly', () => {
		const { engine, shots } = fakeEngine();
		const d = createDirector(engine);
		let t = 0;
		for (const h of [1.2, 1.15, 1.1, 0.3]) {
			// 0.1 m per 100 ms then a step: slow except the last, which is warped
			d.frame(t, view(h), h === 0.3 ? 100 : 1, false);
			t += 100;
		}
		expect(shots.some((s) => s.kind === 'touchdown')).toBe(false);
	});
});
