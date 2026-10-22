/**
 * Trajectories (plans 347 and 366, ADRs 0296 and 0307): the predicted path of a vessel through the
 * air to the ground, with a cross-hair where it comes down, like KSP's mod of the name. A plain mod
 * and the reference example of the World API and overlays:
 *  1. a sim system reads the world (`ctx.world`: the vessel, its body, the air, the ground),
 *  2. predicts with `predict` (RK4 with drag, coasting),
 *  3. publishes shapes (`ctx.overlays.set`) that the renderer draws in Flight and the map,
 *  4. keeps its settings and a landing target in stores, set from its panel through key events
 *     (`mod:key`), the target also by a click on the map (a `pick` node).
 *
 * When it shows (owner, 2026-10-22: "trajectory linenya udah muncul ... mengganggu"): never on the
 * ground or on the pad, never on a stable orbit (the map's orbit line is the tool there); only once
 * the path comes down to the ground. In Flight it fades in as the vessel climbs past 1 km; the map
 * shows it whenever it has an impact. Re-entry is the case it is for.
 */
import {
	defineKeybinding,
	defineOverlay,
	definePanel,
	definePlugin,
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
import {
	latLonOf,
	pointAt,
	predict,
	surfaceDistance,
	type Prediction,
	type Vec3
} from './predict.ts';

export { latLonOf, pointAt, predict, rotate, surfaceDistance } from './predict.ts';
export type { Prediction, PredictInput } from './predict.ts';

export const PATH = defineOverlay({
	id: 'trajectories.path',
	title: 'Trajectories',
	description:
		'The predicted path through the air to the ground, the impact point and your landing target.',
	// on; the mod's own rules and its panel's settings decide when there is something to draw
	defaultOn: true
});

// ---------------------------------------------------------------------------------------------
// Settings and the landing target (stores, saved with the world)

/** Where the path shows: nowhere, in the map only, or in Flight and the map (the default). */
export const SHOW = ['off', 'map', 'both'] as const;
export type ShowWhere = (typeof SHOW)[number];
export const Settings = defineStore({
	id: 'trajectories.settings',
	schema: z.object({ show: z.enum(SHOW), descendingOnly: z.boolean() }),
	initial: { show: 'both' as ShowWhere, descendingOnly: false }
});
export type TrajectorySettings = z.infer<typeof Settings.schema>;

/** The landing target: a point on a body's surface, latitude and longitude in rad. */
export const Target = defineStore({
	id: 'trajectories.target',
	schema: z.object({ body: z.string(), lat: z.number(), lon: z.number() }).nullable(),
	initial: null as { body: string; lat: number; lon: number } | null
});

/** The panel's controls send these keys; a player may bind the first two. */
export const SET_TARGET = defineKeybinding({
	id: 'trajectories.set-target',
	label: 'Trajectories: landing target at the predicted impact',
	defaults: []
});
export const CLEAR_TARGET = defineKeybinding({
	id: 'trajectories.clear-target',
	label: 'Trajectories: clear the landing target',
	defaults: []
});
/** A map pick (`data`: body and direction) and a settings change (`data`: show, descendingOnly). */
export const PICK_TARGET = defineKeybinding({
	id: 'trajectories.pick-target',
	label: 'Trajectories: landing target picked on the map',
	defaults: [],
	hidden: true
});
export const SET_SETTINGS = defineKeybinding({
	id: 'trajectories.set-settings',
	label: 'Trajectories: settings',
	defaults: [],
	hidden: true
});

// ---------------------------------------------------------------------------------------------
// When it shows (plan 366, ADR 0307 point 1)

/** Falling faster than this toward the body, m/s, counts as coming down. */
const FALLING = 2;
/** In Flight the arc fades in between these heights above the ground, m. */
export const FADE_FROM = 1_000;
export const FADE_TO = 2_000;

export interface Visibility {
	/** The arc's opacity factor in Flight, 0 (hidden) to 1. */
	flight: number;
	/** Shown in the map. */
	map: boolean;
}
const HIDDEN: Visibility = { flight: 0, map: false };

/** The vessel's speed toward (negative) or away from the body centre, m/s. */
export function radialSpeed(v: Pick<WorldVessel, 'position' | 'velocity'>): number {
	const r = Math.hypot(v.position.x, v.position.y, v.position.z);
	return r > 0
		? (v.position.x * v.velocity.x + v.position.y * v.velocity.y + v.position.z * v.velocity.z) / r
		: 0;
}

/**
 * Where `v`'s path shows: never on the ground or the pad, never on a stable orbit or without an
 * impact; with `descendingOnly`, only while it comes down. In Flight the arc fades in from 1 to
 * 2 km above the ground; the map shows it whenever it hits the ground.
 */
export function visibility(
	settings: TrajectorySettings,
	v: Pick<WorldVessel, 'situation' | 'radarAltitude' | 'altitude' | 'position' | 'velocity'>,
	p: Pick<Prediction, 'impact'> | null
): Visibility {
	if (settings.show === 'off') return HIDDEN;
	if (v.situation !== 'flying' && v.situation !== 'sub-orbital') return HIDDEN;
	if (!p?.impact) return HIDDEN;
	if (settings.descendingOnly && radialSpeed(v) >= -FALLING) return HIDDEN;
	const height = v.radarAltitude ?? v.altitude ?? 0;
	const fade = Math.min(1, Math.max(0, (height - FADE_FROM) / (FADE_TO - FADE_FROM)));
	return { flight: settings.show === 'both' ? fade : 0, map: true };
}

// ---------------------------------------------------------------------------------------------
// The prediction

/** Predictions per second of sim time, and most vessels followed at once. */
const RATE = 5;
const MAX_VESSELS = 2;

/** What one vessel's prediction needs from the world, or null (unknown body, no mass). */
export function predictionFor(
	ctx: Pick<SystemContext, 'world'>,
	v: WorldVessel
): Prediction | null {
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
// How it looks (plan 366, ADR 0307 point 2)

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
	{ below: 0.05, rgb: '22c55e' },
	{ below: 0.3, rgb: 'eab308' },
	{ below: 1, rgb: 'f97316' },
	{ below: Number.POSITIVE_INFINITY, rgb: 'ef4444' }
] as const;
export const heatOf = (s: { speed: number; density: number }): number =>
	(Math.sqrt(s.density) * s.speed ** 3) / 1e9;
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

const clock = (s: number): string =>
	s < 60
		? `${Math.round(s)} s`
		: `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const km = (m: number): string => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

/** One vessel's shapes for the views it shows in, and its numbers for the panel. */
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
	const target = ctx.store(Target).get();
	let ground: Vec3 | null = null;
	if (target && target.body === v.soi) {
		// drawn at the impact's radius, so it sits on the ground near it
		ground = pointAt(
			target.lat,
			target.lon,
			Math.hypot(impact.position.x, impact.position.y, impact.position.z)
		);
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
			{
				...common,
				kind: 'marker',
				position: impact.position,
				style: 'cross',
				color: COLORS.impact,
				size: 24
			},
			{
				...common,
				kind: 'label',
				position: impact.position,
				color: COLORS.impact,
				text: `${clock(impact.time)} · ${km(distance)}`
			}
		);
		if (ground) {
			const error = meta[`error:${v.id}`] as number;
			out.push(
				{
					...common,
					kind: 'marker',
					position: ground,
					style: 'target',
					color: COLORS.target,
					size: 26
				},
				{
					...common,
					kind: 'polyline',
					points: [impact.position, ground],
					color: `${COLORS.target}cc`,
					width: 1.5,
					dash: { on: 60, off: 40 }
				},
				{
					...common,
					kind: 'label',
					position: ground,
					color: COLORS.target,
					text: `Target · ${km(error)} off`
				}
			);
		}
		return out;
	};
	// one set for both views when they look the same, else one per view
	if (seen.map && seen.flight >= 1) return drawn(['flight', 'map'], 1);
	return [
		...(seen.flight > 0 ? drawn(['flight'], seen.flight) : []),
		...(seen.map ? drawn(['map'], 1) : [])
	];
}

/** Sim time of the last prediction, per running sim (its event bus). Not saved: overlays are not. */
const last = new WeakMap<object, number>();

export const Predictor = defineSystem({
	id: 'trajectories.predictor',
	phase: 'post-physics',
	update(_world, _dt, ctx) {
		const t = ctx.world.time;
		const before = last.get(ctx.events);
		if (before !== undefined && t - before < 1 / RATE && t >= before) return;
		last.set(ctx.events, t);
		const settings = ctx.store(Settings).get();
		const shapes: OverlayShape[] = [];
		const meta: Record<string, number | string> = {};
		if (settings.show !== 'off') {
			for (const v of candidates(ctx)) {
				const p = predictionFor(ctx, v);
				const seen = visibility(settings, v, p);
				if (p && (seen.map || seen.flight > 0)) shapes.push(...shapesOf(ctx, v, p, seen, meta));
			}
		}
		if (shapes.length === 0) ctx.overlays.clear(PATH.id);
		else ctx.overlays.set(PATH.id, shapes, meta);
	},
	on: {
		// the panel's controls (ADR 0292 point 6)
		'mod:key': (e, ctx) => {
			const redraw = (): void => void last.delete(ctx.events);
			if (e.key === SET_SETTINGS.id) {
				const now = ctx.store(Settings).get();
				const show = SHOW.find((s) => s === e.data?.show) ?? now.show;
				const descendingOnly =
					typeof e.data?.descendingOnly === 'boolean' ? e.data.descendingOnly : now.descendingOnly;
				ctx.store(Settings).set({ show, descendingOnly });
				return redraw();
			}
			if (e.key === CLEAR_TARGET.id) {
				ctx.store(Target).set(null);
				ctx.notify('Landing target cleared', { tone: 'info' });
				return redraw();
			}
			if (e.key === PICK_TARGET.id) {
				const d = e.data;
				const body = typeof d?.body === 'string' ? d.body : null;
				const dir = { x: Number(d?.x), y: Number(d?.y), z: Number(d?.z) };
				if (!body || !ctx.world.body(body) || ![dir.x, dir.y, dir.z].every(Number.isFinite)) return;
				ctx.store(Target).set({ body, ...latLonOf(dir) });
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
			ctx.store(Target).set({ body: v.soi, ...latLonOf(p.impact.position) });
			ctx.notify('Landing target set at the predicted impact', {
				tone: 'success',
				vessel: e.vessel
			});
			redraw();
		}
	}
});

// ---------------------------------------------------------------------------------------------
// The panel (plan 366, ADR 0307 point 3)

/** The flown vessel's numbers from the published overlay. */
const metaOf = (i: PanelInput, key: string): number | null => {
	const id = i.vessel?.id;
	const value = id === undefined ? undefined : i.world?.overlay(PATH.id)?.meta?.[`${key}:${id}`];
	return typeof value === 'number' ? value : null;
};
const settingsOf = (i: PanelInput): TrajectorySettings => {
	const s = Settings.schema.safeParse(i.world?.store(Settings.id));
	return s.success ? s.data : Settings.initial;
};
const key = (
	i: PanelInput,
	id: string,
	data?: Record<string, number | string | boolean>
): Command => ({
	type: 'mod-key',
	key: id,
	...(i.vessel ? { vessel: i.vessel.id as EntityId } : {}),
	...(data ? { data } : {})
});

/** Why nothing shows for the flown vessel, or null when the path is drawn. */
function idleReason(i: PanelInput): string | null {
	if (metaOf(i, 'time') !== null) return null;
	const s = settingsOf(i);
	if (s.show === 'off') return 'The path is off.';
	const sit = i.vessel?.situation;
	if (!sit || sit === 'prelaunch' || sit === 'landed' || sit === 'splashed')
		return 'The path shows once you fly and your path comes back down to the ground.';
	if (sit === 'orbiting' || sit === 'escaping')
		return 'On a stable orbit: the map shows your orbit. The path returns when it comes down.';
	if (s.descendingOnly) return 'The path shows while you come down.';
	return 'The path shows once it comes down to the ground.';
}

export const TrajectoriesPanel = definePanel({
	id: 'trajectories.panel',
	title: 'Trajectories',
	icon: 'orbit',
	order: 650,
	contexts: ['flight', 'map'],
	view: {
		kind: 'section',
		children: [
			{
				kind: 'select',
				label: 'Show',
				options: [
					{ value: 'off', label: 'Off' },
					{ value: 'map', label: 'Map only' },
					{ value: 'both', label: 'Flight + map' }
				],
				value: (i) => settingsOf(i).show,
				command: (i, value) => key(i, SET_SETTINGS.id, { show: value })
			},
			{
				kind: 'switch',
				label: 'Only when descending',
				value: (i) => settingsOf(i).descendingOnly,
				command: (i, on) => key(i, SET_SETTINGS.id, { descendingOnly: on })
			},
			{ kind: 'notice', text: idleReason, tone: () => 'info' },
			{
				kind: 'readout',
				label: 'Impact in',
				value: (i) => {
					const s = metaOf(i, 'time');
					return s === null ? null : clock(s);
				}
			},
			{
				kind: 'readout',
				label: 'Distance',
				value: (i) => {
					const m = metaOf(i, 'distance');
					return m === null ? null : km(m);
				}
			},
			{ kind: 'readout', label: 'Speed at impact', value: (i) => metaOf(i, 'speed'), unit: 'm/s' },
			{
				kind: 'readout',
				label: 'Target error',
				value: (i) => {
					const m = metaOf(i, 'error');
					return m === null ? null : km(m);
				}
			},
			{
				kind: 'pick',
				label: 'Pick target on the map',
				tone: 'primary',
				hint: 'Click the ground on the map to set the landing target',
				command: (i, pick) =>
					key(i, PICK_TARGET.id, {
						body: pick.body,
						x: pick.direction.x,
						y: pick.direction.y,
						z: pick.direction.z
					})
			},
			{
				kind: 'button',
				label: 'Target at impact',
				command: (i) => (metaOf(i, 'time') !== null ? key(i, SET_TARGET.id) : null)
			},
			{
				kind: 'button',
				label: 'Clear target',
				command: (i) => (i.world?.store(Target.id) ? key(i, CLEAR_TARGET.id) : null)
			},
			{
				kind: 'notice',
				text: (i) =>
					metaOf(i, 'time') !== null ? 'Coasting: engines are not in the prediction.' : null,
				tone: () => 'info'
			}
		]
	}
});

export default definePlugin({
	meta: { id: 'trajectories', version: '1.1.0', api: '^0.1.108' },
	depends: ['stock'],
	setup(ctx) {
		ctx.overlays.register(PATH);
		ctx.stores.register(Settings);
		ctx.stores.register(Target);
		for (const k of [SET_TARGET, CLEAR_TARGET, PICK_TARGET, SET_SETTINGS])
			ctx.keybindings.register(k);
		ctx.systems.register(Predictor);
		ctx.panels.register(TrajectoriesPanel);
	}
});
