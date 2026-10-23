/** Device tiers, the frame report and the pass timing maths (plan 392, ADR 0330). */
import { describe, expect, test } from 'bun:test';
import { budgetOf, deviceTier, refreshOf, targetHz, tierOf } from '../src/device-tier.ts';
import {
	FRAME_120_MS,
	FRAME_60_MS,
	frameReport,
	intervalsOf,
	lockHeld,
	percentile
} from '../src/frame-report.ts';
import { PassTag, parseTimestampUid, passTimes } from '../src/pass-timing.ts';

describe('device tiers', () => {
	const id = (gpu: string) => tierOf(gpu).id;
	test('Apple silicon: the M5 and the Pro, Max and Ultra are the 120 tier, the base M1 and M2 the 60 tier', () => {
		expect(id('Apple M5')).toBe('m5');
		expect(id('ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)')).toBe('m5');
		expect(id('Apple M2')).toBe('m2');
		expect(id('Apple M1')).toBe('m2');
		expect(id('Apple M2 Pro')).toBe('m5');
		// Chrome's adapter says only `apple` and `metal-3`: the display decides the lock
		expect(id('WebGPU: apple metal-3')).toBe('apple');
		expect(id('apple')).toBe('apple');
	});
	test('Windows machines: integrated, mid-range and high-end discrete', () => {
		expect(id('Intel(R) Iris(R) Xe Graphics')).toBe('integrated');
		expect(id('AMD Radeon 680M')).toBe('integrated');
		expect(id('NVIDIA GeForce GTX 1650')).toBe('discrete-mid');
		expect(id('NVIDIA GeForce RTX 3050')).toBe('discrete-mid');
		expect(id('NVIDIA GeForce RTX 3060')).toBe('discrete-high');
		expect(id('NVIDIA GeForce RTX 4070')).toBe('discrete-high');
		expect(id('AMD Radeon RX 6700 XT')).toBe('discrete-high');
		expect(id('AMD Radeon RX 580')).toBe('discrete-mid');
	});
	test('old integrated, software and phones are low; the rest unknown', () => {
		expect(id('Intel(R) UHD Graphics 620')).toBe('low');
		expect(id('Google SwiftShader')).toBe('low');
		expect(tierOf('Apple M5', true).id).toBe('low');
		expect(id('Mystery GPU')).toBe('unknown');
	});
	test('the lock is the tier cap or the display, whichever is lower', () => {
		expect(deviceTier({ gpu: 'Apple M5', refreshHz: 120 })).toMatchObject({
			hz: 120,
			preset: 'high'
		});
		expect(deviceTier({ gpu: 'Apple M5', refreshHz: 60 }).hz).toBe(60);
		expect(deviceTier({ gpu: 'Apple M2', refreshHz: 120 }).hz).toBe(60);
		expect(deviceTier({ gpu: 'WebGPU: apple metal-3', refreshHz: 120 }).hz).toBe(120);
		expect(deviceTier({ gpu: 'WebGPU: apple metal-3', refreshHz: 60 }).hz).toBe(60);
		expect(deviceTier({ gpu: 'Intel(R) Iris(R) Xe Graphics', refreshHz: 144 }).hz).toBe(60);
		expect(deviceTier({ gpu: 'Intel(R) UHD Graphics 620' }).hz).toBe(30);
		expect(targetHz(tierOf('RTX 3070'.replace('RTX', 'GeForce RTX')), 144)).toBe(120);
		expect(budgetOf(120)).toBeCloseTo(8.333, 3);
	});
	test('the refresh rate is the median rAF period, snapped', () => {
		expect(refreshOf(Array.from({ length: 50 }, () => 8.33))).toBe(120);
		expect(refreshOf([16.7, 16.6, 16.7, 33, 16.7])).toBe(60);
		expect(refreshOf([33.3, 33.4, 33.2])).toBe(30);
		expect(refreshOf([])).toBe(60);
		// a few long frames do not move it
		expect(refreshOf([...Array.from({ length: 40 }, () => 8.3), 40, 50, 60])).toBe(120);
	});
});

describe('the frame report', () => {
	test('percentiles interpolate between ranks', () => {
		const sorted = [1, 2, 3, 4, 5];
		expect(percentile(sorted, 0)).toBe(1);
		expect(percentile(sorted, 0.5)).toBe(3);
		expect(percentile(sorted, 1)).toBe(5);
		expect(percentile(sorted, 0.125)).toBeCloseTo(1.5, 9);
		expect(percentile([], 0.5)).toBe(0);
	});
	test('a steady 120 holds the lock; a 120 with one frame in ten missed does not, one in forty does', () => {
		const steady = Array.from({ length: 200 }, () => FRAME_120_MS);
		const r = frameReport(steady);
		expect(r.p95Ms).toBeCloseTo(8.333, 3);
		expect(r.over8).toBe(0);
		expect(r.over16).toBe(0);
		expect(r.meanFps).toBeCloseTo(120, 6);
		expect(lockHeld(r, 120)).toBe(true);
		const missed = steady.map((v, i) => (i % 10 === 0 ? 16.7 : v));
		const m = frameReport(missed);
		expect(m.over8).toBeCloseTo(0.1, 9);
		expect(m.over16).toBe(0);
		// one in ten is more than the p95 allows: the lock did not hold
		expect(m.p95Ms).toBeCloseTo(16.7, 6);
		expect(lockHeld(m, 120)).toBe(false);
		const rare = steady.map((v, i) => (i % 40 === 0 ? 16.7 : v));
		expect(lockHeld(frameReport(rare), 120)).toBe(true);
		const hurt = steady.map((v, i) => (i % 5 === 0 ? 25 : v));
		const h = frameReport(hurt);
		expect(h.p95Ms).toBe(25);
		expect(h.over16).toBeCloseTo(0.2, 9);
		expect(h.worstMs).toBe(25);
		expect(lockHeld(h, 60)).toBe(false);
	});
	test('a 60 lock allows the 16.7 ms frame and its jitter, an empty series holds nothing', () => {
		const r = frameReport(Array.from({ length: 100 }, () => FRAME_60_MS + 0.1));
		expect(lockHeld(r, 60)).toBe(true);
		expect(lockHeld(r, 120)).toBe(false);
		expect(lockHeld(frameReport([]), 60)).toBe(false);
	});
	test('intervals come from rAF timestamps, and a long gap is cut', () => {
		expect(intervalsOf([0, 8, 16, 24])).toEqual([8, 8, 8]);
		expect(intervalsOf([0, 10, 5000, 5010])).toEqual([10, 10]);
		expect(intervalsOf([100])).toEqual([]);
	});
});

describe('pass timing', () => {
	test('a timestamp uid splits into its kind, context and frame', () => {
		expect(parseTimestampUid('r:12:34:f5')).toEqual({ kind: 'render', context: '34', frame: 5 });
		expect(parseTimestampUid('c:3:7,8:f2')).toEqual({ kind: 'compute', context: '7,8', frame: 2 });
		expect(parseTimestampUid('nonsense')).toBeNull();
	});
	test('GPU time by pass: contexts are grouped by their pass and averaged over the frames', () => {
		const passOf = new Map([
			['10', 'planet'],
			['11', 'scene'],
			['12', 'scene'],
			['13', 'scene']
		]);
		// two frames: planet 4 ms each, scene 3 contexts of 1 ms, one context nobody claimed
		const stamps: Array<[string, number]> = [];
		for (const f of [1, 2]) {
			stamps.push(
				[`r:1:10:f${f}`, 4],
				[`r:2:11:f${f}`, 1],
				[`r:3:12:f${f}`, 1],
				[`r:4:13:f${f}`, 1]
			);
			stamps.push([`r:5:99:f${f}`, 0.5], [`c:1:20:f${f}`, 9]);
		}
		const t = passTimes(stamps, passOf, 2);
		expect(t.ms.planet).toBeCloseTo(4, 9);
		expect(t.ms.scene).toBeCloseTo(3, 9);
		expect(t.ms.other).toBeCloseTo(0.5, 9);
		expect(t.contexts.scene).toBeCloseTo(3, 9);
		expect(t.contexts.planet).toBeCloseTo(1, 9);
		expect(Object.keys(t.ms)).not.toContain('compute');
	});
	test('the tag nests and restores the pass', () => {
		const tag = new PassTag();
		expect(tag.current).toBe('');
		const seen: string[] = [];
		tag.within('scene', () => {
			seen.push(tag.current);
			tag.within('moon', () => seen.push(tag.current));
			seen.push(tag.current);
		});
		expect(seen).toEqual(['scene', 'moon', 'scene']);
		expect(tag.current).toBe('');
		expect(() =>
			tag.within('x', () => {
				throw new Error('boom');
			})
		).toThrow('boom');
		expect(tag.current).toBe('');
	});
});
