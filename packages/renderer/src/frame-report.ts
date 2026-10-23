/**
 * The frame-interval report of the 120 Hz measurements (plan 392, ADR 0330: the target is the p95
 * of the frame interval, not an average): percentiles, the share of frames over a budget and
 * whether a lock held. Pure: the scripts feed it the intervals they recorded.
 */

export interface FrameReport {
	frames: number;
	meanMs: number;
	p50Ms: number;
	p95Ms: number;
	p99Ms: number;
	worstMs: number;
	/** Share (0..1) of frames longer than 16.7 ms: a missed 60. */
	over16: number;
	/** Share of frames longer than 8.4 ms: a missed 120. */
	over8: number;
	/** The frame rate the mean interval gives. */
	meanFps: number;
}

/** A percentile `q` in [0, 1] of `sorted` (ascending), by linear interpolation between ranks. */
export function percentile(sorted: readonly number[], q: number): number {
	if (sorted.length === 0) return 0;
	const at = Math.min(1, Math.max(0, q)) * (sorted.length - 1);
	const lo = Math.floor(at);
	const hi = Math.ceil(at);
	return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

export const FRAME_60_MS = 1000 / 60;
export const FRAME_120_MS = 1000 / 120;
/** A frame interval counts as over a budget only past this slack, ms (rAF timestamps jitter by a fraction of a millisecond). */
export const JITTER_MS = 0.25;

/** The report of a series of frame intervals, ms. */
export function frameReport(intervalsMs: readonly number[]): FrameReport {
	const n = intervalsMs.length;
	if (n === 0) {
		return {
			frames: 0,
			meanMs: 0,
			p50Ms: 0,
			p95Ms: 0,
			p99Ms: 0,
			worstMs: 0,
			over16: 0,
			over8: 0,
			meanFps: 0
		};
	}
	const sorted = [...intervalsMs].sort((a, b) => a - b);
	const mean = intervalsMs.reduce((a, b) => a + b, 0) / n;
	const share = (budget: number): number =>
		intervalsMs.filter((v) => v > budget + JITTER_MS).length / n;
	return {
		frames: n,
		meanMs: mean,
		p50Ms: percentile(sorted, 0.5),
		p95Ms: percentile(sorted, 0.95),
		p99Ms: percentile(sorted, 0.99),
		worstMs: sorted[n - 1]!,
		over16: share(FRAME_60_MS),
		over8: share(FRAME_120_MS),
		meanFps: 1000 / mean
	};
}

/** Whether a lock at `hz` held: the p95 interval within the lock's frame time (and its jitter). */
export const lockHeld = (r: FrameReport, hz: number): boolean =>
	r.frames > 0 && r.p95Ms <= 1000 / hz + JITTER_MS;

/**
 * The frame intervals of a rAF timestamp series, ms: the differences between neighbours. A gap of
 * over a second (a hidden tab, a stall to be ignored) is cut.
 */
export function intervalsOf(timestamps: readonly number[], maxGapMs = 1000): number[] {
	const out: number[] = [];
	for (let i = 1; i < timestamps.length; i++) {
		const d = timestamps[i]! - timestamps[i - 1]!;
		if (d > 0 && d <= maxGapMs) out.push(d);
	}
	return out;
}
