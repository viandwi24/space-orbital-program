/**
 * The performance overlay's numbers (plan 294): a per-frame window the render loop feeds with one
 * typed-array write, drained about ten times a second into a sample; fixed-size rings of samples for
 * the graphs; the spike rule and the overlay's number formats. Pure: the loops feed it, the overlay
 * reads it.
 */
import { BUDGET_60_MS, GAP_MS, JITTER_MS, percentile } from '../debug/frame-histogram';
import type { Renderer, RendererBackend } from '@orbital/renderer';
import { LongFrameLog, type FrameCause } from './long-frames';

/** A fixed-capacity ring of numbers; the oldest falls out when it is full. */
export class Ring {
	private readonly data: Float64Array;
	private start = 0;
	private count = 0;

	constructor(readonly capacity: number) {
		this.data = new Float64Array(Math.max(1, Math.floor(capacity)));
	}

	get length(): number {
		return this.count;
	}

	push(v: number): void {
		const cap = this.data.length;
		if (this.count < cap) this.data[(this.start + this.count++) % cap] = v;
		else {
			this.data[this.start] = v;
			this.start = (this.start + 1) % cap;
		}
	}

	/** The `i`-th value, oldest first; NaN out of range. */
	at(i: number): number {
		if (i < 0 || i >= this.count) return NaN;
		return this.data[(this.start + i) % this.data.length]!;
	}

	/** The largest finite value, or 0 when there is none. */
	max(): number {
		let m = 0;
		for (let i = 0; i < this.count; i++) {
			const v = this.at(i);
			if (Number.isFinite(v) && v > m) m = v;
		}
		return m;
	}

	clear(): void {
		this.start = 0;
		this.count = 0;
	}
}

export interface FrameDrain {
	/** Frames drawn since the last drain. */
	frames: number;
	/** Frames per second over those frames' intervals; 0 for none. */
	fps: number;
	/** Median and longest frame interval, ms; 0 for none. */
	p50: number;
	max: number;
}

/** Most frames one drain holds; at 10 Hz this is far above any display rate. */
const WINDOW_FRAMES = 512;

/**
 * Frame intervals since the last drain. `add` is the only per-frame cost: one write into a
 * preallocated array. Gaps (a hidden tab, a pause) are dropped like the histogram drops them.
 */
export class FrameWindow {
	private readonly buf = new Float32Array(WINDOW_FRAMES);
	private n = 0;
	private last = NaN;

	/** A frame drawn at `now` (ms). */
	frame(now: number): void {
		const interval = now - this.last;
		this.last = now;
		if (interval > 0 && interval <= GAP_MS) this.buf[this.n++ % WINDOW_FRAMES] = interval;
	}

	drain(): FrameDrain {
		const n = Math.min(this.n, WINDOW_FRAMES);
		this.n = 0;
		if (n === 0) return { frames: 0, fps: 0, p50: 0, max: 0 };
		const sorted = Array.from(this.buf.subarray(0, n)).sort((a, b) => a - b);
		let sum = 0;
		for (const v of sorted) sum += v;
		return { frames: n, fps: (n * 1000) / sum, p50: percentile(sorted, 0.5), max: sorted[n - 1]! };
	}
}

/** A frame stands out: over the 60 fps budget (plus jitter) and over twice the median. */
export const isSpike = (max: number, p50: number): boolean =>
	max > BUDGET_60_MS + JITTER_MS && max > 2 * p50;

export interface PerfSample extends FrameDrain {
	/** GPU time per frame, ms; null where the renderer does not measure it (WebGL). */
	gpuMs: number | null;
	/** The sim's last step, ms; null before the first snapshot. */
	simMs: number | null;
	backend: RendererBackend | null;
	/** The preset drawn now (a governor step or the boot preset make it differ from the requested one, plan 408). */
	preset: string | null;
	/** The preset asked for, when it differs from the one drawn. */
	requested: string | null;
	/** Resolution scale, 0..1. */
	scale: number;
	/** The share of the canvas's side the 3D image is drawn at under TAAU; 0 or null when it is off. */
	taau: number | null;
	/** Whether the automatic quality governor runs; null where the view has none. */
	auto: boolean | null;
	drawCalls: number;
	triangles: number;
	/** The JS heap in use, bytes; null where the browser does not say. */
	heapBytes: number | null;
}

/** The JS heap in use where the browser reports it (Chromium's non-standard `performance.memory`). */
export function heapBytes(): number | null {
	const m = (globalThis.performance as { memory?: { usedJSHeapSize?: number } } | undefined)
		?.memory;
	return typeof m?.usedJSHeapSize === 'number' ? m.usedJSHeapSize : null;
}

/**
 * A view's overlay source: the frames it draws (`frames.frame(now)` once per drawn frame) and a
 * sample on demand. It reads the renderer's `debug.counters()`, never `debug.info()`: that one asks
 * WebGL for the GPU's name, which stalls the pipeline for tens of milliseconds (journal 294).
 */
export class PerfSource {
	readonly frames = new FrameWindow();
	/** The frames over twice the usual interval, with their causes (plan 408). */
	readonly longFrames = new LongFrameLog();

	constructor() {
		// the measuring scripts read the log of the page that is open (a development build)
		if (import.meta.env?.DEV)
			(globalThis as { __orbitalLongFrames?: () => LongFrameLog }).__orbitalLongFrames = () =>
				this.longFrames;
	}

	/** A frame was drawn at `now`: feeds the window and the long-frame log. */
	frame(now: number, renderer: Renderer | null = null): void {
		this.frames.frame(now);
		const report = renderer?.compiles;
		if (report) {
			// shader work counts as a cause for the frames around it
			if (report.pipelines.length !== this.pipelines) {
				this.pipelines = report.pipelines.length;
				this.mark('compile');
			}
			if (report.phase !== 'play') this.mark('warm');
		}
		this.longFrames.frame(now, heapBytes());
	}
	private pipelines = -1;

	/** Something that can stall a frame happened now. */
	mark(cause: FrameCause): void {
		this.longFrames.mark(cause, performance.now());
	}

	sample(
		renderer: Renderer | null,
		view: { simMs: number | null; scale: number; auto: boolean | null }
	): PerfSample {
		const counters = renderer?.debug.counters();
		return {
			...this.frames.drain(),
			gpuMs: renderer?.gpuFrameMs ?? null,
			simMs: view.simMs,
			backend: counters?.renderer ?? null,
			preset: renderer?.presetDrawn ?? renderer?.preset ?? null,
			requested:
				renderer && renderer.presetDrawn && renderer.presetDrawn !== renderer.preset
					? renderer.preset
					: null,
			taau: renderer?.taau ?? null,
			scale: view.scale,
			auto: view.auto,
			drawCalls: counters?.drawCalls ?? 0,
			triangles: counters?.triangles ?? 0,
			heapBytes: heapBytes()
		};
	}
}

const DASH = '—';

/** Milliseconds: one decimal under 100, none above; a dash for none. */
export function formatMs(v: number | null): string {
	if (v === null || !Number.isFinite(v)) return DASH;
	return v < 100 ? v.toFixed(1) : String(Math.round(v));
}

/** Frames per second as a whole number; a dash for none. */
export const formatFps = (v: number): string =>
	Number.isFinite(v) && v > 0 ? String(Math.round(v)) : DASH;

/** A count with k and M: 950, 1.2k, 34k, 1.5M. */
export function formatCount(v: number): string {
	if (!Number.isFinite(v) || v < 0) return DASH;
	if (v < 1000) return String(Math.round(v));
	if (v < 10_000) return `${(v / 1000).toFixed(1)}k`;
	if (v < 1_000_000) return `${Math.round(v / 1000)}k`;
	return `${(v / 1_000_000).toFixed(1)}M`;
}

/** Bytes as whole megabytes; a dash for none. */
export const formatMb = (v: number | null): string =>
	v === null || !Number.isFinite(v) ? DASH : `${Math.round(v / 1_048_576)} MB`;

/** The renderer line: `WebGPU · high 85% auto`. */
export function formatRenderer(
	s: Pick<PerfSample, 'backend' | 'preset' | 'scale' | 'auto'> &
		Partial<Pick<PerfSample, 'requested' | 'taau'>>
): string {
	const backend = s.backend === 'webgpu' ? 'WebGPU' : s.backend === 'webgl' ? 'WebGL' : DASH;
	const preset = s.preset ?? DASH;
	const auto = s.auto === null ? '' : s.auto ? ' auto' : ' fixed';
	const asked = s.requested ? ` (of ${s.requested})` : '';
	const taau = s.taau && s.taau > 0 ? ` TAAU ${Math.round(s.taau * 100)}%` : '';
	return `${backend} · ${preset}${asked} ${Math.round(s.scale * 100)}%${taau}${auto}`;
}
