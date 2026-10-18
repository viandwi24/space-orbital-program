/**
 * The world tick (plan 082, ADRs 0096 and 0171): once per game day at the day boundary the sim
 * brings background operations of vessels on rails up to date, runs the `world-tick` systems with
 * their own PRNG streams, and emits `world:tick`.
 */
import {
	calendarOf,
	createRng,
	SECONDS_PER_DAY,
	type BodyDefinition,
	streamSeed,
	type EntityId,
	type Rng,
	type SaveWorldTick,
	type SystemContext,
	type SystemDefinition,
	type WorldInfo
} from '@orbital/core';
import { moduleDefOf, partOf, vesselIds, vesselOf, type SimCore } from './core.ts';
import { notePower } from './power.ts';
import { makeContext } from './hooks.ts';
import { economyTick } from './economy.ts';
import { agenciesTick } from './agencies.ts';
import { contractsTick } from './contracts.ts';
import { discoveryTick } from './discovery.ts';
import { crewTick } from './crew.ts';
import { buildingsTick } from './buildings.ts';
import { marketDay } from './market.ts';
import { membersTick } from './bases.ts';
import { resetStations } from './comms.ts';

export interface TickState {
	/** The day last entered; the next tick is for `lastDay + 1`. */
	lastDay: number;
	/** `world-tick` systems in run order. */
	readonly systems: readonly SystemDefinition[];
	/** Stream per system id. */
	readonly streams: ReadonlyMap<string, Rng>;
	/** Length of a tick day, s (ADR 0114): the calendar's day. */
	readonly length: number;
}

/**
 * Length of a tick day, s (ADR 0114, amending ADR 0171 point 1): the calendar's day,
 * `calendarOf(bodies)`: a fictional calendar's solar day of the home body, 86 400 s for
 * `gregorian-utc`. For stock this is still the home body's 21 600 s rotation.
 */
export function tickDayLength(bodies: readonly BodyDefinition[]): number {
	const calendar = calendarOf(bodies);
	return calendar.kind === 'fictional' ? calendar.dayLength : SECONDS_PER_DAY;
}

export const dayLength = (core: Pick<SimCore, 'ticks'>): number => core.ticks.length;

/** Seconds from J2000.0 to `t = 0`: the epoch is in SI days (ADR 0141 point 2, ADR 0114). */
const epochSeconds = (info: WorldInfo): number =>
	(info.epoch.day + info.epoch.fraction) * SECONDS_PER_DAY;

/** The day `t` falls in, counted in tick days since J2000.0 (ADR 0114). */
export function dayAt(info: WorldInfo, length: number, t: number): number {
	return Math.floor((epochSeconds(info) + t) / length);
}

/** Sim time at which `day` begins; computed from the day number, never accumulated. */
export function dayStart(info: WorldInfo, length: number, day: number): number {
	return day * length - epochSeconds(info);
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
	return { lastDay: saved?.lastDay ?? dayAt(info, length, time), systems, streams, length };
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
		// construction done and upkeep (plan 096, ADR 0123); comms stations follow the sites
		if (buildingsTick(core, day)) resetStations(core);
		economyTick(core, day); // charges and reputation decay (plan 095, ADR 0113)
		agenciesTick(core, day); // rival agencies (plan 126, ADR 0190)
		contractsTick(core, day); // expiry and at most one new offer (plan 099, ADR 0186)
		discoveryTick(core, time); // lab work and peer review (plan 129, ADR 0192)
		crewTick(core); // returns and salaries (plan 106, ADR 0176)
		membersTick(core); // outposts that drove off leave their site (plan 128, ADR 0125 point 4)
		marketDay(core, day); // production, then the markets, after the day's charges (plan 097, ADR 0124)
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
	notePower(core, vesselId);
}

/** Whether any module of the vessel declares `background`; only such vessels carry `backgroundAt`. */
export function hasBackground(core: SimCore, vesselId: EntityId): boolean {
	return vesselOf(core, vesselId).parts.some((partId) =>
		partOf(core, partId).modules.some((m) => moduleDefOf(core, m.id).background !== undefined)
	);
}

/**
 * Seconds after which a rails vessel's `background` forms run again between ticks (plan 208,
 * ADR 0214): sim seconds at 1x, scaled by the warp, so about every 5 s of wall time. Charge on
 * rails then shows within seconds instead of at the next day, and a long warp stays cheap.
 */
export const BACKGROUND_REFRESH = 5;

/** Runs the background of every rails vessel whose last evaluation is a refresh interval old. */
export function runStaleBackground(core: SimCore): void {
	const interval = BACKGROUND_REFRESH * Math.max(1, core.warp);
	for (const id of vesselIds(core)) {
		const vessel = vesselOf(core, id);
		if (vessel.mode !== 'on-rails' || vessel.backgroundAt === undefined) continue;
		if (core.t - vessel.backgroundAt >= interval) runBackground(core, id);
	}
}

export function runAllBackground(core: SimCore): void {
	for (const id of vesselIds(core)) runBackground(core, id);
}
