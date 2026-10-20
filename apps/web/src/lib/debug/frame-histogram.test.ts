import { describe, expect, it } from 'vitest';
import {
	BUDGET_30_MS,
	BUDGET_60_MS,
	FrameHistogram,
	GAP_MS,
	HISTOGRAM_WINDOW_MS,
	JITTER_MS,
	percentile
} from './frame-histogram';

describe('percentile (nearest rank)', () => {
	it('picks the value at ceil(p n)', () => {
		const xs = Array.from({ length: 100 }, (_, i) => i + 1);
		expect(percentile(xs, 0.5)).toBe(50);
		expect(percentile(xs, 0.95)).toBe(95);
		expect(percentile(xs, 0.99)).toBe(99);
		expect(percentile(xs, 1)).toBe(100);
		expect(percentile(xs, 0)).toBe(1);
		expect(percentile([7], 0.99)).toBe(7);
		expect(percentile([], 0.5)).toBe(0);
	});
});

describe('the frame histogram', () => {
	const feed = (h: FrameHistogram, intervals: number[], start = 0): number => {
		let t = start;
		for (const i of intervals) {
			t += i;
			h.add(t, i);
		}
		return t;
	};

	it('steady 60 fps: every percentile at the interval, nothing over budget', () => {
		const h = new FrameHistogram();
		const t = feed(h, Array(600).fill(BUDGET_60_MS - 0.2));
		const s = h.summary(t);
		expect(s.count).toBe(600);
		expect(s.p50).toBeCloseTo(BUDGET_60_MS - 0.2, 9);
		expect(s.p99).toBeCloseTo(BUDGET_60_MS - 0.2, 9);
		expect(s.over60).toBe(0);
		expect(s.over30).toBe(0);
	});

	it('a steady 60 fps, whose timestamps read 16.6 to 16.8 ms, is not over budget', () => {
		const h = new FrameHistogram();
		const t = feed(
			h,
			Array.from({ length: 600 }, (_, i) => (i % 2 === 0 ? 16.8 : 16.6))
		);
		const s = h.summary(t);
		expect(s.over60).toBe(0);
		expect(16.8).toBeLessThan(BUDGET_60_MS + JITTER_MS);
		// a frame that took 1.5 periods is over
		const late = new FrameHistogram();
		feed(late, [16.7, 16.7, 25, 16.7]);
		expect(late.summary(1000).over60).toBeCloseTo(0.25, 9);
	});

	it('a few long frames show in p99 and the over-budget shares, not in the median', () => {
		const h = new FrameHistogram();
		// 97 smooth frames, 2 at 25 ms (over 60 fps), 1 at 50 ms (over 30 fps too)
		const t = feed(h, [...Array(97).fill(16), 25, 25, 50]);
		const s = h.summary(t);
		expect(s.p50).toBe(16);
		expect(s.p95).toBe(16);
		expect(s.p99).toBe(25);
		expect(s.over60).toBeCloseTo(0.03, 9);
		expect(s.over30).toBeCloseTo(0.01, 9);
		expect(25).toBeGreaterThan(BUDGET_60_MS);
		expect(25).toBeLessThan(BUDGET_30_MS);
	});

	it('covers the last two minutes only', () => {
		const h = new FrameHistogram();
		let t = feed(h, Array(100).fill(100)); // slow frames at the start
		t = feed(h, Array(7_500).fill(16), t + 1); // two minutes of fast ones
		const s = h.summary(t + HISTOGRAM_WINDOW_MS / 100);
		expect(s.p99).toBe(16);
		expect(s.seconds).toBeLessThanOrEqual(HISTOGRAM_WINDOW_MS / 1000);
	});

	it('drops gaps (a hidden tab) and bad values, and resets', () => {
		const h = new FrameHistogram();
		h.add(1, GAP_MS + 1);
		h.add(2, 0);
		h.add(3, Number.NaN);
		expect(h.summary(3).count).toBe(0);
		h.add(10, 16);
		expect(h.summary(10).count).toBe(1);
		h.reset();
		expect(h.summary(10).count).toBe(0);
	});
});
