/**
 * The world tick (plan 082, ADRs 0096 and 0171): once per game day at the day boundary the sim
 * brings background operations of vessels on rails up to date, runs the `world-tick` systems with
 * their own PRNG streams, and emits `world:tick`.
 */
import {
	createRng,
	streamSeed,
	type EntityId,
	type Rng,
	type SaveWorldTick,
	type SystemContext,
	type SystemDefinition,
	type WorldInfo
} from '@orbital/core';
import { moduleDefOf, partOf, vesselIds, vesselOf, type SimCore } from './core.ts';
import { makeContext } from './hooks.ts';
import { economyTick } from './economy.ts';

export interface TickState {
	/** The day last entered; the next tick is for `lastDay + 1`. */
	lastDay: number;
	/** `world-tick` systems in run order. */
	readonly systems: readonly SystemDefinition[];
	/** Stream per system id. */
	readonly streams: ReadonlyMap<string, Rng>;
}

/** Length of a tick day, s: the root body's rotation period (ADR 0171 point 1). */
export const dayLength = (core: Pick<SimCore, 'root'>): number => core.root.def.rotationPeriod;

/** The day `t` falls in (ADR 0171 point 2). */
export function dayAt(info: WorldInfo, length: number, t: number): number {
	return info.epoch.day + Math.floor(info.epoch.fraction + t / length);
}

/** Sim time at which `day` begins; computed from the day number, never accumulated. */
export function dayStart(info: WorldInfo, length: number, day: number): number {
	return (day - info.epoch.day - info.epoch.fraction) * length;
}

/**
 * `world-tick` systems in run order: `order` (default 0), then the boot index of the plugin that
 * registered them, then id (ADR 0171 point 5).
 */
export function orderTickSystems(
	systems: readonly SystemDefinition[],
	bootIndex: (systemId: string) => number
): SystemDefinition[] {
	return systems
		.filter((s) => s.phase === 'world-tick')
		.sort(
			(a, b) =>
				(a.order ?? 0) - (b.order ?? 0) ||
				bootIndex(a.id) - bootIndex(b.id) ||
				(a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
		);
}

export function createTickState(input: {
	systems: readonly SystemDefinition[];
	info: WorldInfo;
	length: number;
	time: number;
	saved?: SaveWorldTick;
}): TickState {
	const { systems, info, length, time, saved } = input;
	const streams = new Map<string, Rng>();
	for (const s of systems) {
		const state = saved?.streams[s.id];
		streams.set(s.id, createRng(state ?? streamSeed(info.seed, s.id)));
	}
	return { lastDay: saved?.lastDay ?? dayAt(info, length, time), systems, streams };
}

export const saveTickState = (ticks: TickState): SaveWorldTick => ({
	lastDay: ticks.lastDay,
	streams: Object.fromEntries([...ticks.streams].map(([id, rng]) => [id, rng.state()]))
});

/** Sim time of the next tick. */
export const nextTickTime = (core: SimCore): number =>
	dayStart(core.info, dayLength(core), core.ticks.lastDay + 1);

/** Tolerance for "at the boundary": a few ulps of the time, never below a nanosecond. */
export const atBoundary = (t: number, boundary: number): boolean =>
	t >= boundary - Math.max(1e-9, Math.abs(boundary) * 4 * Number.EPSILON);

/**
 * Runs every tick whose boundary is at or before `core.t`, in order. Each runs background
 * operations, then the systems, then emits `world:tick` with the exact boundary time.
 */
export function runDueTicks(core: SimCore, base: Omit<SystemContext, 'tick'>): void {
	const length = dayLength(core);
	for (;;) {
		const day = core.ticks.lastDay + 1;
		const time = dayStart(core.info, length, day);
		if (!atBoundary(core.t, time)) return;
		core.ticks.lastDay = day;
		runAllBackground(core);
		for (const s of core.ticks.systems) {
			s.update(core.world, length, {
				...base,
				tick: { day, time, rng: core.ticks.streams.get(s.id)! }
			});
		}
		economyTick(core, day); // charges and reputation decay (plan 095, ADR 0113)
		core.events.emit('world:tick', { day, time });
	}
}

/**
 * Brings the `background` closed forms of a vessel on rails up to `core.t` (ADR 0171 point 7). A
 * vessel without `backgroundAt` starts counting now.
 */
export function runBackground(core: SimCore, vesselId: EntityId): void {
	const vessel = vesselOf(core, vesselId);
	if (vessel.mode !== 'on-rails' || !hasBackground(core, vesselId)) return;
	const dt = core.t - (vessel.backgroundAt ?? core.t);
	vessel.backgroundAt = core.t;
	if (!(dt > 0)) return;
	for (const partId of vessel.parts.slice()) {
		for (const m of partOf(core, partId).modules) {
			const hook = moduleDefOf(core, m.id).background;
			if (hook) hook(makeContext(core, partId, m.id), dt);
		}
	}
}

/** Whether any module of the vessel declares `background`; only such vessels carry `backgroundAt`. */
export function hasBackground(core: SimCore, vesselId: EntityId): boolean {
	return vesselOf(core, vesselId).parts.some((partId) =>
		partOf(core, partId).modules.some((m) => moduleDefOf(core, m.id).background !== undefined)
	);
}

export function runAllBackground(core: SimCore): void {
	for (const id of vesselIds(core)) runBackground(core, id);
}
