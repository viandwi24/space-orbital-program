/**
 * The landing prediction in the Guidance Computer (plan 372, ADR 0309; from the Trajectories mod
 * of plans 347 and 366): the predicted path of a vessel through the air to the ground, with a
 * cross-hair where it comes down and the landing target the Land autopilot flies to. The reference
 * example of the World API and overlays:
 *  1. a sim system reads the world (`ctx.world`: the vessel, its body, the air, the ground),
 *  2. predicts with `predict` (RK4 with drag, coasting),
 *  3. publishes shapes (`ctx.overlays.set`) that the renderer draws in Flight and the map,
 *  4. keeps its setting and the landing target in stores, set from the Landing tab through key
 *     events (`mod:key`), the target also by a click on the map (a `pick` node).
 *
 * When it shows (ADR 0309 point 3): never on the ground, on the pad or on a stable orbit, and only
 * once the path comes down; then while Land flies the vessel, or with "Show predicted path" on
 * while no other Guidance program flies it. In Flight it fades in as the vessel climbs past 1 km.
 */
import {
	defineKeybinding,
	defineOverlay,
	defineStore,
	defineSystem,
	machDragFactor,
	z,
	type Command,
	type EntityId,
	type OverlayShape,
	type PanelInput,
	type SystemContext,
	type WorldVessel
} from '@orbital/sdk';
import { latLonOf, pointAt, predict, surfaceDistance, type Prediction, type Vec3 } from './predict.ts';

export const PATH = defineOverlay({
	id: 'guidance.path',
	title: 'Guidance: predicted landing path',
	description: 'The predicted path through the air to the ground, the impact point and the landing target.',
	// on; the rules below and the Landing tab's toggle decide when there is something to draw
	defaultOn: true
});

/** The Landing tab's "Show predicted path" (on by default). */
export const PathSettings = defineStore({
	id: 'guidance.path-settings',
	schema: z.object({ show: z.boolean() }),
	initial: { show: true }
});
export type PathSettingsValue = z.infer<typeof PathSettings.schema>;

/** The landing target: a point on a body's surface, latitude and longitude in rad. */
export const LandingTarget = defineStore({
	id: 'guidance.landing-target',
	schema: z.object({ body: z.string(), lat: z.number(), lon: z.number() }).nullable(),
	initial: null as { body: string; lat: number; lon: number } | null
});
export type LandingTargetValue = NonNullable<z.infer<typeof LandingTarget.schema>>;

/** The Landing tab's controls send these keys; a player may bind the first two. */
export const SET_TARGET = defineKeybinding({
	id: 'guidance.landing-target-at-impact',
	label: 'Guidance: landing target at the predicted impact',
	defaults: []
});
export const CLEAR_TARGET = defineKeybinding({
	id: 'guidance.landing-target-clear',
	label: 'Guidance: clear the landing target',
	defaults: []
});
/** A map pick (`data`: body and direction) and the toggle (`data`: show). */
export const PICK_TARGET = defineKeybinding({
	id: 'guidance.landing-target-pick',
	label: 'Guidance: landing target picked on the map',
	defaults: [],
	hidden: true
});
export const SET_PATH = defineKeybinding({
	id: 'guidance.path-show',
	label: 'Guidance: show the predicted path',
	defaults: [],
	hidden: true
});
export const PATH_KEYS = [SET_TARGET, CLEAR_TARGET, PICK_TARGET, SET_PATH];

// ---------------------------------------------------------------------------------------------
// When it shows (ADR 0309 point 3)

/** In Flight the arc fades in between these heights above the ground, m. */
export const FADE_FROM = 1_000;
export const FADE_TO = 2_000;
/** The Land autopilot: the path shows while it flies whatever the toggle says. */
const LAND = 'guidance.land';

export interface Visibility {
	/** The arc's opacity factor in Flight, 0 (hidden) to 1. */
	flight: number;
	/** Shown in the map. */
	map: boolean;
}
const HIDDEN: Visibility = { flight: 0, map: false };

/**
 * Where `v`'s path shows: never on the ground or the pad, never on a stable orbit or without an
 * impact; while Land flies it always; else with the toggle on and no other Guidance program
 * flying it. In Flight the arc fades in from 1 to 2 km above the ground; the map shows it whole.
 */
export function visibility(
	settings: PathSettingsValue,
	v: Pick<WorldVessel, 'situation' | 'radarAltitude' | 'altitude' | 'autopilot'>,
	p: Pick<Prediction, 'impact'> | null
): Visibility {
	if (v.situation !== 'flying' && v.situation !== 'sub-orbital') return HIDDEN;
	if (!p?.impact) return HIDDEN;
	if (v.autopilot !== LAND) {
		if (!settings.show) return HIDDEN;
		if (v.autopilot?.startsWith('guidance.')) return HIDDEN; // another program's flight
	}
	const height = v.radarAltitude ?? v.altitude ?? 0;
	return { flight: Math.min(1, Math.max(0, (height - FADE_FROM) / (FADE_TO - FADE_FROM))), map: true };
}

// ---------------------------------------------------------------------------------------------
// The prediction

/** Predictions per second of sim time, and most vessels followed at once. */
const RATE = 5;
const MAX_VESSELS = 2;

/** What one vessel's prediction needs from the world, or null (unknown body, no mass). */
export function predictionFor(ctx: Pick<SystemContext, 'world'>, v: WorldVessel): Prediction | null {
	const body = ctx.world.body(v.soi);
	if (!body || body.radius === 0 || !v.mass) return null;
	return predict({
		r: v.position,
		v: v.velocity,
		mu: body.mu,
		radius: body.radius,
		soi: body.soi,
		omega: body.angularVelocity,
		rotation: body.rotation,
		atmosphereHeight: body.atmosphereHeight,
		air: (altitude) => ctx.world.atmosphere(v.soi, altitude),
		machFactor: machDragFactor,
		ground: (p) => ctx.world.groundHeight(v.soi, p) ?? 0,
		mass: v.mass,
		dragArea: v.dragArea ?? 0
	});
}

/** The vessels worth a prediction: the player's, in the air or falling back to it. */
const candidates = (ctx: SystemContext): WorldVessel[] =>
	ctx.world
		.vessels({ situation: ['flying', 'sub-orbital'], owner: 'player', noDebris: true })
		.filter((v) => v.type !== 'flag' && v.type !== 'eva')
		.slice(0, MAX_VESSELS);

// ---------------------------------------------------------------------------------------------
// How it looks (plan 366)

/** Nothing is drawn within this of the vessel, m: the arc must not run through the camera. */
export const CLEAR_OF_VESSEL = 30;
/** Over this distance from the vessel the arc fades up from faint to full, m. */
const NEAR_FADE = 600;
/** The arc in pieces, each coloured by its heating. */
const PIECES = 10;
/** Opacity of the arc at full: thin and see-through, it marks without hiding. */
const ARC_ALPHA = 0.8;

const COLORS = { impact: '#ff4d4d', target: '#ffb300' } as const;
/**
 * The heating along the path, √ρ·v³ in units of 10⁹ (the Sutton–Graves form without the nose
 * radius): cool green, warm yellow, hot orange, red where a re-entry glows.
 */
const HEAT = [
	{ below: 0.05, rgb: '22c55e', name: 'cool' },
	{ below: 0.3, rgb: 'eab308', name: 'warm' },
	{ below: 1, rgb: 'f97316', name: 'hot' },
	{ below: Number.POSITIVE_INFINITY, rgb: 'ef4444', name: 'glowing' }
] as const;
export const heatOf = (s: { speed: number; density: number }): number =>
	(Math.sqrt(s.density) * s.speed ** 3) / 1e9;
/** The word for a heating level: cool, warm, hot, glowing. */
export const heatName = (heat: number): string => HEAT.find((h) => heat < h.below)!.name;
const heatColor = (heat: number, alpha: number): string => {
	const rgb = HEAT.find((h) => heat < h.below)!.rgb;
	const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
	return `#${rgb}${a.toString(16).padStart(2, '0')}`;
};

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * The arc as pieces: points closer than `CLEAR_OF_VESSEL` to the vessel dropped, each piece
 * coloured by its hottest point, fading up over the first `NEAR_FADE` metres, times `alpha`.
 */
export function arcPieces(
	p: Pick<Prediction, 'path' | 'samples'>,
	alpha: number
): { points: Vec3[]; color: string }[] {
	const start = p.path[0];
	if (!start) return [];
	let first = 0;
	while (first < p.path.length - 1 && dist(p.path[first]!, start) < CLEAR_OF_VESSEL) first++;
	const points = p.path.slice(first);
	const samples = p.samples.slice(first);
	if (points.length < 2) return [];
	// pieces share their end points, so a piece of `size` points advances `size - 1`
	const size = Math.ceil((points.length - 1) / PIECES) + 1;
	const out: { points: Vec3[]; color: string }[] = [];
	for (let i = 0; i < points.length - 1; i += size - 1) {
		const piece = points.slice(i, i + size);
		if (piece.length < 2) break;
		const heat = Math.max(...samples.slice(i, i + size).map(heatOf));
		const near = Math.min(1, dist(piece[0]!, start) / NEAR_FADE);
		out.push({ points: piece, color: heatColor(heat, alpha * (0.25 + 0.75 * near)) });
	}
	return out;
}

export const clock = (s: number): string =>
	s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
export const kmText = (m: number): string => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

/** One vessel's shapes for the views it shows in, and its numbers for the Landing tab. */
function shapesOf(
	ctx: SystemContext,
	v: WorldVessel,
	p: Prediction,
	seen: Visibility,
	meta: Record<string, number | string>
): OverlayShape[] {
	const body = ctx.world.body(v.soi)!;
	const impact = p.impact!;
	const distance = surfaceDistance(p.path[0]!, impact.position, body.radius);
	meta[`time:${v.id}`] = Math.round(impact.time);
	meta[`distance:${v.id}`] = Math.round(distance);
	meta[`speed:${v.id}`] = Math.round(impact.speed);
	meta[`heat:${v.id}`] = Math.round(Math.max(0, ...p.samples.map(heatOf)) * 100) / 100;
	const target = ctx.store(LandingTarget).get();
	let ground: Vec3 | null = null;
	if (target && target.body === v.soi) {
		// drawn at the impact's radius, so it sits on the ground near it
		ground = pointAt(target.lat, target.lon, Math.hypot(impact.position.x, impact.position.y, impact.position.z));
		meta[`error:${v.id}`] = Math.round(surfaceDistance(ground, impact.position, body.radius));
	}
	/** The shapes for one view at an opacity. */
	const drawn = (views: readonly ('flight' | 'map')[], alpha: number): OverlayShape[] => {
		const common = { body: v.soi, frame: 'body-fixed' as const, vessel: v.id, views };
		const out: OverlayShape[] = arcPieces(p, alpha * ARC_ALPHA).map((piece) => ({
			...common,
			kind: 'polyline',
			points: piece.points,
			color: piece.color,
			width: 2
		}));
		out.push(
			{ ...common, kind: 'marker', position: impact.position, style: 'cross', color: COLORS.impact, size: 24 },
			{
				...common,
				kind: 'label',
				position: impact.position,
				color: COLORS.impact,
				text: `${clock(impact.time)} · ${kmText(distance)}`
			}
		);
		if (ground) {
			const error = meta[`error:${v.id}`] as number;
			out.push(
				{ ...common, kind: 'marker', position: ground, style: 'target', color: COLORS.target, size: 26 },
				{
					...common,
					kind: 'polyline',
					points: [impact.position, ground],
					color: `${COLORS.target}cc`,
					width: 1.5,
					dash: { on: 60, off: 40 }
				},
				{ ...common, kind: 'label', position: ground, color: COLORS.target, text: `Target · ${kmText(error)} off` }
			);
		}
		return out;
	};
	// one set for both views when they look the same, else one per view
	if (seen.map && seen.flight >= 1) return drawn(['flight', 'map'], 1);
	return [...(seen.flight > 0 ? drawn(['flight'], seen.flight) : []), ...(seen.map ? drawn(['map'], 1) : [])];
}

/** Sim time of the last prediction, per running sim (its event bus). Not saved: overlays are not. */
const last = new WeakMap<object, number>();

export const Predictor = defineSystem({
	id: 'guidance.predictor',
	phase: 'post-physics',
	update(_world, _dt, ctx) {
		const t = ctx.world.time;
		const before = last.get(ctx.events);
		if (before !== undefined && t - before < 1 / RATE && t >= before) return;
		last.set(ctx.events, t);
		const settings = ctx.store(PathSettings).get();
		const shapes: OverlayShape[] = [];
		const meta: Record<string, number | string> = {};
		for (const v of candidates(ctx)) {
			// only when it could show: the prediction is the cost
			if (!settings.show && v.autopilot !== LAND) continue;
			const p = predictionFor(ctx, v);
			const seen = visibility(settings, v, p);
			if (p && (seen.map || seen.flight > 0)) shapes.push(...shapesOf(ctx, v, p, seen, meta));
		}
		if (shapes.length === 0) ctx.overlays.clear(PATH.id);
		else ctx.overlays.set(PATH.id, shapes, meta);
	},
	on: {
		// the Landing tab's controls (ADR 0292 point 6)
		'mod:key': (e, ctx) => {
			const redraw = (): void => void last.delete(ctx.events);
			if (e.key === SET_PATH.id) {
				if (typeof e.data?.show === 'boolean') ctx.store(PathSettings).set({ show: e.data.show });
				return redraw();
			}
			if (e.key === CLEAR_TARGET.id) {
				ctx.store(LandingTarget).set(null);
				ctx.notify('Landing target cleared', { tone: 'info' });
				return redraw();
			}
			if (e.key === PICK_TARGET.id) {
				const d = e.data;
				const body = typeof d?.body === 'string' ? d.body : null;
				const dir = { x: Number(d?.x), y: Number(d?.y), z: Number(d?.z) };
				if (!body || !ctx.world.body(body) || ![dir.x, dir.y, dir.z].every(Number.isFinite)) return;
				ctx.store(LandingTarget).set({ body, ...latLonOf(dir) });
				ctx.notify('Landing target set', { tone: 'success' });
				return redraw();
			}
			if (e.key !== SET_TARGET.id || e.vessel === undefined) return;
			const v = ctx.world.vessel(e.vessel);
			const p = v ? predictionFor(ctx, v) : null;
			if (!v || !p?.impact) {
				ctx.notify('No predicted impact to aim at', { tone: 'warning', vessel: e.vessel });
				return;
			}
			ctx.store(LandingTarget).set({ body: v.soi, ...latLonOf(p.impact.position) });
			ctx.notify('Landing target set at the predicted impact', { tone: 'success', vessel: e.vessel });
			redraw();
		}
	}
});

// ---------------------------------------------------------------------------------------------
// What the Landing tab reads and sends

/** The flown vessel's number from the published overlay. */
export const pathMeta = (i: PanelInput, key: string): number | null => {
	const id = i.vessel?.id;
	const value = id === undefined ? undefined : i.world?.overlay(PATH.id)?.meta?.[`${key}:${id}`];
	return typeof value === 'number' ? value : null;
};
export const pathSettingsOf = (i: PanelInput): PathSettingsValue => {
	const s = PathSettings.schema.safeParse(i.world?.store(PathSettings.id));
	return s.success ? s.data : PathSettings.initial;
};
export const landingTargetOf = (i: PanelInput): LandingTargetValue | null => {
	const s = LandingTarget.schema.safeParse(i.world?.store(LandingTarget.id));
	return s.success ? s.data : null;
};
export const pathKey = (i: PanelInput, id: string, data?: Record<string, number | string | boolean>): Command => ({
	type: 'mod-key',
	key: id,
	...(i.vessel ? { vessel: i.vessel.id as EntityId } : {}),
	...(data ? { data } : {})
});
