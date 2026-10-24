/**
 * The long-frame recorder (plan 408): a ring of the frames that took more than twice the usual
 * interval, each tagged with what was going on (a warm-up round, a shader compile, a governor step, an
 * autosave, a major GC) so that a stutter can be traced to its cause without a DevTools recording. It
 * runs on every page, not only while the Debug panel is open. Pure: the loops feed it.
 */

export type FrameCause = 'warm' | 'compile' | 'governor' | 'autosave' | 'rebake' | 'gc' | 'unknown';

export interface LongFrame {
	/** `performance.now()` when the frame was drawn, ms. */
	at: number;
	/** The frame's interval, ms. */
	ms: number;
	cause: FrameCause;
}

/** A frame is long over this many times the running interval. */
export const LONG_FACTOR = 2;
/** A longer interval is a pause (a hidden tab), not a frame. */
export const LONG_MAX_MS = 5_000;
/** A mark counts for a frame it came before by no more than this, ms. */
const MARK_SLACK_MS = 50;
/** A heap that dropped by this much between two frames was collected. */
const GC_DROP_BYTES = 20 * 1024 * 1024;

export class LongFrameLog {
	private readonly ring: LongFrame[] = [];
	private head = 0;
	private typical = 16.7;
	private last = NaN;
	private heap: number | null = null;
	private readonly marks = new Map<FrameCause, number>();
	/** Frames recorded since the start, including those that fell out of the ring. */
	total = 0;

	constructor(readonly capacity = 64) {}

	/** Something that can stall a frame happened now (or at `at`). */
	mark(cause: FrameCause, at: number): void {
		this.marks.set(cause, at);
	}

	/** A frame drawn at `now`; `heapBytes` where the browser says (a drop says a major GC ran). */
	frame(now: number, heapBytes: number | null = null): LongFrame | null {
		const interval = now - this.last;
		this.last = now;
		const heapDrop = this.heap !== null && heapBytes !== null ? this.heap - heapBytes : 0;
		this.heap = heapBytes;
		if (!(interval > 0) || interval > LONG_MAX_MS) return null;
		const long = interval > LONG_FACTOR * this.typical;
		// the running interval follows normal frames; a long one pulls it by at most its own cap
		this.typical += (Math.min(interval, 1.5 * this.typical) - this.typical) * 0.02;
		if (!long) return null;
		let cause: FrameCause = 'unknown';
		let best = -Infinity;
		for (const [c, at] of this.marks) {
			if (at <= now && at >= now - interval - MARK_SLACK_MS && at > best) {
				best = at;
				cause = c;
			}
		}
		if (cause === 'unknown' && heapDrop > GC_DROP_BYTES) cause = 'gc';
		const entry: LongFrame = { at: now, ms: interval, cause };
		if (this.ring.length < this.capacity) this.ring.push(entry);
		else {
			this.ring[this.head] = entry;
			this.head = (this.head + 1) % this.capacity;
		}
		this.total++;
		return entry;
	}

	/** The recorded frames, oldest first. */
	list(): LongFrame[] {
		return [...this.ring.slice(this.head), ...this.ring.slice(0, this.head)];
	}

	/** Long frames per cause since `since` (`performance.now()` ms). */
	counts(since = 0): Record<FrameCause, number> {
		const out: Record<FrameCause, number> = {
			warm: 0,
			compile: 0,
			governor: 0,
			autosave: 0,
			rebake: 0,
			gc: 0,
			unknown: 0
		};
		for (const f of this.ring) if (f.at >= since) out[f.cause]++;
		return out;
	}

	clear(): void {
		this.ring.length = 0;
		this.head = 0;
		this.total = 0;
		this.marks.clear();
	}
}
