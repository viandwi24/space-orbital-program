/**
 * Generated star-system art (plan 317, ADR 0273): a deterministic picture of a system made from its
 * body definitions, so stock, Sol and any mod's system all get one with no artist. One layout makes
 * the card diagram (a star at the left, planets along arcs) and the square icon (a star in the middle,
 * planets on rings). Pure: data in, shapes out; `SystemArt.svelte` draws them.
 */
import type { BodyDefinition } from '@orbital/core';

export interface ArtBody {
	id: string;
	x: number;
	y: number;
	r: number;
	/** Light and dark of the body's disc (a radial gradient). */
	light: string;
	dark: string;
	/** A thin halo for air. */
	atmosphere: string | null;
	/** A ring's half-width, 0 for none. */
	ring: number;
	/** Bands across a giant. */
	bands: boolean;
	moons: { x: number; y: number; r: number; color: string }[];
}

export interface SystemPicture {
	width: number;
	height: number;
	star: { x: number; y: number; r: number; color: string; glow: string };
	/** SVG paths of the orbits. */
	orbits: string[];
	bodies: ArtBody[];
}

export type ArtLayout = 'card' | 'icon';

/** Tints the data cannot say (ADR 0273 point 2): Sol's colours and Saturn's ring, by body id. */
const HINTS: Record<string, { light: string; dark: string; ring?: boolean }> = {
	'sol.mercury': { light: '#B9B2A8', dark: '#57524C' },
	'sol.venus': { light: '#F1DDA8', dark: '#9C7F45' },
	'sol.mars': { light: '#E39A6B', dark: '#7A3B22' },
	'sol.jupiter': { light: '#E8CFA5', dark: '#8A6A44' },
	'sol.saturn': { light: '#EEDCAA', dark: '#94784A', ring: true },
	'sol.uranus': { light: '#BCE8EF', dark: '#4F8F9C' },
	'sol.neptune': { light: '#8FB0F2', dark: '#2C4699' }
};

/** A small seeded random (mulberry32) from a string. */
export function seeded(text: string): () => number {
	// FNV-1a, then mulberry32
	let a = 2166136261;
	for (let i = 0; i < text.length; i++) {
		a ^= text.charCodeAt(i);
		a = Math.imul(a, 16777619) >>> 0;
	}
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const hsl = (h: number, s: number, l: number): string =>
	`hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(s)}% ${Math.round(l)}%)`;

export type BodyKind = 'star' | 'terran' | 'rock' | 'giant' | 'ice';

/** What the data says a body is: a star, a world with air and hills, bare rock, or a giant. */
export function bodyKind(body: BodyDefinition, outer = false): BodyKind {
	if (body.star) return 'star';
	const km = body.radius / 1000;
	if (km > 15_000 && !body.terrain) return outer ? 'ice' : 'giant';
	if (body.atmosphere && body.atmosphere.surfacePressure > 0) return 'terran';
	return 'rock';
}

/** A body's tint: a palette hint, else its kind with a little jitter from its id. */
export function bodyTint(
	body: BodyDefinition,
	outer = false
): { light: string; dark: string; atmosphere: string | null } {
	const hint = HINTS[body.id];
	const air = body.atmosphere && body.atmosphere.surfacePressure > 0;
	const atmosphere = air ? 'rgba(150, 196, 255, 0.55)' : null;
	if (hint) return { light: hint.light, dark: hint.dark, atmosphere };
	const r = seeded(body.id);
	const j = (r() - 0.5) * 24;
	switch (bodyKind(body, outer)) {
		case 'star':
			return { light: '#FFF1C2', dark: '#FFB547', atmosphere: null };
		case 'terran':
			return { light: hsl(205 + j, 70, 64), dark: hsl(220 + j, 70, 24), atmosphere };
		case 'giant':
			return { light: hsl(36 + j, 55, 74), dark: hsl(28 + j, 40, 34), atmosphere: null };
		case 'ice':
			return { light: hsl(195 + j, 55, 76), dark: hsl(215 + j, 50, 34), atmosphere: null };
		default:
			return { light: hsl(30 + j, 6 + r() * 10, 66), dark: hsl(30 + j, 6, 26), atmosphere };
	}
}

/** The star's colour: warm by default, a little jitter from its id. */
function starColor(star: BodyDefinition | undefined): { color: string; glow: string } {
	if (!star) return { color: '#FFD27A', glow: 'rgba(255, 210, 122, 0.35)' };
	const r = seeded(star.id);
	const h = 42 + (r() - 0.5) * 16;
	return { color: hsl(h, 100, 74), glow: `hsla(${Math.round(h)}, 100%, 70%, 0.35)` };
}

/** Planets (bodies around the star) in orbit order, each with its moons. */
export function systemTree(bodies: readonly BodyDefinition[]): {
	star: BodyDefinition | undefined;
	planets: { body: BodyDefinition; moons: BodyDefinition[] }[];
} {
	const star = bodies.find((b) => b.star) ?? bodies.find((b) => !b.parent);
	const planets = bodies
		.filter((b) => b !== star && (b.parent === star?.id || (!b.parent && b !== star)))
		.sort((a, b) => (a.orbit?.a ?? 0) - (b.orbit?.a ?? 0));
	return {
		star,
		planets: planets.map((p) => ({
			body: p,
			moons: bodies
				.filter((m) => m.parent === p.id)
				.sort((a, b) => (a.orbit?.a ?? 0) - (b.orbit?.a ?? 0))
		}))
	};
}

/** A body's drawn radius from its real one: a log scale between `min` and `max`. */
function drawnRadius(radius: number, min: number, max: number): number {
	const km = Math.max(1, radius / 1000);
	const t = Math.min(1, Math.max(0, (Math.log10(km) - 2.2) / (4.9 - 2.2)));
	return min + t * (max - min);
}

const f = (n: number): string => n.toFixed(1);

/**
 * The picture of a system. `card`: 300 x 96, the star at the left and the planets along arcs (up
 * to 9 shown). `icon`: 48 x 48, the star in the middle and up to 4 planets on rings.
 */
export function systemPicture(
	systemId: string,
	bodies: readonly BodyDefinition[],
	layout: ArtLayout = 'card'
): SystemPicture {
	const { star, planets } = systemTree(bodies);
	const sc = starColor(star);
	const rnd = seeded(systemId);
	if (layout === 'icon') {
		const shown = planets.slice(0, 4);
		const cx = 24;
		const cy = 24;
		const step = shown.length > 0 ? 14 / shown.length : 0;
		const orbits: string[] = [];
		const out: ArtBody[] = shown.map((p, i) => {
			const ring = 6 + step * (i + 1);
			orbits.push(
				`M${f(cx - ring)} ${f(cy)} a${f(ring)} ${f(ring)} 0 1 0 ${f(2 * ring)} 0 a${f(ring)} ${f(ring)} 0 1 0 ${f(-2 * ring)} 0`
			);
			const a = rnd() * Math.PI * 2;
			const tint = bodyTint(p.body, i >= shown.length - 2 && shown.length > 4);
			return {
				id: p.body.id,
				x: cx + ring * Math.cos(a),
				y: cy + ring * Math.sin(a),
				r: drawnRadius(p.body.radius, 1.6, 3.2),
				light: tint.light,
				dark: tint.dark,
				atmosphere: null,
				ring: 0,
				bands: false,
				moons: []
			};
		});
		return {
			width: 48,
			height: 48,
			star: { x: cx, y: cy, r: 5, ...sc },
			orbits,
			bodies: out
		};
	}
	const width = 300;
	const height = 96;
	const sx = 24;
	const sy = 48;
	const shown = planets.slice(0, 9);
	const n = shown.length;
	// spread the planets from just right of the star to the right edge
	// one planet sits in the middle, several spread from just right of the star
	const first = n === 1 ? 130 : 34;
	const last = width - sx - 16;
	const gap = n > 1 ? (last - first) / (n - 1) : 0;
	const orbits: string[] = [];
	const out: ArtBody[] = shown.map((p, i) => {
		const r = first + gap * i;
		orbits.push(
			`M${f(sx + r * Math.cos(-0.9))} ${f(sy + r * Math.sin(-0.9))} A${f(r)} ${f(r)} 0 0 1 ${f(sx + r * Math.cos(0.9))} ${f(sy + r * Math.sin(0.9))}`
		);
		// the angle wanders a little so the planets do not sit on one line
		const a = (rnd() - 0.5) * 0.9;
		const outer = i >= n - 2 && n > 4;
		const tint = bodyTint(p.body, outer);
		const radius = drawnRadius(p.body.radius, 2.4, n > 6 ? 8 : 10);
		// up and down within the box, whatever the orbit's size
		const room = height / 2 - radius - 4;
		const y = sy + Math.max(-room, Math.min(room, r * Math.sin(a)));
		const x = sx + Math.sqrt(Math.max(0, r * r - (y - sy) ** 2));
		const kind = bodyKind(p.body, outer);
		return {
			id: p.body.id,
			x,
			y,
			r: radius,
			light: tint.light,
			dark: tint.dark,
			atmosphere: tint.atmosphere,
			ring: HINTS[p.body.id]?.ring ? radius * 1.9 : 0,
			bands: kind === 'giant',
			moons: p.moons.slice(0, 3).map((m, k) => {
				const ma = -Math.PI / 4 + k * 0.9 + rnd() * 0.3;
				const md = radius + 4 + k * 3;
				return {
					x: x + md * Math.cos(ma),
					y: y + md * Math.sin(ma),
					r: Math.max(1.1, Math.min(2.4, drawnRadius(m.radius, 1, 3))),
					color: bodyTint(m).light
				};
			})
		};
	});
	return { width, height, star: { x: sx, y: sy, r: 11, ...sc }, orbits, bodies: out };
}

/**
 * A world's planet colours for the Worlds screen (V3 §3.2): four stops from light to dark, from the
 * home body's tint and a hue shift by the world's id, so two worlds of one system still differ.
 */
export function worldHue(worldId: string, home: BodyDefinition | undefined): string[] {
	const r = seeded(worldId);
	const base = home ? bodyKind(home) : 'terran';
	const h0 =
		base === 'terran'
			? 212
			: base === 'giant'
				? 34
				: base === 'ice'
					? 196
					: base === 'rock'
						? 28
						: 46;
	const h = h0 + (r() - 0.5) * 90;
	const s = base === 'rock' ? 30 : 70;
	return [hsl(h, s + 20, 74), hsl(h + 8, s, 52), hsl(h + 14, s, 25), hsl(h + 18, s, 8)];
}
