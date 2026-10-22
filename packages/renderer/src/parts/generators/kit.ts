/**
 * The shared detail kit (plan 291, ADR 0257): small pieces every generator draws from, so parts
 * read through rims, bands, raised rings, bolts, stub pipes, ribbed hollow bells, hazard stripes,
 * inset panels, louvres, solar cells and hinges instead of plain discs and tubes.
 *
 * Every revolved piece walks its profile bottom to top on the outside (the winding rule of
 * `revolve.ts`); a bell's inner wall walks top down so it faces the axis. Positions are in the part
 * frame, metres, +Y up.
 */
import { CylinderGeometry, Matrix4, Quaternion, Vector3 } from 'three';
import type { GeometryBuilder, SlotName } from '../builder.ts';
import { revolve, type ProfilePoint } from '../revolve.ts';

export type Vec3 = readonly [number, number, number];

/**
 * A lip around a part's edge at height `y`: the wall steps out by `out` over `height`, so a face
 * reads as a forged ring and not as the end of a tube.
 */
export function rim(
	b: GeometryBuilder,
	slot: SlotName,
	r: number,
	y: number,
	height = 0.04,
	out = 0.012
): void {
	const h2 = height / 2;
	b.revolve(slot, [
		{ r, y: y - h2 },
		{ r: r + out, y: y - h2 + out * 0.5 },
		{ r: r + out, y: y + h2 - out * 0.5 },
		{ r, y: y + h2 }
	]);
}

/** A painted band from `y0` to `y1` standing `out` off a wall of radius `r`. */
export function band(
	b: GeometryBuilder,
	slot: SlotName,
	r: number,
	y0: number,
	y1: number,
	out = 0.004
): void {
	if (y1 <= y0) return;
	b.revolve(slot, [
		{ r: r + out, y: y0 },
		{ r: r + out, y: y1 }
	]);
}

/** A raised ring (stiffener, weld, interstage seam) centred at `y`. */
export function raisedRing(
	b: GeometryBuilder,
	slot: SlotName,
	r: number,
	y: number,
	height = 0.06,
	out = 0.014
): void {
	const h2 = height / 2;
	b.revolve(slot, [
		{ r, y: y - h2 },
		{ r: r + out, y: y - h2 * 0.4 },
		{ r: r + out, y: y + h2 * 0.4 },
		{ r, y: y + h2 }
	]);
}

/**
 * `count` bolt heads in a circle of radius `r` at height `y`. `face: 'side'` sets them into a wall
 * (pointing out), `face: 'top'` into an upward face.
 */
export function boltCircle(
	b: GeometryBuilder,
	slot: SlotName,
	count: number,
	r: number,
	y: number,
	options: { size?: number; face?: 'side' | 'top' | 'bottom'; phase?: number } = {}
): void {
	const s = options.size ?? 0.022;
	const face = options.face ?? 'side';
	for (let i = 0; i < count; i++) {
		const a = ((i + (options.phase ?? 0.5)) / count) * Math.PI * 2;
		const x = Math.sin(a) * r;
		const z = Math.cos(a) * r;
		if (face === 'side') b.box(slot, [s, s, s * 0.5], [x, y, z], a);
		else b.box(slot, [s, s * 0.5, s], [x, face === 'top' ? y + s * 0.25 : y - s * 0.25, z], a);
	}
}

/** Rotation that turns +Y onto `dir` (a unit vector). */
export function alongDir(dir: Vec3): Quaternion {
	const d = new Vector3(...dir).normalize();
	return new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d);
}

/** A short pipe from `from` along `dir` for `length`, radius `r`. */
export function stubPipe(
	b: GeometryBuilder,
	slot: SlotName,
	from: Vec3,
	dir: Vec3,
	length: number,
	r: number,
	segments = 10
): void {
	const q = alongDir(dir);
	const d = new Vector3(...dir).normalize();
	const centre = new Vector3(...from).addScaledVector(d, length / 2);
	const m = new Matrix4().compose(centre, q, new Vector3(1, 1, 1));
	b.add(slot, new CylinderGeometry(r, r, length, Math.max(6, segments), 1), m);
}

export interface BellSpec {
	/** Radius at the throat (the narrow end), m. */
	throat: number;
	/** Radius at the exit lip, m. */
	exit: number;
	/** Throat to exit, m. */
	length: number;
	/** Wall thickness, m. */
	wall?: number;
	/** Raised rings on the outside, evenly along the bell (0 for a smooth bell). */
	rings?: number;
	/** Shape exponent of the flare (1 = cone, < 1 = bell). */
	flare?: number;
	/** Profile steps along the bell. */
	steps?: number;
	/** Slots for the outside and the sooty inside. */
	slot?: SlotName;
	innerSlot?: SlotName;
	/** Radial segments (defaults to the builder's). */
	segments?: number;
}

/** Radius of the bell's inner wall at `t` from the throat (0) to the exit (1). */
export function bellRadius(spec: BellSpec, t: number): number {
	return (
		spec.throat +
		(spec.exit - spec.throat) * Math.pow(Math.min(1, Math.max(0, t)), spec.flare ?? 0.6)
	);
}

/**
 * The outer and inner profiles of a hollow bell whose throat is at y = 0 and whose exit is at
 * y = -length (pointing down -Y), with `rings` raised bands on the outside. The outside walks from
 * the exit lip up to the throat; the inside walks from the throat down to the lip.
 */
export function bellProfiles(spec: BellSpec): { outer: ProfilePoint[]; inner: ProfilePoint[] } {
	const wall = spec.wall ?? Math.max(0.004, spec.exit * 0.06);
	const steps = spec.steps ?? 10;
	const rings = Math.max(0, Math.round(spec.rings ?? 0));
	const L = spec.length;
	const inner: ProfilePoint[] = [];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		inner.push({ r: Math.max(0.002, bellRadius(spec, t)), y: -L * t, smooth: i > 0 && i < steps });
	}
	// Outside: the lip, then up the flare; each ring is a small step out and back.
	const outer: ProfilePoint[] = [
		{ r: Math.max(0.002, bellRadius(spec, 1) - wall * 0.2), y: -L },
		{ r: bellRadius(spec, 1) + wall, y: -L },
		{ r: bellRadius(spec, 1) + wall, y: -L + wall }
	];
	const ringAt = new Set<number>();
	for (let k = 1; k <= rings; k++) ringAt.add(Math.round((k / (rings + 1)) * steps));
	for (let i = steps - 1; i >= 0; i--) {
		const t = i / steps;
		const y = -L * t;
		const r = bellRadius(spec, t) + wall;
		if (ringAt.has(i)) {
			const h = Math.min(L / steps / 3, wall * 3);
			const out = wall * 0.9;
			outer.push({ r, y: y - h });
			outer.push({ r: r + out, y: y - h * 0.5 });
			outer.push({ r: r + out, y: y + h * 0.5 });
			outer.push({ r, y: y + h });
		} else {
			outer.push({ r, y, smooth: i > 0 });
		}
	}
	return { outer, inner };
}

/**
 * A hollow bell placed at `at` (its throat) pointing along `dir` (default straight down). The
 * outside is `spec.slot` ('nozzle' by default), the inside `spec.innerSlot` ('nozzle-inner').
 */
export function ribbedBell(
	b: GeometryBuilder,
	spec: BellSpec,
	at: Vec3 = [0, 0, 0],
	dir: Vec3 = [0, -1, 0]
): void {
	const { outer, inner } = bellProfiles(spec);
	const segments = spec.segments ?? b.segments;
	// The profiles point down -Y; turn -Y onto `dir`.
	const q = new Quaternion().setFromUnitVectors(
		new Vector3(0, -1, 0),
		new Vector3(...dir).normalize()
	);
	const m = new Matrix4().compose(new Vector3(...at), q, new Vector3(1, 1, 1));
	b.add(spec.slot ?? 'nozzle', revolve(outer, { segments }), m);
	b.add(spec.innerSlot ?? 'nozzle-inner', revolve(inner, { segments }), m);
}

/**
 * A hazard band: `count` alternating sectors of `slotA` and `slotB` around a wall of radius `r`
 * from `y0` to `y1`, standing `out` off the wall.
 */
export function hazardStripe(
	b: GeometryBuilder,
	r: number,
	y0: number,
	y1: number,
	options: { count?: number; slotA?: SlotName; slotB?: SlotName; out?: number } = {}
): void {
	const count = Math.max(2, Math.round((options.count ?? 16) / 2) * 2);
	const out = options.out ?? 0.005;
	const sweep = (Math.PI * 2) / count;
	const seg = Math.max(2, Math.round(b.segments / count));
	for (let i = 0; i < count; i++) {
		b.revolve(
			i % 2 === 0 ? (options.slotA ?? 'paint-accent') : (options.slotB ?? 'dark-metal'),
			[
				{ r: r + out, y: y0 },
				{ r: r + out, y: y1 }
			],
			{ segments: seg, phiStart: i * sweep, phiLength: sweep }
		);
	}
}

/**
 * A panel set into a cylinder wall at azimuth `angle` (radians from +Z toward +X) and height `y`:
 * a thin plate `w` wide and `h` tall standing `out` proud of the wall, turned to face out.
 */
export function panelInset(
	b: GeometryBuilder,
	slot: SlotName,
	r: number,
	angle: number,
	y: number,
	w: number,
	h: number,
	out = 0.006
): void {
	b.box(slot, [w, h, out * 2], [Math.sin(angle) * r, y, Math.cos(angle) * r], angle);
}

/** `count` horizontal vent slats on a wall at azimuth `angle`, stacked from `y0` upward. */
export function louvres(
	b: GeometryBuilder,
	slot: SlotName,
	r: number,
	angle: number,
	y0: number,
	count: number,
	options: { width?: number; pitch?: number } = {}
): void {
	const w = options.width ?? 0.12;
	const pitch = options.pitch ?? 0.03;
	for (let i = 0; i < count; i++) {
		const y = y0 + i * pitch;
		b.box(
			slot,
			[w, pitch * 0.4, 0.012],
			[Math.sin(angle) * (r + 0.004), y, Math.cos(angle) * (r + 0.004)],
			angle
		);
	}
}

/**
 * A grid of solar cells on a flat panel lying in the XY plane at `z` (facing +Z): `cols` x `rows`
 * cells inside `w` x `h`, a gap between them showing the frame behind.
 */
export function cellGrid(
	b: GeometryBuilder,
	slot: SlotName,
	centre: Vec3,
	w: number,
	h: number,
	cols: number,
	rows: number,
	gap = 0.01
): void {
	const cw = (w - gap * (cols + 1)) / cols;
	const ch = (h - gap * (rows + 1)) / rows;
	if (cw <= 0 || ch <= 0) return;
	for (let c = 0; c < cols; c++) {
		for (let r = 0; r < rows; r++) {
			const x = centre[0] - w / 2 + gap + cw / 2 + c * (cw + gap);
			const y = centre[1] - h / 2 + gap + ch / 2 + r * (ch + gap);
			b.box(slot, [cw, ch, 0.004], [x, y, centre[2]]);
		}
	}
}

/** A hinge barrel of `length` along `axis` (unit vector) centred at `at`, radius `r`. */
export function hinge(
	b: GeometryBuilder,
	slot: SlotName,
	at: Vec3,
	axis: Vec3,
	length: number,
	r: number
): void {
	const d = new Vector3(...axis).normalize();
	stubPipe(
		b,
		slot,
		[at[0] - (d.x * length) / 2, at[1] - (d.y * length) / 2, at[2] - (d.z * length) / 2],
		axis,
		length,
		r
	);
}

/**
 * Paint schemes for barrels (plan 291, ADR 0257): `visual.params.livery`. Without one a part keeps
 * its generator's own look (`stripe` for tanks and boosters).
 * - `plain`: the barrel in the primary paint, no stripe;
 * - `stripe`: the default stripe and accent line;
 * - `bands`: two wide secondary bands near the ends, with accent lines (white with black bands);
 * - `checker`: the lower third in four quarters, primary and secondary (a roll pattern);
 * - `half-black`: the lower half in the secondary paint;
 * - `foam`: orange insulation foam over the whole barrel (an external tank);
 * - `steel`: bare stainless steel.
 */
export const LIVERIES = [
	'plain',
	'stripe',
	'bands',
	'checker',
	'half-black',
	'foam',
	'steel',
	// plan 355: the Apollo stack's paints
	'roll',
	'top-band',
	'aft-band',
	'service',
	'foil-engines'
] as const;
export type Livery = (typeof LIVERIES)[number];

/** The part's livery, or undefined when it has none (or an unknown one). */
export function liveryOf(
	params: Readonly<Record<string, unknown>> | undefined
): Livery | undefined {
	// the Hangar's Paint setting (plan 355) wins over the part's own livery, unless `default`
	const paint = params?.paint;
	const v = typeof paint === 'string' && paint !== 'default' ? paint : params?.livery;
	return typeof v === 'string' && (LIVERIES as readonly string[]).includes(v)
		? (v as Livery)
		: undefined;
}

/** The slot a barrel is drawn in under `livery`. */
export function barrelSlot(livery: Livery | undefined): SlotName {
	if (livery === 'foam') return 'foam';
	if (livery === 'steel' || livery === 'service') return 'metal';
	return 'paint-primary';
}

/** Whether the generator's own stripe is drawn under `livery`. */
export function keepsStripe(livery: Livery | undefined): boolean {
	return livery === undefined || livery === 'stripe';
}

/**
 * The livery's overlays on a barrel of radius `r` between `y0` and `y1` (the barrel itself is drawn
 * by the generator in `barrelSlot(livery)`).
 */
export function paintLivery(
	b: GeometryBuilder,
	livery: Livery | undefined,
	r: number,
	y0: number,
	y1: number
): void {
	const H = y1 - y0;
	if (H <= 0.05) return;
	switch (livery) {
		case 'bands': {
			const w = Math.min(0.5, H * 0.14);
			const inset = Math.min(0.12, H * 0.05);
			band(b, 'paint-secondary', r, y0 + inset, y0 + inset + w);
			band(b, 'paint-secondary', r, y1 - inset - w, y1 - inset);
			band(b, 'paint-accent', r, y1 - inset - w - 0.05, y1 - inset - w - 0.02, 0.006);
			break;
		}
		case 'checker': {
			const top = y0 + H / 3;
			const quarter = Math.PI / 2;
			const seg = Math.max(2, Math.round(b.segments / 4));
			for (let i = 0; i < 4; i++) {
				if (i % 2 === 0) continue;
				b.revolve(
					'paint-secondary',
					[
						{ r: r + 0.004, y: y0 },
						{ r: r + 0.004, y: top }
					],
					{ segments: seg, phiStart: i * quarter, phiLength: quarter }
				);
			}
			band(b, 'paint-secondary', r, top, top + Math.min(0.08, H * 0.04));
			break;
		}
		case 'half-black':
			band(b, 'paint-secondary', r, y0, y0 + H / 2);
			break;
		// plan 355: the Apollo stack
		case 'roll': {
			// the first stage: four black panels round the foot, the roll pattern under the top
			// (black and white eighths), a black ring at the top
			const eighth = Math.PI / 4;
			const seg = Math.max(2, Math.round(b.segments / 8));
			const sectors = (ya: number, yb: number, phase: number): void => {
				for (let i = 0; i < 4; i++)
					b.revolve(
						'paint-secondary',
						[
							{ r: r + 0.004, y: ya },
							{ r: r + 0.004, y: yb }
						],
						{ segments: seg, phiStart: phase + i * 2 * eighth, phiLength: eighth }
					);
			};
			sectors(y0, y0 + H * 0.22, 0);
			sectors(y1 - H * 0.16, y1 - H * 0.04, eighth);
			band(b, 'paint-secondary', r, y1 - H * 0.04, y1);
			// stringers: thin ribs up the white
			const ribs = b.segments >= 32 ? 16 : 8;
			for (let i = 0; i < ribs; i++) {
				const a = (i / ribs) * Math.PI * 2;
				b.box(
					'paint-primary',
					[0.03, H * 0.56, 0.03],
					[Math.sin(a) * (r - 0.009), y0 + H * 0.5, Math.cos(a) * (r - 0.009)],
					a
				);
			}
			break;
		}
		case 'top-band':
			band(b, 'paint-secondary', r, y1 - Math.min(0.6, H * 0.08), y1);
			band(b, 'paint-secondary', r, y0, y0 + Math.min(0.12, H * 0.02));
			break;
		case 'aft-band':
			band(b, 'paint-secondary', r, y0, y0 + H * 0.24);
			// two black lines up the side, as on a third stage
			for (const a of [0, Math.PI]) {
				b.box(
					'paint-secondary',
					[0.12, H * 0.76, 0.02],
					[Math.sin(a) * (r - 0.004), y0 + H * 0.62, Math.cos(a) * (r - 0.004)],
					a
				);
			}
			break;
		case 'service': {
			// a bare service module: white radiator panels in two groups, a band at each end
			const seg = Math.max(2, Math.round(b.segments / 8));
			for (const start of [0.3, Math.PI + 0.3]) {
				b.revolve(
					'paint-primary',
					[
						{ r: r + 0.004, y: y0 + H * 0.35 },
						{ r: r + 0.004, y: y1 - H * 0.05 }
					],
					{ segments: seg, phiStart: start, phiLength: 1.1 }
				);
				for (let k = 1; k < 6; k++) {
					const a = start + (1.1 * k) / 6;
					b.box(
						'dark-metal',
						[0.02, H * 0.58, 0.01],
						[Math.sin(a) * (r + 0.001), y0 + H * 0.64, Math.cos(a) * (r + 0.001)],
						a
					);
				}
			}
			band(b, 'paint-primary', r, y0, y0 + H * 0.04);
			break;
		}
		default:
			break;
	}
}
