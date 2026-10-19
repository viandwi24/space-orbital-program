/**
 * The deep-space dish (plan 234, ADR 0227): a 64 m Cassegrain antenna of the deep-space-network
 * class on an 8 × 8 cell footprint. Dimensions follow the public descriptions of the 64/70 m and
 * 34 m DSN antennas (docs/research/deep-space-dish.md), rounded:
 *
 * - a concrete pedestal with a stair tower and the cable wrap at its top;
 * - the alidade: a turntable deck and two braced towers that carry the elevation bearings;
 * - the tipping structure: a paraboloid of panel rings with seams, the back-up truss, the elevation
 *   bull gear and a counterweight, the quadripod, the hyperbolic subreflector and the feed cone;
 * - red warning lights on the quadripod apex and the tower tops.
 *
 * Model space is site-local metres (x east, y up, z south). The azimuth group turns about +Y (0 =
 * boresight north, clockwise seen from above); the elevation group turns about +X at the bearing
 * height (0 = horizon, 90° = zenith, the stow). Built from coloured geometry in the site's material
 * buckets, so it is lit and blinks like the rest of the site. Tracking is a pure function. Bun tests
 * both.
 */
import {
	BufferGeometry,
	Group,
	LatheGeometry,
	Matrix4,
	Object3D,
	TorusGeometry,
	Vector2,
	Vector3
} from 'three';
import { beam, box, coloured, cylinder, emptyParts, lin, type SiteParts } from './site-geo.ts';

const DEG = Math.PI / 180;

/** The dish's dimensions, m. */
export const DISH = {
	/** Main reflector diameter (the DSN's 64 m class before the 70 m upgrade). */
	diameter: 64,
	/** Focal length (f/D ≈ 0.34). */
	focal: 22,
	/** Height of the elevation axis above the ground. */
	axisHeight: 40,
	/** The reflector's vertex sits this far behind the elevation axis. */
	vertexBehind: 2,
	/** Subreflector diameter and its place along the boresight in front of the axis. */
	subDiameter: 7,
	subAhead: 18,
	/** Pedestal radius and height; the alidade deck above it. */
	pedestalRadius: 9,
	pedestalHeight: 9,
	/** Half the span between the two elevation bearing towers. */
	towerSpan: 14,
	/** Footprint in cells (10 m) and its usable half width, m. */
	cells: 8,
	halfWidth: 39
} as const;

/** Slew rates, rad/s: the 70 m antennas turn at about 0.25°/s in both axes. */
export const DISH_RATES = { azimuth: 0.25 * DEG, elevation: 0.25 * DEG } as const;
/** The lowest elevation it tracks at; below it the dish waits in stow. */
export const DISH_MIN_ELEVATION = 6 * DEG;
/** Stow: pointing at the zenith. */
export const DISH_STOW = 90 * DEG;

export interface DishAim {
	/** rad, 0 north, clockwise (east is π/2). */
	azimuth: number;
	/** rad above the horizon. */
	elevation: number;
}

/** Azimuth and elevation of a site-local direction (x east, y up, z south). */
export function aimOf(dir: { x: number; y: number; z: number }): DishAim {
	const horizontal = Math.hypot(dir.x, dir.z);
	return { azimuth: Math.atan2(dir.x, -dir.z), elevation: Math.atan2(dir.y, horizontal) };
}

const wrapPi = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * One tracking step: toward `target` (or the stow when it is null or below the minimum elevation)
 * at most the slew rate in each axis for `dt` seconds. Azimuth takes the short way round; in stow
 * the azimuth stays where it is.
 */
export function trackStep(current: DishAim, target: DishAim | null, dt: number): DishAim {
	const t = Math.max(dt, 0);
	const tracking = target !== null && target.elevation >= DISH_MIN_ELEVATION;
	const goalAz = tracking ? target.azimuth : current.azimuth;
	const goalEl = tracking ? target.elevation : DISH_STOW;
	const dAz = wrapPi(goalAz - current.azimuth);
	const maxAz = DISH_RATES.azimuth * t;
	const maxEl = DISH_RATES.elevation * t;
	return {
		azimuth: wrapPi(current.azimuth + Math.max(-maxAz, Math.min(maxAz, dAz))),
		elevation: current.elevation + Math.max(-maxEl, Math.min(maxEl, goalEl - current.elevation))
	};
}

const PAINT = lin(0xeeeeea);
const PANEL = lin(0xe4e6e6);
const SEAM = lin(0x9ea3a6);
const STEEL = lin(0xb9bec2);
const DARK = lin(0x5d6267);
const CONCRETE = lin(0xb7b3ab);
const RED = lin(0xff2a1a);

/** Depth of the paraboloid at radius `r` from its axis. */
const sag = (r: number): number => (r * r) / (4 * DISH.focal);

/**
 * A point of the tipping structure in elevation-group space: radius `r` and angle `a` about the
 * boresight, `along` metres toward the sky from the elevation axis (the boresight is -z, up +y).
 */
function onBoresight(r: number, a: number, along: number): Vector3 {
	return new Vector3(r * Math.cos(a), r * Math.sin(a), -along);
}
/** The reflector surface at radius `r`, angle `a` (`lift` m in front of it). */
const surface = (r: number, a: number, lift = 0): Vector3 =>
	onBoresight(r, a, sag(r) - DISH.vertexBehind + lift);

/** Turn a lathe built about +Y so its axis is the boresight (-z), with +Y of the lathe toward the sky. */
const ALONG_BORESIGHT = new Matrix4().makeRotationX(-Math.PI / 2);

function lathe(points: Vector2[], segments: number, color: ReturnType<typeof lin>): BufferGeometry {
	const g = new LatheGeometry(points, segments);
	g.applyMatrix4(ALONG_BORESIGHT);
	return coloured(g, color);
}

/** A cylinder whose axis is the boresight, its top toward the sky, centred `along` m in front of the axis. */
function alongBoresight(
	rTop: number,
	rBottom: number,
	h: number,
	along: number,
	color: ReturnType<typeof lin>,
	segments: number
): BufferGeometry {
	const g = cylinder(rTop, rBottom, h, 0, 0, 0, color, segments);
	g.rotateX(-Math.PI / 2);
	g.translate(0, 0, -along);
	return g;
}

const beamV = (a: Vector3, b: Vector3, thick: number, color: ReturnType<typeof lin>) =>
	beam(a.x, a.y, a.z, b.x, b.y, b.z, thick, color);

/** The geometry of the three moving levels, in their own frames (see the file comment). */
export interface DishParts {
	/** Fixed to the ground: pedestal, stairs, cable wrap. */
	base: SiteParts;
	/** Turns in azimuth; origin on the ground at the dish centre. */
	azimuth: SiteParts;
	/** Tips in elevation; origin on the elevation axis. */
	elevation: SiteParts;
}

/** The dish's geometry; `low` for distant views: fewer segments, no seams, truss or stairs. */
export function buildDishParts(detail: 'high' | 'low'): DishParts {
	const high = detail === 'high';
	const seg = high ? 96 : 32;
	const base = emptyParts();
	const az = emptyParts();
	const el = emptyParts();
	const R = DISH.diameter / 2;

	// --- pedestal: a concrete drum, its stair tower and the cable wrap at the top
	base.painted.push(
		cylinder(
			DISH.pedestalRadius,
			DISH.pedestalRadius + 1,
			DISH.pedestalHeight,
			0,
			DISH.pedestalHeight / 2,
			0,
			CONCRETE,
			seg / 2
		)
	);
	const wrap = new TorusGeometry(DISH.pedestalRadius - 3, 0.5, 8, seg / 2);
	wrap.rotateX(Math.PI / 2);
	wrap.translate(0, DISH.pedestalHeight + 0.6, 0);
	base.structure.push(coloured(wrap, DARK));
	if (high) {
		const sx = DISH.pedestalRadius + 2.2;
		base.painted.push(
			box(3.4, DISH.pedestalHeight + 2, 3.4, sx, (DISH.pedestalHeight + 2) / 2, 0, CONCRETE)
		);
		for (let s = 0; s < 8; s++)
			base.thin.push(box(0.15, 0.15, 3.4, sx + 1.8, 1 + s * 1.2, 0, STEEL));
		base.painted.push(box(1, 2.2, 0.15, sx, 1.1, 1.75, DARK)); // door
	}

	// --- alidade: deck on the azimuth bearing, two braced towers, bearing housings
	const deckY = DISH.pedestalHeight + 1.2;
	az.structure.push(
		cylinder(
			DISH.pedestalRadius + 1.5,
			DISH.pedestalRadius + 1.5,
			1.2,
			0,
			deckY - 0.6,
			0,
			STEEL,
			seg / 2
		)
	);
	az.painted.push(box(2 * DISH.towerSpan + 4, 1.4, 10, 0, deckY + 0.7, 0, PAINT));
	for (const side of [-1, 1]) {
		const x = side * DISH.towerSpan;
		const top = DISH.axisHeight;
		// four legs leaning in toward the bearing
		for (const dz of [-4.5, 4.5])
			for (const dx of [-2.5, 2.5])
				az.structure.push(
					beam(x + dx, deckY + 1.4, dz, x + dx * 0.4, top - 1, dz * 0.25, 1.1, PAINT)
				);
		if (high) {
			for (let k = 1; k <= 3; k++) {
				const y = deckY + 1.4 + ((top - deckY - 2.4) * k) / 4;
				const f = 1 - (0.75 * k) / 4;
				az.thin.push(beam(x - 2.5, y, -4.5 * f, x - 2.5, y, 4.5 * f, 0.4, STEEL));
				az.thin.push(beam(x + 2.5, y, -4.5 * f, x + 2.5, y, 4.5 * f, 0.4, STEEL));
				az.thin.push(beam(x - 2.5, y - 2, -4.5 * f, x - 2.5, y + 4, 4.5 * f, 0.3, STEEL));
			}
		}
		az.painted.push(box(3.2, 3.2, 4, x, top, 0, PAINT)); // bearing housing
		az.beacon.push(box(0.5, 0.5, 0.5, x, top + 2, 0, RED));
	}
	// the elevation drive's pinion house on the deck, behind the axis
	az.painted.push(box(6, 5, 4, 0, deckY + 3.9, 2.5, PAINT));

	// --- tipping structure (elevation frame): reflector, seams, truss, gear, counterweight
	const rings = high ? 12 : 6;
	const profile: Vector2[] = [];
	for (let i = 0; i <= rings; i++) {
		const r = 1.5 + ((R - 1.5) * i) / rings;
		profile.push(new Vector2(r, sag(r) - DISH.vertexBehind));
	}
	el.painted.push(lathe(profile, seg, PANEL));
	// the back of the surface, a hair behind it
	el.structure.push(
		lathe(
			[...profile].reverse().map((p) => new Vector2(p.x, p.y - 0.25)),
			seg,
			STEEL
		)
	);
	if (high) {
		// panel seams: rings and radial joints a few centimetres in front of the panels
		for (const r of [6, 11, 16, 21, 25.5, 29, R - 0.15]) {
			const ring = new TorusGeometry(r, 0.07, 4, seg);
			ring.applyMatrix4(new Matrix4().makeTranslation(0, 0, -(sag(r) - DISH.vertexBehind + 0.05)));
			el.thin.push(coloured(ring, SEAM));
		}
		const radial = 48;
		const bands = [1.5, 6, 11, 16, 21, 25.5, 29, R];
		for (let k = 0; k < radial; k++) {
			const a = (k / radial) * 2 * Math.PI;
			for (let b = 1; b < bands.length; b++) {
				// the outer bands have twice the panels
				if (b < 4 && k % 2 === 1) continue;
				el.thin.push(
					beamV(surface(bands[b - 1]!, a, 0.05), surface(bands[b]!, a, 0.05), 0.1, SEAM)
				);
			}
		}
		// back-up truss: radial ribs, hoops and diagonals behind the surface
		const ribs = 24;
		for (let k = 0; k < ribs; k++) {
			const a = (k / ribs) * 2 * Math.PI;
			const inner = surface(5, a, -4);
			const outer = surface(R - 0.5, a, -1);
			el.structure.push(beamV(inner, outer, 0.5, STEEL));
			el.structure.push(beamV(surface(5, a, -0.3), inner, 0.35, STEEL));
			el.structure.push(beamV(surface(R / 2, a, -0.3), surface(R / 2, a, -3), 0.35, STEEL));
			const next = ((k + 1) / ribs) * 2 * Math.PI;
			el.thin.push(beamV(surface(R / 2, a, -3), surface(R - 0.5, next, -1), 0.25, STEEL));
		}
		for (const [r, lift] of [
			[12, -3.3],
			[22, -2.2],
			[R - 0.5, -1]
		] as const) {
			const hoop = new TorusGeometry(r, 0.25, 4, seg / 2);
			hoop.applyMatrix4(new Matrix4().makeTranslation(0, 0, -(sag(r) - DISH.vertexBehind + lift)));
			el.structure.push(coloured(hoop, STEEL));
		}
	}
	// the hub behind the vertex, on the elevation bearings
	el.painted.push(box(2 * DISH.towerSpan - 3.6, 4, 5, 0, 0, 2.5, PAINT));
	el.painted.push(alongBoresight(4.5, 4.5, 4, -(DISH.vertexBehind + 2), PAINT, 24));
	// elevation bull gear: a quarter wheel hanging below the hub, meshing with the deck's pinion
	const gear = new TorusGeometry(DISH.axisHeight - deckY - 6, 0.8, 6, high ? 32 : 12, Math.PI / 2);
	gear.rotateY(Math.PI / 2);
	gear.rotateX(Math.PI);
	el.structure.push(coloured(gear, DARK));
	el.structure.push(beam(0, 0, 0, 0, -(DISH.axisHeight - deckY - 6), 0, 0.8, STEEL));
	el.structure.push(beam(0, 0, 0, 0, 0, DISH.axisHeight - deckY - 6, 0.8, STEEL));
	// counterweight behind the axis
	el.painted.push(box(10, 5, 4, 0, -2, 11, CONCRETE));

	// --- quadripod, subreflector and feed cone
	const apex = DISH.subAhead + 1.5;
	for (let k = 0; k < 4; k++) {
		const a = Math.PI / 4 + (k * Math.PI) / 2;
		el.structure.push(
			beamV(surface(R * 0.62, a, 0.2), onBoresight(1.6, a, apex), high ? 0.7 : 0.9, PAINT)
		);
	}
	el.painted.push(alongBoresight(2.2, 2.2, 2.4, apex + 0.6, PAINT, 16));
	// hyperbolic subreflector: convex toward the main reflector
	const sub: Vector2[] = [];
	const rs = DISH.subDiameter / 2;
	for (let i = 0; i <= 8; i++) {
		const r = (rs * i) / 8;
		sub.push(new Vector2(r, DISH.subAhead + 0.9 * (r / rs) ** 2));
	}
	el.painted.push(lathe(sub.reverse(), seg / 2, PAINT));
	el.beacon.push(box(0.5, 0.5, 0.5, 0, 2.6, -(apex + 0.6), RED));
	// feed cone at the vertex, pointing at the subreflector
	el.painted.push(alongBoresight(1.2, 2.6, 7.5, -DISH.vertexBehind + sag(1.5) + 3.6, PAINT, 20));
	return { base, azimuth: az, elevation: el };
}

/** The material buckets the dish uses. */
export const DISH_BUCKETS = [
	'structure',
	'painted',
	'siding',
	'glass',
	'door',
	'lamp',
	'thin',
	'glassLit',
	'beacon'
] as const;
export type DishBucket = (typeof DISH_BUCKETS)[number];

/** The dish as three nested groups; `setAim` turns them. */
export interface DishObject {
	root: Group;
	azimuth: Group;
	elevation: Group;
	setAim(aim: DishAim): void;
}

/**
 * Nest the parts: the root holds the base and the azimuth group, which holds the elevation group at
 * the bearing height. `mesh` makes one object per material bucket (the site's materials), or null.
 */
export function dishObject(
	parts: DishParts,
	mesh: (geometries: BufferGeometry[], bucket: DishBucket) => Object3D | null
): DishObject {
	const root = new Group();
	const azimuth = new Group();
	const elevation = new Group();
	const fill = (group: Group, p: SiteParts): void => {
		for (const bucket of DISH_BUCKETS) {
			const geos = p[bucket] as BufferGeometry[];
			if (!geos.length) continue;
			const m = mesh(geos, bucket);
			if (m) group.add(m);
		}
	};
	fill(root, parts.base);
	fill(azimuth, parts.azimuth);
	fill(elevation, parts.elevation);
	elevation.position.y = DISH.axisHeight;
	azimuth.add(elevation);
	root.add(azimuth);
	root.name = 'deep-space-dish';
	return {
		root,
		azimuth,
		elevation,
		setAim(aim) {
			azimuth.rotation.y = -aim.azimuth;
			elevation.rotation.x = aim.elevation;
		}
	};
}
