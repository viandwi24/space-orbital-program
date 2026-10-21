/** Plan 294: the performance overlay's ring buffer, frame window, spike rule and formats. */
import type { Renderer } from '@orbital/renderer';
import { describe, expect, it } from 'vitest';
import {
	FrameWindow,
	PerfSource,
	Ring,
	formatCount,
	formatFps,
	formatMb,
	formatMs,
	formatRenderer,
	isSpike
} from './perf-stats';

describe('Ring', () => {
	it('keeps the newest values oldest first and drops the oldest when full', () => {
		const r = new Ring(3);
		expect(r.length).toBe(0);
		expect(r.at(0)).toBeNaN();
		r.push(1);
		r.push(2);
		expect([r.at(0), r.at(1)]).toEqual([1, 2]);
		r.push(3);
		r.push(4);
		r.push(5);
		expect(r.length).toBe(3);
		expect([r.at(0), r.at(1), r.at(2)]).toEqual([3, 4, 5]);
		expect(r.at(3)).toBeNaN();
		expect(r.at(-1)).toBeNaN();
	});

	it('gives the largest finite value and clears', () => {
		const r = new Ring(4);
		expect(r.max()).toBe(0);
		r.push(2);
		r.push(Number.NaN);
		r.push(7);
		r.push(Number.POSITIVE_INFINITY);
		expect(r.max()).toBe(7);
		r.clear();
		expect(r.length).toBe(0);
		expect(r.max()).toBe(0);
	});
});

describe('FrameWindow', () => {
	it('drains the frames since the last drain: fps, median and longest interval', () => {
		const w = new FrameWindow();
		let t = 0;
		w.frame(t); // the first frame only sets the clock
		for (const dt of [16, 16, 17, 16, 50]) w.frame((t += dt));
		const d = w.drain();
		expect(d.frames).toBe(5);
		expect(d.fps).toBeCloseTo(5000 / 115, 6);
		expect(d.p50).toBe(16);
		expect(d.max).toBe(50);
		expect(w.drain()).toEqual({ frames: 0, fps: 0, p50: 0, max: 0 });
	});

	it('drops gaps such as a hidden tab', () => {
		const w = new FrameWindow();
		w.frame(0);
		w.frame(16);
		w.frame(5016);
		w.frame(5032);
		expect(w.drain().frames).toBe(2);
	});

	it('holds a bounded number of frames when nobody drains it', () => {
		const w = new FrameWindow();
		for (let i = 0; i <= 2000; i++) w.frame(i * 10);
		const d = w.drain();
		expect(d.frames).toBe(512);
		expect(d.p50).toBe(10);
	});
});

describe('isSpike', () => {
	it('needs a frame over the 60 fps budget and over twice the median', () => {
		expect(isSpike(16.7, 16.7)).toBe(false);
		expect(isSpike(40, 16.7)).toBe(true);
		// a steady 30 fps is slow, not a spike
		expect(isSpike(34, 33.3)).toBe(false);
		// a 120 Hz display's double frame stays under the 60 fps budget
		expect(isSpike(16.6, 8.3)).toBe(false);
	});
});

describe('formats', () => {
	it('formats milliseconds, fps, counts and megabytes', () => {
		expect(formatMs(null)).toBe('—');
		expect(formatMs(Number.NaN)).toBe('—');
		expect(formatMs(0.42)).toBe('0.4');
		expect(formatMs(16.666)).toBe('16.7');
		expect(formatMs(123.4)).toBe('123');
		expect(formatFps(0)).toBe('—');
		expect(formatFps(59.6)).toBe('60');
		expect(formatCount(950)).toBe('950');
		expect(formatCount(1234)).toBe('1.2k');
		expect(formatCount(34_567)).toBe('35k');
		expect(formatCount(1_500_000)).toBe('1.5M');
		expect(formatCount(-1)).toBe('—');
		expect(formatMb(null)).toBe('—');
		expect(formatMb(210 * 1_048_576)).toBe('210 MB');
	});

	it('formats the renderer line', () => {
		expect(formatRenderer({ backend: 'webgpu', preset: 'high', scale: 0.85, auto: true })).toBe(
			'WebGPU · high 85% auto'
		);
		expect(formatRenderer({ backend: 'webgl', preset: 'medium', scale: 1, auto: false })).toBe(
			'WebGL · medium 100% fixed'
		);
		expect(formatRenderer({ backend: null, preset: null, scale: 1, auto: null })).toBe(
			'— · — 100%'
		);
	});
});

describe('PerfSource', () => {
	it('samples the frames, the GPU time and the renderer counters, never the debug info', () => {
		let infos = 0;
		const renderer = {
			gpuFrameMs: 4.5,
			preset: 'high',
			debug: {
				counters: () => ({ renderer: 'webgpu', drawCalls: 120, triangles: 34_000 }),
				info: () => void infos++
			}
		} as unknown as Renderer;
		const src = new PerfSource();
		const view = { simMs: 0.8, scale: 0.85, auto: true };
		src.frames.frame(0);
		src.frames.frame(16);
		expect(src.sample(renderer, view)).toMatchObject({
			frames: 1,
			gpuMs: 4.5,
			simMs: 0.8,
			backend: 'webgpu',
			preset: 'high',
			scale: 0.85,
			auto: true,
			drawCalls: 120,
			triangles: 34_000
		});
		expect(src.sample(renderer, view).frames).toBe(0);
		expect(infos).toBe(0);
		expect(src.sample(null, view)).toMatchObject({ gpuMs: null, backend: null, drawCalls: 0 });
	});
});
