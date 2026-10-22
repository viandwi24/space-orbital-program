/**
 * The mod World API in the sim (plan 343, ADR 0292): the context systems and autopilots get (the
 * world query, commands, stores, notices), the stores saved with the world, the gate on the
 * commands a mod may send, the coarse situation and its event, and `on` handlers of systems.
 */
import {
	createWorldQuery,
	storeProblem,
	type Command,
	type CommandResult,
	type EntityId,
	type ModCommands,
	type ModContext,
	type ModOverlays,
	type OverlayLayer,
	clampOverlay,
	cleanMeta,
	type NoticeTone,
	type Store,
	type StoreDefinition,
	type SystemContext,
	type SystemDefinition,
	type VesselSituation,
	type WorldQuery,
	type WorldTick
} from '@orbital/core';
import { dispatch } from './commands.ts';
import { vesselIds, vesselOf, type SimCore } from './core.ts';
import { debugAllowed } from './debug.ts';
import { takeSnapshot } from './snapshot.ts';
import { vesselSituationNow } from './situation.ts';
import { terrainUnder } from './terrain.ts';
import { VESSEL } from './state.ts';

/** Commands a mod may send (ADR 0292 point 3). */
const MOD_ALLOWED: ReadonlySet<string> = new Set([
	'throttle',
	'wheel-throttle',
	'attitude',
	'set-rcs',
	'transfer',
	'set-flow-lock',
	'stage',
	'trim',
	'sas',
	'autopilot-engage',
	'autopilot-settings',
	'autopilot-disengage',
	'action',
	'action-group',
	'warp',
	'warp-to',
	'node-set',
	'node-remove',
	'add-alarm',
	'remove-alarm',
	'rename-vessel',
	'set-vessel-type',
	'target-set',
	'set-control-part',
	'program-stop',
	'antenna-point',
	'comms-route',
	'move-data',
	'transmit-data',
	'mod-key'
]);

/** Commands a mod may send only while debug tools are allowed (sandbox, or debug mode on). */
const MOD_DEBUG: ReadonlySet<string> = new Set([
	'load-vessel',
	'terminate-vessel',
	'recover-vessel',
	'clear-debris',
	'debug-cheat',
	'debug-set-orbit',
	'debug-set-location',
	'debug-set-resource',
	'debug-set-temperature',
	'debug-set-crew-level'
]);

/** Why a mod may not send `type` now, or undefined (ADR 0292 point 3). */
export function modCommandRefusal(core: SimCore, type: string): string | undefined {
	if (MOD_ALLOWED.has(type)) return undefined;
	if (MOD_DEBUG.has(type)) {
		return debugAllowed(core)
			? undefined
			: `a mod may send "${type}" only while debug tools are allowed (a sandbox world, or debug mode on)`;
	}
	return `a mod may not send "${type}" (ADR 0292 point 3)`;
}

/** What a vessel's situation was decided from, and when. */
interface SituationMark {
	at: number;
	soi: string;
	mode: string;
	/** The rails kind; for a fixed conic its size and shape (a rebase keeps them). */
	rails: string | null;
	a: number;
	e: number;
	pass: number;
	situation: VesselSituation;
}

interface ModState {
	/** Store values by id: deep-frozen copies. */
	stores: Map<string, unknown>;
	/** The snapshot's view, rebuilt after a write. */
	view: Readonly<Record<string, unknown>> | null;
	/** The world query of the current sim time. */
	query: { t: number; world: WorldQuery } | null;
	contexts: Map<string, ModContext>;
	/** Published overlays by id (ADR 0296 point 3), and the snapshot's view of them. */
	overlays: Map<string, OverlayLayer>;
	overlayView: Readonly<Record<string, OverlayLayer>> | null;
	systems: Map<string, SystemContext>;
	situations: Map<number, SituationMark>;
	/** Pass counter of `updateSituations`: marks of vessels that are gone keep an older one. */
	pass: number;
	/** Something may have changed a rails vessel's situation since the last pass. */
	dirty: boolean;
}

const states = new WeakMap<SimCore, ModState>();

function stateOf(core: SimCore): ModState {
	let s = states.get(core);
	if (!s) {
		s = {
			stores: new Map(),
			view: null,
			query: null,
			contexts: new Map(),
			overlays: new Map(),
			overlayView: null,
			systems: new Map(),
			situations: new Map(),
			pass: 0,
			dirty: true
		};
		states.set(core, s);
	}
	return s;
}

function deepFreeze<T>(value: T): T {
	if (value !== null && typeof value === 'object') {
		for (const v of Object.values(value)) deepFreeze(v);
		Object.freeze(value);
	}
	return value;
}
const frozenCopy = <T>(value: T): T => deepFreeze(JSON.parse(JSON.stringify(value)) as T);

/**
 * Stores from a save: each registered store's value if it still parses, else its `initial`; values
 * of stores no loaded mod registers are kept as they are (ADR 0292 point 4).
 */
export function restoreStores(core: SimCore, saved: Record<string, unknown> | undefined): void {
	const s = stateOf(core);
	s.stores.clear();
	s.view = null;
	for (const [id, value] of Object.entries(saved ?? {})) {
		const def = core.registries.stores.get(id);
		if (def && storeProblem(def, value) !== undefined) continue; // falls back to `initial`
		s.stores.set(id, frozenCopy(value));
	}
}

/** The save's `stores`, or undefined when none was written. */
export function saveStores(core: SimCore): Record<string, unknown> | undefined {
	const s = states.get(core);
	if (!s || s.stores.size === 0) return undefined;
	return JSON.parse(JSON.stringify(Object.fromEntries(s.stores))) as Record<string, unknown>;
}

/** The snapshot's `stores` (the same object until a write), or undefined. */
export function storesSnapshot(core: SimCore): Readonly<Record<string, unknown>> | undefined {
	const s = states.get(core);
	if (!s || s.stores.size === 0) return undefined;
	return (s.view ??= Object.freeze(Object.fromEntries(s.stores)));
}

/** The world query of now, built once per sim time (ADR 0292 point 1), with the sim's terrain. */
export function worldQueryOf(core: SimCore): WorldQuery {
	const s = stateOf(core);
	if (s.query?.t !== core.t) {
		s.query = {
			t: core.t,
			world: createWorldQuery(takeSnapshot(core), {
				bodies: core.registries.bodies,
				ground: (id, position) => {
					const body = core.bodies.get(id);
					return body ? terrainUnder(core, body, position) : 0;
				}
			})
		};
	}
	return s.query.world;
}

/** The snapshot's `overlays` (the same object until a publish), or undefined. */
export function overlaysSnapshot(core: SimCore): Readonly<Record<string, OverlayLayer>> | undefined {
	const s = states.get(core);
	if (!s || s.overlays.size === 0) return undefined;
	return (s.overlayView ??= Object.freeze(Object.fromEntries(s.overlays)));
}

function overlaysFor(core: SimCore, plugin: string): ModOverlays {
	const own = (id: string): void => {
		if (!core.registries.overlays.has(id)) throw new RangeError(`overlay "${id}" is not registered`);
		const owner = core.registries.overlays.owner(id);
		if (owner !== plugin) throw new RangeError(`overlay "${id}" belongs to "${owner}"`);
	};
	return {
		set(id, shapes, meta) {
			own(id);
			const { shapes: kept, dropped } = clampOverlay(shapes);
			const clean = cleanMeta(meta);
			const s = stateOf(core);
			s.overlays.set(id, clean ? { shapes: kept, meta: clean } : { shapes: kept });
			s.overlayView = null;
			s.query = null;
			return { dropped };
		},
		clear(id) {
			own(id);
			const s = stateOf(core);
			if (s.overlays.delete(id)) {
				s.overlayView = null;
				s.query = null;
			}
		}
	};
}

const refuse = (reason: string): CommandResult => ({ ok: false, reason });

function commandsFor(core: SimCore, plugin: string): ModCommands {
	const send = (command: Command): CommandResult => {
		const type = (command as { type?: unknown })?.type;
		if (typeof type !== 'string') return refuse('invalid command: no type');
		const why = modCommandRefusal(core, type);
		if (why) return refuse(why);
		// a mod is a program (ADR 0276): the player's override and the signal delay apply as to an autopilot
		const result = dispatch(core, command, 'autopilot');
		if (result.ok) {
			const st = stateOf(core);
			st.query = null; // the next read sees what the command changed
			st.dirty = true;
		}
		return result;
	};
	return {
		send,
		setTarget: (vessel, target) => send({ type: 'target-set', vessel, target }),
		stage: (vessel) => send({ type: 'stage', vessel }),
		actionGroup: (vessel, group, value) =>
			send({ type: 'action-group', vessel, group, ...(value !== undefined ? { value } : {}) }),
		throttle: (vessel, value) => send({ type: 'throttle', vessel, value }),
		sas: (vessel, mode) => send({ type: 'sas', vessel, mode }),
		warp: (factor) => send({ type: 'warp', factor }),
		warpTo: (to, factor = 1_000) =>
			send(
				typeof to === 'number'
					? { type: 'warp-to', time: to, factor }
					: { type: 'warp-to', target: to, factor }
			),
		placeNode: (vessel, node) => send({ type: 'node-set', vessel, ...node }),
		removeNode: (vessel, id) => send({ type: 'node-remove', vessel, ...(id !== undefined ? { id } : {}) }),
		addAlarm: (alarm) => send({ type: 'add-alarm', ...alarm }),
		rename: (vessel, name) => send({ type: 'rename-vessel', vessel, name }),
		engage: (vessel, autopilot, params) =>
			send({ type: 'autopilot-engage', vessel, autopilot, ...(params !== undefined ? { params } : {}) }),
		disengage: (vessel) => send({ type: 'autopilot-disengage', vessel }),
		spawn: (design, placement) =>
			send({ type: 'load-vessel', design, ...(placement ? { placement } : {}) }),
		terminate: (vessel) => send({ type: 'terminate-vessel', vessel }),
		focus(vessel) {
			if (!core.world.hasEntity(vessel) || !core.world.has(vessel, VESSEL))
				return refuse(`vessel ${vessel} does not exist`);
			core.events.emit('mod:focus', { plugin, vessel });
			return { ok: true };
		}
	};
}

function storeFor<T>(core: SimCore, plugin: string, ref: StoreDefinition<T> | string): Store<T> {
	const id = typeof ref === 'string' ? ref : ref.id;
	const def = core.registries.stores.get(id) as StoreDefinition<T> | undefined;
	if (!def) throw new RangeError(`store "${id}" is not registered`);
	const owner = core.registries.stores.owner(id);
	if (owner !== plugin)
		throw new RangeError(`store "${id}" belongs to "${owner}"; "${plugin}" may only read it through ctx.world.store`);
	const s = stateOf(core);
	const get = (): T => (s.stores.has(id) ? (s.stores.get(id) as T) : def.initial);
	const set = (value: T): void => {
		const why = storeProblem(def, value);
		if (why) throw new RangeError(why);
		s.stores.set(id, frozenCopy(value));
		s.view = null;
		if (s.query) s.query = null;
	};
	return { get, set, update: (fn) => set(fn(get())) };
}

/** The mod context of `plugin` (one per plugin and sim). */
export function modContextOf(core: SimCore, plugin: string): ModContext {
	const s = stateOf(core);
	let ctx = s.contexts.get(plugin);
	if (!ctx) {
		const commands = commandsFor(core, plugin);
		ctx = Object.freeze({
			plugin,
			get world() {
				return worldQueryOf(core);
			},
			commands,
			overlays: overlaysFor(core, plugin),
			store: <T>(def: StoreDefinition<T> | string) => storeFor<T>(core, plugin, def),
			notify(text: string, options: { tone?: NoticeTone; vessel?: EntityId; detail?: string } = {}) {
				core.events.emit('mod:notice', {
					plugin,
					text: String(text).slice(0, 200),
					tone: options.tone ?? 'info',
					...(options.detail !== undefined ? { detail: String(options.detail).slice(0, 400) } : {}),
					...(options.vessel !== undefined ? { vessel: options.vessel } : {})
				});
			}
		});
		s.contexts.set(plugin, ctx);
	}
	return ctx;
}

/** The plugin that registered system `id` (`?` when unknown). */
const ownerOfSystem = (core: SimCore, id: string): string => core.registries.systems.owner(id) ?? '?';

/** A system's context: its plugin's mod context plus registries, events, rules and the tick. */
export function systemContextOf(
	core: SimCore,
	system: SystemDefinition,
	rules: SystemContext['rules'],
	tick?: WorldTick
): SystemContext {
	const s = stateOf(core);
	const cached = tick ? undefined : s.systems.get(system.id);
	if (cached) return cached;
	const mod = modContextOf(core, ownerOfSystem(core, system.id));
	const ctx: SystemContext = {
		registries: core.registries,
		events: core.events,
		rules,
		...(tick ? { tick } : {}),
		plugin: mod.plugin,
		get world() {
			return mod.world;
		},
		commands: mod.commands,
		overlays: mod.overlays,
		store: mod.store,
		notify: mod.notify
	};
	if (!tick) s.systems.set(system.id, ctx);
	return ctx;
}

/** Subscribe each system's `on` handlers (ADR 0292 point 5); a throwing handler is skipped. */
export function subscribeSystems(
	core: SimCore,
	systems: readonly SystemDefinition[],
	rules: SystemContext['rules']
): void {
	for (const system of systems) {
		if (!system.on) continue;
		for (const [name, handler] of Object.entries(system.on)) {
			if (typeof handler !== 'function') continue;
			core.events.on(name as 'world:tick', (payload) => {
				try {
					(handler as (p: unknown, c: SystemContext) => void)(payload, systemContextOf(core, system, rules));
				} catch {
					// a broken mod never stops the game (ADR 0271 point 5)
				}
			});
		}
	}
}

/** How often a vessel's situation is checked, s of sim time. */
export const SITUATION_PERIOD = 0.5;

/** Events after which a vessel's situation may differ without any vessel being in physics. */
const SITUATION_EVENTS = [
	'vessel:created',
	'vessel:mode-changed',
	'vessel:soi-changed',
	'vessel:split',
	'vessel:docked',
	'vessel:undocked',
	'vessel:frozen',
	'vessel:thawed'
] as const;

/**
 * With nothing in physics only an event or a command changes a situation: rails chunks check the
 * vessels only then (`situationsDirty`), so a long warp costs nothing per chunk.
 */
export function watchSituations(core: SimCore): void {
	const s = stateOf(core);
	for (const name of SITUATION_EVENTS) core.events.on(name, () => (s.dirty = true));
}

/** A command was applied: a debug orbit or location may have moved a vessel on rails. */
export function markSituations(core: SimCore): void {
	stateOf(core).dirty = true;
}

export const situationsDirty = (core: SimCore): boolean => stateOf(core).dirty;

/**
 * Emit `vessel:situation-changed` for vessels whose coarse situation changed (ADR 0292 point 2):
 * a vessel in physics at most every `SITUATION_PERIOD` of sim time; one on rails when its conic's
 * size or shape changes; any at once after an SOI or mode change. A vessel seen for the first time is recorded without an event.
 */
export function updateSituations(core: SimCore): void {
	const s = stateOf(core);
	s.dirty = false;
	const pass = ++s.pass;
	let count = 0;
	for (const id of vesselIds(core)) {
		count++;
		const v = vesselOf(core, id);
		const last = s.situations.get(id);
		const rails = v.rails;
		const fixed = rails?.kind === 'elements' || rails?.kind === 'surface' || rails?.kind === 'frozen';
		const a = rails?.kind === 'elements' ? rails.elements.a : 0;
		const e = rails?.kind === 'elements' ? rails.elements.e : 0;
		if (last && last.soi === v.soi && last.mode === v.mode) {
			last.pass = pass;
			// on fixed rails only the conic's size and shape matter; else at most every period
			const same = fixed
				? last.rails === rails!.kind && last.a === a && last.e === e
				: last.rails === null && core.t - last.at < SITUATION_PERIOD;
			if (same) continue;
		}
		const situation = vesselSituationNow(core, id);
		s.situations.set(id, {
			at: core.t,
			soi: v.soi,
			mode: v.mode,
			rails: fixed ? rails!.kind : null,
			a,
			e,
			pass,
			situation
		});
		if (last && last.situation !== situation) {
			core.events.emit('vessel:situation-changed', {
				vessel: id,
				from: last.situation,
				to: situation,
				body: v.soi,
				time: core.t
			});
		}
	}
	if (s.situations.size > count)
		for (const [id, mark] of s.situations) if (mark.pass !== pass) s.situations.delete(id);
}
