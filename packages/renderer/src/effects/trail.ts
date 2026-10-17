/**
 * The exhaust trail that hangs in the air (plan 040, ADR 0080): points sampled along the path of
 * an engine in the body-fixed frame (the air turns with the ground), drifted by the wind, widening
 * and fading with age, drawn as one camera-facing ribbon. Pure state and arithmetic; the effects
 * system owns the GPU buffers.
 */
import { clamp, smoothstep } from '../vec.ts';

/** A new point when the engine has moved this far from the last one, m (a fast rocket makes about 10 a second). */
export const TRAIL_SPACING = 30;
/** ... or when this long has passed (a slow or hovering engine), s of simulated time. */
export const TRAIL_MAX_INTERVAL = 0.5;
/** Points of one trail: 25 s of a rocket at 300 m/s, the whole 45 s of one at 100 m/s. */
export const TRAIL_CAPACITY = 256;
/** Seconds of simulated time a point stays. */
export const TRAIL_LIFETIME = 45;
/** Trails drawn at once. */
export const MAX_TRAILS = 4;
/** Share of the wind's speed a point drifts at (smoke is a little slower than the air). */
export const TRAIL_DRIFT = 0.9;
/** The ribbon is this many times wider at the end of its life than at the start. */
export const TRAIL_GROWTH = 5;
/** Ribbon vertices per point. */
export const VERTICES_PER_POINT = 2;

/** Visible density of the trail for the ambient pressure as a share of surface pressure: none in thin air. */
export const trailDensity = (pressureRatio: number): number =>
	smoothstep(0.004, 0.12, pressureRatio);

/** Width of the ribbon at `age` for a starting width `w0`, m. */
export function trailWidth(w0: number, age: number): number {
	const t = clamp(age / TRAIL_LIFETIME, 0, 1);
	return w0 * (1 + (TRAIL_GROWTH - 1) * (1 - (1 - t) * (1 - t)));
}

/** Opacity factor at `age`: a short fade-in at the nozzle, a long fade-out. */
export function trailAlpha(age: number): number {
	const t = clamp(age / TRAIL_LIFETIME, 0, 1);
	const fadeIn = smoothstep(0, 0.6, age);
	return fadeIn * Math.pow(1 - t, 1.6);
}

export type TrailWind = (x: number, y: number, z: number, out: [number, number, number]) => void;

export class TrailBuffer {
	/** Points, oldest first. Body-fixed metres. */
	readonly x = new Float64Array(TRAIL_CAPACITY);
	readonly y = new Float64Array(TRAIL_CAPACITY);
	readonly z = new Float64Array(TRAIL_CAPACITY);
	readonly age = new Float64Array(TRAIL_CAPACITY);
	/** Starting width and opacity of each point. */
	readonly w0 = new Float64Array(TRAIL_CAPACITY);
	readonly density = new Float64Array(TRAIL_CAPACITY);
	count = 0;
	private sinceLast = Number.POSITIVE_INFINITY;

	/**
	 * Offers the engine's position. A point is kept when it is `TRAIL_SPACING` from the last one or
	 * `TRAIL_MAX_INTERVAL` has passed; the oldest is dropped when the buffer is full. Returns whether
	 * a point was added. `dt` is the simulated time since the last offer.
	 */
	add(x: number, y: number, z: number, width: number, density: number, dt: number): boolean {
		this.sinceLast += Math.max(0, dt);
		const last = this.count - 1;
		const moved =
			last < 0
				? Number.POSITIVE_INFINITY
				: Math.hypot(x - this.x[last]!, y - this.y[last]!, z - this.z[last]!);
		if (moved < TRAIL_SPACING && this.sinceLast < TRAIL_MAX_INTERVAL) return false;
		if (this.count === TRAIL_CAPACITY) this.dropOldest(1);
		const i = this.count++;
		this.x[i] = x;
		this.y[i] = y;
		this.z[i] = z;
		this.age[i] = 0;
		this.w0[i] = width;
		this.density[i] = density;
		this.sinceLast = 0;
		return true;
	}

	/** Ages every point, drifts it with the wind and drops the points past their life. */
	step(dt: number, wind?: TrailWind): void {
		if (!(dt > 0)) return;
		const w: [number, number, number] = [0, 0, 0];
		for (let i = 0; i < this.count; i++) {
			this.age[i]! += dt;
			if (wind) {
				wind(this.x[i]!, this.y[i]!, this.z[i]!, w);
				this.x[i]! += w[0] * dt * TRAIL_DRIFT;
				this.y[i]! += w[1] * dt * TRAIL_DRIFT;
				this.z[i]! += w[2] * dt * TRAIL_DRIFT;
			}
		}
		let dead = 0;
		while (dead < this.count && this.age[dead]! >= TRAIL_LIFETIME) dead++;
		if (dead > 0) this.dropOldest(dead);
	}

	private dropOldest(n: number): void {
		const keep = this.count - n;
		for (const a of [this.x, this.y, this.z, this.age, this.w0, this.density]) {
			a.copyWithin(0, n, this.count);
		}
		this.count = Math.max(0, keep);
	}

	/** Seconds of simulated time since the newest point was added; infinite when empty. */
	get idle(): number {
		return this.sinceLast;
	}

	digest(): string {
		let h = 0;
		for (let i = 0; i < this.count; i++) {
			h = (h * 31 + Math.round(this.x[i]! * 1e3) + Math.round(this.y[i]! * 1e3)) | 0;
		}
		return `${this.count}:${h}`;
	}
}

/** Floats per ribbon vertex: centre (3), tangent (3), side (1), width (1), alpha (1), along (1). */
export const RIBBON_STRIDE = 10;

/**
 * Writes the ribbon of `trail` into `out` from `offset` (two vertices per point, a centre, the
 * direction of travel, which side, the width, the opacity and the position along the trail from 0
 * at the nozzle). `toRender` converts a body-fixed point to render space. Returns the number of
 * vertices written; a trail of fewer than two points writes none.
 */
export function writeRibbon(
	trail: TrailBuffer,
	toRender: (x: number, y: number, z: number, into: [number, number, number]) => void,
	out: Float32Array,
	offset: number
): number {
	const n = trail.count;
	if (n < 2) return 0;
	const p: [number, number, number] = [0, 0, 0];
	const centres = new Float64Array(n * 3);
	for (let i = 0; i < n; i++) {
		toRender(trail.x[i]!, trail.y[i]!, trail.z[i]!, p);
		centres[i * 3] = p[0];
		centres[i * 3 + 1] = p[1];
		centres[i * 3 + 2] = p[2];
	}
	let w = offset;
	for (let k = 0; k < n; k++) {
		// Index 0 is the oldest point; the ribbon runs from the nozzle (newest) back.
		const i = n - 1 - k;
		const a = Math.max(0, i - 1);
		const b = Math.min(n - 1, i + 1);
		let tx = centres[b * 3]! - centres[a * 3]!;
		let ty = centres[b * 3 + 1]! - centres[a * 3 + 1]!;
		let tz = centres[b * 3 + 2]! - centres[a * 3 + 2]!;
		const tl = Math.hypot(tx, ty, tz) || 1;
		tx /= tl;
		ty /= tl;
		tz /= tl;
		const width = trailWidth(trail.w0[i]!, trail.age[i]!);
		// The same smoke spread over a wider band is thinner: opacity falls with the square root of the widening.
		const alpha =
			(trailAlpha(trail.age[i]!) * trail.density[i]!) /
			Math.sqrt(width / Math.max(trail.w0[i]!, 1e-6));
		const along = n > 1 ? k / (n - 1) : 0;
		for (const side of [-1, 1]) {
			out[w++] = centres[i * 3]!;
			out[w++] = centres[i * 3 + 1]!;
			out[w++] = centres[i * 3 + 2]!;
			out[w++] = tx;
			out[w++] = ty;
			out[w++] = tz;
			out[w++] = side;
			out[w++] = width;
			out[w++] = alpha;
			out[w++] = along;
		}
	}
	return n * VERTICES_PER_POINT;
}

/**
 * Writes the indices of a ribbon of `points` points whose first vertex is `base` into `out` at
 * `offset`: two triangles per segment. Returns the number of indices written.
 */
export function writeRibbonIndices(
	out: Uint16Array | Uint32Array,
	offset: number,
	base: number,
	points: number
): number {
	let w = offset;
	for (let k = 0; k < points - 1; k++) {
		const a = base + k * 2;
		out[w++] = a;
		out[w++] = a + 1;
		out[w++] = a + 2;
		out[w++] = a + 1;
		out[w++] = a + 3;
		out[w++] = a + 2;
	}
	return w - offset;
}
