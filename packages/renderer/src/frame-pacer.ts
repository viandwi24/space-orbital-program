/**
 * The frame-rate limit (Settings → Graphics, plan 362) for loops without the quality governor: the
 * Space Center, Mission Center and Hangar. The governor's rule: a rAF is drawn once 0.9 of the period
 * has passed since the last drawn one, so a 60 Hz cap on a 120 Hz display draws every second rAF.
 */
export class FramePacer {
	private cap: number | null = null;
	private last: number | null = null;
	private since = 0;

	/** Frames per second, or null for the display's rate. */
	setCap(fps: number | null): void {
		this.cap = fps !== null && Number.isFinite(fps) && fps > 0 ? fps : null;
	}

	/** Whether to draw the rAF at `now` (ms, the rAF's timestamp). */
	due(now: number): boolean {
		const dt = this.last === null ? Number.POSITIVE_INFINITY : now - this.last;
		this.last = now;
		if (this.cap === null) return true;
		this.since += dt;
		// a long gap (a hidden tab) draws at once, as the governor's `ignoreOverMs`
		if (this.since < 0.9 * (1000 / this.cap) && this.since <= 250) return false;
		this.since = 0;
		return true;
	}
}
