/**
 * Trajectories (plan 347, ADR 0296): the predicted path of a vessel through the air to the ground,
 * with a cross-hair where it comes down, like KSP's mod of the name. A plain mod and the reference
 * example of the World API and overlays:
 *  1. a sim system reads the world (`ctx.world`: the vessel, its body, the air, the ground),
 *  2. predicts with `predict` (RK4 with drag, coasting),
 *  3. publishes shapes (`ctx.overlays.set`) that the renderer draws in Flight and the map,
 *  4. keeps a landing target in a store, set from its panel through a key event (`mod:key`).
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
	type EntityId,
	type OverlayShape,
	type PanelInput,
	type SystemContext,
	type WorldVessel
} from '@orbital/sdk';
import { latLonOf, pointAt, predict, surfaceDistance, type Prediction } from './predict.ts';

export { latLonOf, pointAt, predict, rotate, surfaceDistance } from './predict.ts';
export type { Prediction, PredictInput } from './predict.ts';

export const PATH = defineOverlay({
	id: 'trajectories.path',
	title: 'Trajectories',
	description:
		'The predicted path through the air to the ground, the impact point and your landing target.',
	// on, but in `auto` it draws only while it helps (see `Show`)
	defaultOn: true
});

/** The landing target: a point on a body's surface, latitude and longitude in rad. */
export const Target = defineStore({
	id: 'trajectories.target',
	schema: z.object({ body: z.string(), lat: z.number(), lon: z.number() }).nullable(),
	initial: null as { body: string; lat: number; lon: number } | null
});

/** Panel buttons send these keys (unbound by default; the player may bind them). */
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

/**
 * When the path shows (owner, 2026-10-22: always on, it got in the way on every climb): `auto`
 * only while it helps, falling back down, landing on the autopilot or aiming at a target;
 * `always` whenever the vessel is in the air; `off` never.
 */
export const SHOW_MODES = ['auto', 'always', 'off'] as const;
export type ShowMode = (typeof SHOW_MODES)[number];
export const Show = defineStore({
	id: 'trajectories.show',
	schema: z.enum(SHOW_MODES),
	initial: 'auto' as ShowMode
});
/** The panel's Show choice sends one of these keys (unbound by default). */
export const SHOW_KEYS: Record<ShowMode, ReturnType<typeof defineKeybinding>> = {
	auto: defineKeybinding({
		id: 'trajectories.show-auto',
		label: 'Trajectories: show the path while falling or landing',
		defaults: []
	}),
	always: defineKeybinding({
		id: 'trajectories.show-always',
		label: 'Trajectories: always show the path',
		defaults: []
	}),
	off: defineKeybinding({
		id: 'trajectories.show-off',
		label: 'Trajectories: hide the path',
		defaults: []
	})
};

/** The landing autopilot of the Guidance Computer: while it flies, the path shows in `auto`. */
const LANDING_AUTOPILOT = 'guidance.land';
/** Falling faster than this toward the body, m/s, counts as coming down. */
const FALLING = 2;
/** Closer to the ground than this, m, the path is a stub under the vessel: not drawn. */
const NEAR_GROUND = 25;

/**
 * Whether `v`'s path is worth drawing in `mode`. In `auto`: not on the way up (the prediction
 * leaves the engines out, so a climbing rocket's path falls straight back to the pad), but once
 * it comes down, while the landing autopilot flies it, or with a landing target set.
 */
export function shows(mode: ShowMode, v: WorldVessel, targetSet: boolean): boolean {
	if (mode === 'off') return false;
	if (v.radarAltitude !== null && v.radarAltitude < NEAR_GROUND) return false;
	if (mode === 'always') return true;
	const r = Math.hypot(v.position.x, v.position.y, v.position.z);
	const radial =
		r > 0
			? (v.position.x * v.velocity.x + v.position.y * v.velocity.y + v.position.z * v.velocity.z) /
				r
			: 0;
	return radial < -FALLING || v.autopilot === LANDING_AUTOPILOT || targetSet;
}

/** Predictions per second of sim time, and most vessels followed at once. */
const RATE = 5;
const MAX_VESSELS = 4;
const COLORS = { path: '#22c55e', impact: '#ff3b3b', target: '#ffb300' } as const;

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
		.filter((v) => v.type !== 'flag')
		.slice(0, MAX_VESSELS);

/** The shapes of one vessel's prediction, and its numbers for the panel. */
function shapesOf(
	ctx: SystemContext,
	v: WorldVessel,
	p: Prediction,
	meta: Record<string, number | string>
): OverlayShape[] {
	const body = ctx.world.body(v.soi)!;
	const common = { body: v.soi, frame: 'body-fixed' as const, vessel: v.id };
	const out: OverlayShape[] = [
		{ ...common, kind: 'polyline', points: p.path, color: COLORS.path, width: 3 }
	];
	if (p.impact) {
		const here = p.path[0]!;
		const distance = surfaceDistance(here, p.impact.position, body.radius);
		meta[`time:${v.id}`] = Math.round(p.impact.time);
		meta[`distance:${v.id}`] = Math.round(distance);
		meta[`speed:${v.id}`] = Math.round(p.impact.speed);
		out.push(
			{
				...common,
				kind: 'marker',
				position: p.impact.position,
				style: 'cross',
				color: COLORS.impact,
				size: 28
			},
			{
				...common,
				kind: 'label',
				position: p.impact.position,
				color: COLORS.impact,
				text: `Impact ${clock(p.impact.time)}`
			}
		);
		const target = ctx.store(Target).get();
		if (target && target.body === v.soi) {
			// drawn at the impact's radius, so it sits on the ground near it
			const r = Math.hypot(p.impact.position.x, p.impact.position.y, p.impact.position.z);
			const ground = pointAt(target.lat, target.lon, r);
			const error = surfaceDistance(ground, p.impact.position, body.radius);
			meta[`error:${v.id}`] = Math.round(error);
			out.push(
				{
					...common,
					kind: 'marker',
					position: ground,
					style: 'target',
					color: COLORS.target,
					size: 30
				},
				{
					...common,
					kind: 'polyline',
					points: [p.impact.position, ground],
					color: COLORS.target,
					width: 2,
					dash: { on: 60, off: 40 }
				},
				{
					...common,
					kind: 'label',
					position: ground,
					color: COLORS.target,
					text: `Target ${km(error)} off`
				}
			);
		}
	}
	return out;
}

const clock = (s: number): string =>
	s < 60
		? `${Math.round(s)} s`
		: `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const km = (m: number): string => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

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
		const shapes: OverlayShape[] = [];
		const meta: Record<string, number | string> = {};
		const mode = ctx.store(Show).get();
		const target = ctx.store(Target).get();
		for (const v of candidates(ctx)) {
			if (!shows(mode, v, target !== null && target.body === v.soi)) continue;
			const p = predictionFor(ctx, v);
			if (p) shapes.push(...shapesOf(ctx, v, p, meta));
		}
		if (shapes.length === 0) ctx.overlays.clear(PATH.id);
		else ctx.overlays.set(PATH.id, shapes, meta);
	},
	on: {
		// the panel's buttons (ADR 0292 point 6)
		'mod:key': (e, ctx) => {
			const show = SHOW_MODES.find((m) => SHOW_KEYS[m].id === e.key);
			if (show) {
				ctx.store(Show).set(show);
				// redraw at once, not at the next prediction
				last.delete(ctx.events);
				return;
			}
			if (e.key === CLEAR_TARGET.id) {
				ctx.store(Target).set(null);
				ctx.notify('Landing target cleared', { tone: 'info' });
				return;
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
		}
	}
});

/** The flown vessel's numbers from the published overlay. */
const metaOf = (i: PanelInput, key: string): number | null => {
	const id = i.vessel?.id;
	const value = id === undefined ? undefined : i.world?.overlay(PATH.id)?.meta?.[`${key}:${id}`];
	return typeof value === 'number' ? value : null;
};
const vesselKey = (
	i: PanelInput,
	key: string
): { type: 'mod-key'; key: string; vessel?: EntityId } | null =>
	i.vessel ? { type: 'mod-key', key, vessel: i.vessel.id } : null;

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
				label: 'Show the path',
				options: [
					{ value: 'auto', label: 'Falling or landing' },
					{ value: 'always', label: 'Always' },
					{ value: 'off', label: 'Off' }
				],
				value: (i) => {
					const v = i.world?.store(Show.id);
					return typeof v === 'string' ? v : 'auto';
				},
				command: (i, value) => {
					const mode = SHOW_MODES.find((m) => m === value);
					return mode
						? {
								type: 'mod-key',
								key: SHOW_KEYS[mode].id,
								...(i.vessel ? { vessel: i.vessel.id } : {})
							}
						: null;
				}
			},
			{
				kind: 'notice',
				text: (i) =>
					metaOf(i, 'time') !== null
						? 'Coasting: engines are not in the prediction.'
						: i.world?.store(Show.id) === 'off'
							? 'The path is hidden.'
							: i.world?.store(Show.id) === 'always'
								? 'The path shows while you fly in the air or fall back to it.'
								: 'The path shows once you come down, on the landing autopilot, or with a landing target.',
				tone: () => 'info'
			},
			{
				kind: 'readout',
				label: 'Impact in',
				value: (i) => {
					const s = metaOf(i, 'time');
					return s === null ? null : clock(s);
				}
			},
			{ kind: 'readout', label: 'Distance', value: (i) => metaOf(i, 'distance'), unit: 'm' },
			{ kind: 'readout', label: 'Speed at impact', value: (i) => metaOf(i, 'speed'), unit: 'm/s' },
			{ kind: 'readout', label: 'Target error', value: (i) => metaOf(i, 'error'), unit: 'm' },
			{
				kind: 'button',
				label: 'Set target at impact',
				tone: 'primary',
				command: (i) => vesselKey(i, SET_TARGET.id)
			},
			{
				kind: 'button',
				label: 'Clear target',
				command: (i) => (i.world?.store(Target.id) ? vesselKey(i, CLEAR_TARGET.id) : null)
			}
		]
	}
});

export default definePlugin({
	meta: { id: 'trajectories', version: '1.0.0', api: '^0.1.107' },
	depends: ['stock'],
	setup(ctx) {
		ctx.overlays.register(PATH);
		ctx.stores.register(Target);
		ctx.stores.register(Show);
		ctx.keybindings.register(SET_TARGET);
		ctx.keybindings.register(CLEAR_TARGET);
		for (const m of SHOW_MODES) ctx.keybindings.register(SHOW_KEYS[m]);
		ctx.systems.register(Predictor);
		ctx.panels.register(TrajectoriesPanel);
	}
});
