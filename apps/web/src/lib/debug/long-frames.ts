/**
 * Long Animation Frames for the Debug panel (plan 396, ADR 0330 point 1): the last few frames the
 * browser reports as longer than 50 ms, each with the scripts that ran in it, so a hitch can be traced to
 * the code behind it. Chrome's `long-animation-frame` entries; elsewhere the log stays empty.
 */

/** The script attribution of one long frame, ms. */
export interface LongFrameScript {
	/** The script's file or the function that called it. */
	source: string;
	invoker: string;
	duration: number;
}

export interface LongFrame {
	/** `startTime`, ms since the page began. */
	start: number;
	duration: number;
	/** Time the main thread was blocked past 50 ms. */
	blocking: number;
	scripts: LongFrameScript[];
}

/** The fields of a `PerformanceLongAnimationFrameTiming` this reads. */
export interface LongFrameEntry {
	startTime: number;
	duration: number;
	blockingDuration?: number;
	scripts?: readonly {
		sourceURL?: string;
		sourceFunctionName?: string;
		invoker?: string;
		duration: number;
	}[];
}

/** How many long frames the log keeps. */
export const LONG_FRAMES_KEPT = 8;
/** The scripts listed per frame: the longest few. */
const SCRIPTS_PER_FRAME = 3;

const shortSource = (url: string): string => {
	const file = url.split('?')[0]!.split('/').pop() ?? url;
	return file || url;
};

export class LongFrameLog {
	private frames: LongFrame[] = [];
	/** Long frames seen since the log was made or cleared, kept or not. */
	total = 0;

	add(entry: LongFrameEntry): void {
		const scripts = [...(entry.scripts ?? [])]
			.sort((a, b) => b.duration - a.duration)
			.slice(0, SCRIPTS_PER_FRAME)
			.map((s) => ({
				source: s.sourceURL ? shortSource(s.sourceURL) : '',
				invoker: s.sourceFunctionName || s.invoker || '',
				duration: s.duration
			}));
		this.total++;
		this.frames.push({
			start: entry.startTime,
			duration: entry.duration,
			blocking: entry.blockingDuration ?? 0,
			scripts
		});
		if (this.frames.length > LONG_FRAMES_KEPT) this.frames.shift();
	}

	/** The kept frames, newest first. */
	recent(): LongFrame[] {
		return this.frames.slice().reverse();
	}

	clear(): void {
		this.frames = [];
		this.total = 0;
	}
}

/**
 * Starts feeding `log` from the browser's `long-animation-frame` entries (with those already
 * buffered). Returns the stop function, or null where the browser has no such entry type.
 */
export function observeLongFrames(log: LongFrameLog): (() => void) | null {
	if (typeof PerformanceObserver === 'undefined') return null;
	if (!PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')) return null;
	const observer = new PerformanceObserver((list) => {
		for (const e of list.getEntries()) log.add(e as unknown as LongFrameEntry);
	});
	observer.observe({ type: 'long-animation-frame', buffered: true });
	return () => observer.disconnect();
}

/** One line of the panel: "112 ms (62 blocking) · app.js render, flight-loop.js frame". */
export function describeLongFrame(f: LongFrame): string {
	const who = f.scripts
		.map(
			(s) => [s.source, s.invoker].filter(Boolean).join(' ') || `${s.duration.toFixed(0)} ms script`
		)
		.join(', ');
	return `${f.duration.toFixed(0)} ms (${f.blocking.toFixed(0)} blocking)${who ? ` · ${who}` : ''}`;
}
