/**
 * The frame-interval distribution of the flight view (plan 251): percentiles and the shares of frames
 * over the 60 and 30 fps budgets, over a sliding window. A mean hides the stutter a player feels, so
 * the Debug panel shows p50, p95 and p99. Pure: the flight loop feeds it, the panel reads it.
 */

/** Frames over these intervals count as missed: 60 fps and 30 fps, ms. */
export const BUDGET_60_MS = 1000 / 60;
export const BUDGET_30_MS = 1000 / 30;

/** The window the numbers cover, ms (two minutes). */
export const HISTOGRAM_WINDOW_MS = 120_000;

/** Intervals longer than this are a hidden tab or a pause, not a frame: they are not counted. */
export const GAP_MS = 1000;

export interface FrameSummary {
	/** Frames in the window. */
	count: number;
	/** Seconds the window covers (up to the full window). */
	seconds: number;
	p50: number;
	p95: number;
	p99: number;
	/** Shares of frames, 0..1, whose interval is over 16.7 ms and over 33.3 ms. */
	over60: number;
	over30: number;
}

export const EMPTY_SUMMARY: FrameSummary = {
	count: 0,
	seconds: 0,
	p50: 0,
	p95: 0,
	p99: 0,
	over60: 0,
	over30: 0
};

/** The `p`-th percentile (0..1) of an ascending list by the nearest-rank rule; 0 for none. */
export function percentile(sorted: readonly number[], p: number): number {
	if (sorted.length === 0) return 0;
	const rank = Math.ceil(Math.min(Math.max(p, 0), 1) * sorted.length);
	return sorted[Math.max(0, rank - 1)]!;
}

export class FrameHistogram {
	private times: number[] = [];
	private intervals: number[] = [];

	constructor(private readonly windowMs = HISTOGRAM_WINDOW_MS) {}

	/** Adds one frame that ended at `now` (ms) after `interval` ms; gaps and non-positive values are dropped. */
	add(now: number, interval: number): void {
		if (!(interval > 0) || interval > GAP_MS) return;
		this.times.push(now);
		this.intervals.push(interval);
		this.prune(now);
	}

	private prune(now: number): void {
		const from = now - this.windowMs;
		let drop = 0;
		while (drop < this.times.length && this.times[drop]! < from) drop++;
		if (drop > 0) {
			this.times = this.times.slice(drop);
			this.intervals = this.intervals.slice(drop);
		}
	}

	reset(): void {
		this.times = [];
		this.intervals = [];
	}

	summary(now: number): FrameSummary {
		this.prune(now);
		const n = this.intervals.length;
		if (n === 0) return EMPTY_SUMMARY;
		const sorted = [...this.intervals].sort((a, b) => a - b);
		let over60 = 0;
		let over30 = 0;
		for (const v of sorted) {
			if (v > BUDGET_60_MS) over60++;
			if (v > BUDGET_30_MS) over30++;
		}
		return {
			count: n,
			seconds: Math.min(this.windowMs, now - this.times[0]!) / 1000,
			p50: percentile(sorted, 0.5),
			p95: percentile(sorted, 0.95),
			p99: percentile(sorted, 0.99),
			over60: over60 / n,
			over30: over30 / n
		};
	}
}
