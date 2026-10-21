/**
 * `createSim`: boots plugins, owns the world and the physics frames, and runs the fixed-timestep
 * loop (simulation.md). No clock, no I/O: time is an input to `step`.
 */
import { freshTech } from './tech.ts';
import { collectMilestones, freshMilestones, listenForMilestones } from './milestones.ts';
import { collectRange, freshRange } from './range.ts';
import { freshReliability } from './reliability.ts';
import {
	cloneData,
	createRng,
	createWorld,
	legacyWorldInfo,
	loadPlugins,
	PHYSICS_WARP_MAX,
	resolveRules,
	readSimSave,
	SaveError,
	type Command,
	type CommandResult,
	type BodyDefinition,
	type EntityId,
	type EventBus,
	type EventMap,
	type LoadReport,
	type PhysicsBackend,
	type Plugin,
	type ReadonlyRegistries,
	type Rng,
	type SimSave,
	type Snapshot,
	type SystemDefinition,
	type TerrainField,
	type World,
	type RuleReader,
	type WorldInfo,
	sitesOf,
	worldInfoSchema
} from '@orbital/core';
import { buildBodies, type TerrainFactory } from './bodies.ts';
import type { Ephemeris } from '@orbital/kepler';
import { NBODY_FRAME_EVALUATIONS, nBodyOn, takeEvaluations } from './nbody.ts';
import { dispatch } from './commands.ts';
import { freshAgencies } from './agencies.ts';
import { drainQueue, type CommandSource } from './delay.ts';
import { savedScripts, stepOverrides } from './programs.ts';
import {
	DEFAULT_MAX_FLIGHT_FRAMES,
	FLIGHT_FRAME_PART_STEPS,
	RAILS_MAX_STEP,
	SIM_DT
} from './constants.ts';
import { hasFlightVessels, vesselIds, vesselOf, type SimCore } from './core.ts';
import { advanceFrame, createFrame, prepareFrame } from './frames.ts';
import { runUpdateHooks } from './hooks.ts';
import { evaluateObjectivesDue, freshObjectives, listenForObjectives } from './objectives.ts';
import { freshContracts } from './contracts.ts';
import { freshStrategies } from './strategies.ts';
import { freshDiscovery } from './discovery.ts';
import { collectCrewPlaces, freshCrew } from './crew.ts';
import { freshScience } from './science.ts';
import { freshComms, listenForComms, updateNetwork } from './comms.ts';
import { freshLife, updateCrewLife } from './life.ts';
import { createTrajectoryProvider } from '@orbital/kepler';
import {
	atBoundary,
	createTickState,
	nextTickTime,
	orderTickSystems,
	runDueTicks,
	runStaleBackground,
	tickDayLength
} from './tick.ts';
import { patchedBodiesOf, completeNodes, refreshPatchedBodies } from './maneuver.ts';
import { pruneTargets } from './target.ts';
import { runAutopilots } from './autopilot.ts';
import { autoRails, reapDebris, trackRest } from './modes.ts';
import { rebaseRails } from './orbit.ts';
import { stepSasOnRails, wakeTurningVessels } from './sas.ts';
import { applySoiTransitions } from './soi.ts';
import { restoreFrames, restoreWorld, writeSave } from './save.ts';
import { rulesView, takeSnapshot } from './snapshot.ts';
import { freshEconomy } from './economy.ts';
import { stepThermal, type HeatInput, type Overheat } from './thermal.ts';
import { burnPart, damagePart, processPending } from './vessel.ts';
import { holdWarpLimit, thawFrozen } from './warp.ts';
import { fireAlarms, followAlarms, freshAlarms, nextAlarm } from './alarms.ts';
import { designRecord, type DesignRecord } from './vessel-design.ts';
import { capturePorts, pullPorts, wakePortNeighbours } from './docking.ts';
import { stepJoints } from './robotics.ts';
import { runTransfers, updateRates } from './transfer.ts';
import { spawnQueuedDebris } from './debris.ts';

/** A warp-to runs at most `remaining / this` times real time, so it eases into real time over the last seconds (ADR 0056). */
const WARP_TO_TAPER = 1;

/** Simulated seconds this `step` call adds: the warp, tapered and capped while a warp-to is under way. */
function warpedDelta(core: SimCore, wallDelta: number): number {
	const stop = stopAt(core);
	if (stop === null) return wallDelta * core.warp;
	const remaining = stop - core.t - core.accumulator;
	if (remaining <= 0) return 0;
	const factor = Math.min(core.warp, Math.max(1, remaining / WARP_TO_TAPER));
	return Math.min(wallDelta * factor, remaining);
}

/** Where a warp must stop: the warp-to target, or an alarm before it (plan 224, ADR 0223). */
function stopAt(core: SimCore): number | null {
	const alarm = core.warp > 1 ? nextAlarm(core)?.time : undefined;
	if (alarm === undefined) return core.warpTarget;
	return core.warpTarget === null ? alarm : Math.min(alarm, core.warpTarget);
}

/** Lands the clock exactly on the target (the last piece is shorter than a step) and ends the warp. */
function arriveAtWarpTarget(core: SimCore, railsStep: (h: number) => void, stop: number): void {
	const left = stop - core.t;
	if (hasFlightVessels(core)) {
		// physics warp (plan 206): fixed steps cannot land exactly; it ends within one step
		if (left > core.dt) return;
	} else if (left > 1e-9 && left - core.accumulator > 1e-9) return;
	else if (left > 1e-9 && core.accumulator > 0) {
		const h = core.accumulator;
		core.accumulator = 0;
		railsStep(h);
	}
	const alarm = nextAlarm(core);
	if (alarm && alarm.time === stop && stop !== core.warpTarget) {
		// an alarm ends the warp (plan 224): on rails the clock is on it now; in physics within a step
		fireAlarms(core);
		if (core.warp > 1 || core.warpTarget !== null) {
			core.warp = 1;
			core.warpTarget = null;
			core.events.emit('warp:stopped', { reason: `alarm "${alarm.name}"` });
		}
		return;
	}
	core.warp = 1;
	core.warpTarget = null;
	core.events.emit('warp:stopped', { reason: 'the warp reached its time' });
}

const NO_HEAT: ReadonlyMap<EntityId, HeatInput> = new Map();

export interface SimOptions {
	/** Plugins to boot with `loadPlugins`; must register at least one root body. */
	plugins: readonly Plugin[];
	/** Creates one physics backend; called once per flight frame at start-up. */
	backendFactory: () => PhysicsBackend | Promise<PhysicsBackend>;
	/** Seed of the sim's PRNG (`Sim.rng`). Nothing in the sim itself draws from it yet. */
	seed?: number;
	/** Fixed flight step, s. Default 0.02. */
	dt?: number;
	/** Physics frames (backends) created up front. Default 2. */
	maxFlightFrames?: number;
	/** Fixed steps run per `step` call at most; the rest of the time stays in the accumulator. Default 5000. */
	maxStepsPerCall?: number;
	/** Id of the root body to simulate; default the first body without a parent. */
	body?: string;
	/**
	 * Heights of the ground above the reference sphere (ADR 0043), body-fixed unit direction in,
	 * metres out; the host passes the same field to the renderer. A function is called once with
	 * each body so the field can take its radius from the registered data, and may return nothing
	 * for a body that stays a smooth sphere (a plain field applies to the root body only). Absent:
	 * the ground is the flat reference sphere, as before plan 031.
	 */
	terrain?: TerrainField | TerrainFactory;
	/**
	 * Continue a run from `Sim.save()` output (plan 043, ADR 0050): the world, the clock, the PRNG
	 * and every flight body come from the save, so the run goes on exactly as the saved one would
	 * have. Read from the outside, so it is validated like a file (`SaveError` with a readable
	 * message); the plugins must be the ones that wrote it, `seed`, `dt` and `body` default to the
	 * save's. Mutable behaviour kept in a plugin's own closures, outside the world, is not saved.
	 */
	resume?: unknown;
	/**
	 * JPL's DE440 for the bodies that name a NAIF id (plan 125, ADR 0122 point 7): within its span
	 * they follow it instead of their own path model. Not saved: a host gives it again on resume.
	 */
	ephemeris?: Ephemeris;
	/**
	 * The world this run belongs to (plan 077, ADR 0110), validated like a save. Absent: the save's
	 * world on resume, else the Legacy world with this run's seed. On resume it must name the
	 * save's world.
	 */
	world?: WorldInfo;
}

/**
 * Who sent a command (plan 117, ADR 0188 point 6): `script` for the script runner's commands,
 * `autopilot` for an autopilot's (plan 320, ADR 0276 point 2).
 */
export interface DispatchOptions {
	source?: CommandSource;
}

export interface Sim {
	/** Advance by `wallDelta` seconds of host time (scaled by the warp factor). */
	step(wallDelta: number): void;
	/**
	 * Validate and apply a command. Typed for in-process callers; the second overload is for data
	 * that came over the wire (`postMessage`) and is validated at runtime either way. Bad input is
	 * a refusal in the result, never an exception.
	 */
	dispatch(command: Command, options?: DispatchOptions): CommandResult;
	dispatch(command: unknown, options?: DispatchOptions): CommandResult;
	/**
	 * The scripts saved on vessels, with source and memory (plan 320, ADR 0276 point 6): what the
	 * host restarts when a world opens.
	 */
	scripts(): Array<{ vessel: EntityId; name: string; source: string; memory: Record<string, unknown> }>;
	/** Plain-data view of the current state. */
	snapshot(): Snapshot;
	/**
	 * The whole simulation as plain JSON-compatible data, for `createSim({ resume })`. Call between
	 * `step`s. Never mutates the sim.
	 */
	save(): SimSave;
	readonly world: World;
	readonly events: EventBus<EventMap>;
	readonly registries: ReadonlyRegistries;
	readonly report: LoadReport;
	readonly rng: Rng;
	/** The world this run belongs to (a frozen copy, new after each `set-rule`; ADR 0110, 0111). */
	readonly worldInfo: Readonly<WorldInfo>;
	/** Rule ids in the world that no loaded mod registers: kept in the save (ADR 0111 point 3). */
	readonly unknownRules: readonly string[];
	/** The home body the sim runs on (ADR 0119 point 1): not the tree's root once a Sun sits there. */
	readonly home: string;
	/** Simulation time, s. */
	readonly time: number;
	readonly warp: number;
	/** The clock is paused by a `pause` command (plan 205). */
	readonly paused: boolean;
	/** The vessel's design record (plan 221, ADR 0208 point 1): its design and the indices it kept. */
	designOf(vessel: EntityId): DesignRecord | undefined;
	/** Release the physics backends. */
	dispose(): void;
}

/** The run's world: the option (checked), the save's, or the Legacy world. */
function worldOf(options: SimOptions, resume: SimSave | undefined, seed: number): WorldInfo {
	if (options.world === undefined) {
		if (resume) return cloneData(resume.worldInfo);
		const stock = options.plugins.find((p) => p.meta.id === 'stock');
		return legacyWorldInfo(seed, stock?.meta.version);
	}
	const parsed = worldInfoSchema.safeParse(options.world);
	if (!parsed.success) {
		const why = parsed.error.issues[0]?.message ?? 'invalid';
		throw new RangeError(`createSim: world is invalid: ${why}`);
	}
	if (resume && parsed.data.id !== resume.worldInfo.id) {
		throw new SaveError(
			'incompatible',
			`This save belongs to world "${resume.worldInfo.id}", not "${parsed.data.id}".`
		);
	}
	return cloneData(parsed.data as WorldInfo);
}

function deepFreeze<T>(value: T): T {
	if (value !== null && typeof value === 'object') {
		for (const v of Object.values(value)) deepFreeze(v);
		Object.freeze(value);
	}
	return value;
}

export async function createSim(options: SimOptions): Promise<Sim> {
	const resume = options.resume === undefined ? undefined : readSimSave(options.resume);
	const dt = options.dt ?? resume?.dt ?? SIM_DT;
	if (resume && dt !== resume.dt) {
		throw new SaveError(
			'incompatible',
			`This save was made with a ${resume.dt} s step; the sim was asked for ${dt} s. A different step would not continue the same run.`
		);
	}
	if (!(dt > 0)) throw new RangeError(`createSim: dt must be positive, got ${dt}`);
	const maxSteps = options.maxStepsPerCall ?? 5000;
	const seed = options.seed ?? resume?.seed ?? 0;
	const info = worldOf(options, resume, seed);
	// The world's system: other systems' bodies go, its variant's patches apply (ADR 0184 point 2).
	const { registries, events, report } = loadPlugins(options.plugins, {
		system: { id: info.systemId, variant: info.variant }
	});

	if (resume) {
		const missing = resume.mods.filter((m) => !report.order.includes(m.id));
		if (missing.length > 0) {
			throw new SaveError(
				'missing-mod',
				`This save needs mods that are not loaded: ${missing.map((m) => `${m.id} ${m.version}`).join(', ')}.`
			);
		}
	}
	const defs = registries.bodies.list();
	// The home body (ADR 0119 point 1): asked for, the save's, the primary site's, else the root.
	const siteBody = sitesOf(info)[0]?.body;
	const variantHome = registries.systemVariants
		.list()
		.find((v) => v.system === info.systemId && v.variant === info.variant)?.home;
	const wantedBody =
		options.body ??
		resume?.home ??
		(siteBody !== undefined && registries.bodies.has(siteBody) ? siteBody : undefined) ??
		(variantHome !== undefined && registries.bodies.has(variantHome) ? variantHome : undefined);
	const bodyDef = wantedBody
		? registries.bodies.get(wantedBody)
		: defs.find((b) => b.parent === undefined);
	if (!bodyDef) {
		throw new Error(
			wantedBody
				? `createSim: body "${wantedBody}" is not registered`
				: 'createSim: no root body registered (a body without `parent`); load a plugin that defines one'
		);
	}
	if (resume) {
		const lost = resume.bodies.filter((id) => !registries.bodies.has(id));
		if (lost.length > 0) {
			throw new SaveError(
				'missing-mod',
				`This save needs bodies that are not loaded: ${lost.join(', ')}.`
			);
		}
	}
	const resolved = resolveRules(info.rules, info.preset, registries.rules, registries.presets);
	if (resolved.problems.length > 0) {
		const why = resolved.problems.join('; ');
		if (resume) throw new SaveError('damaged', `This save is damaged: rule values: ${why}.`);
		throw new RangeError(`createSim: world rules are invalid: ${why}`);
	}
	info.rules = resolved.values;
	const unknownRules = Object.freeze([...resolved.unknown]);
	const bodies = buildBodies(defs, bodyDef.id, options.terrain, info, options.ephemeris);
	const root = bodies.get(bodyDef.id);
	if (!root) throw new Error(`createSim: body "${bodyDef.id}" is not registered`);

	const frames = [];
	const frameCount = options.maxFlightFrames ?? DEFAULT_MAX_FLIGHT_FRAMES;
	for (let i = 0; i < frameCount; i++) frames.push(createFrame(i, await options.backendFactory()));

	const systems: SystemDefinition[] = registries.systems.list();
	const core: SimCore = {
		world: resume
			? restoreWorld(
					resume,
					events,
					(id) => registries.parts.has(id),
					(id) => registries.modules.has(id),
					(id) => registries.bodies.has(id)
				)
			: createWorld({ events }),
		events,
		registries,
		dt,
		rng: createRng(resume ? resume.rng : seed),
		frames,
		bodies,
		root,
		pre: systems.filter((s) => s.phase === 'pre-physics'),
		post: systems.filter((s) => s.phase === 'post-physics'),
		pending: [],
		active: new Set(),
		t: resume?.time ?? 0,
		warp: resume?.warp ?? 1,
		warpTarget: resume?.warpTarget ?? null,
		accumulator: resume?.accumulator ?? 0,
		warpStopped: false,
		paused: false,
		warpFocus: null,
		alarms: freshAlarms(resume?.alarms),
		info,
		rulesView: null,
		trajectory: createTrajectoryProvider(info.gravityModel, patchedBodiesOf(bodies)),
		ticks: createTickState({
			systems: orderTickSystems(systems, (id) => {
				const index = report.order.indexOf(registries.systems.owner(id) ?? '');
				return index < 0 ? Number.MAX_SAFE_INTEGER : index;
			}),
			info,
			// the calendar of the system this sim runs: its root first (ADR 0114)
			length: tickDayLength([bodyDef, ...defs.filter((b) => b !== bodyDef)]),
			time: resume?.time ?? 0,
			...(resume?.worldTick ? { saved: resume.worldTick } : {})
		}),
		economy: resume?.economy ? cloneData(resume.economy) : freshEconomy({ registries, info }),
		objectives: {
			state: resume?.objectives ? cloneData(resume.objectives) : freshObjectives(),
			dirty: new Set()
		},
		contracts: resume?.contracts ? cloneData(resume.contracts) : freshContracts({ info }),
		strategies: resume?.strategies ? cloneData(resume.strategies) : freshStrategies(),
		discovery: resume?.discovery ? cloneData(resume.discovery) : freshDiscovery({ info }),
		crew: resume?.crew ? cloneData(resume.crew) : freshCrew({ info }),
		science: freshScience(resume?.science),
		comms: freshComms(),
		agencies: resume?.agencies ? cloneData(resume.agencies) : freshAgencies(),
		commsState: resume
			? cloneData(resume.comms)
			: { seq: 0, routes: [], queue: [], transmissions: [] },
		life: freshLife(),
		milestones: freshMilestones(resume?.milestones),
		tech: freshTech(resume?.tech),
		range: freshRange(resume?.range),
		reliability: freshReliability({ info }, resume?.reliability)
	};
	listenForObjectives(core);
	listenForComms(core);
	listenForMilestones(core);
	if (resume) {
		if (bodyDef.id !== resume.home) {
			throw new SaveError(
				'incompatible',
				`This save's home is "${resume.home}"; the sim was asked to simulate "${bodyDef.id}".`
			);
		}
		restoreFrames(core, resume);
	}
	/** Plugins that booted, in boot order, with the versions the save should record. */
	const mods = report.order.flatMap((id) => {
		const plugin = options.plugins.find((p) => p.meta.id === id);
		return plugin ? [{ id, version: plugin.meta.version }] : [];
	});

	/** Rules of registered ids only; a plain map read (ADR 0111 point 5). */
	const rules: RuleReader = {
		get: (id) => (registries.rules.has(id) ? core.info.rules[id] : undefined)
	};
	let frozenInfo: Readonly<WorldInfo> | null = null;
	let frozenFor: unknown = null;

	const runSystems = (list: SystemDefinition[], step: number): void => {
		for (const s of list) s.update(core.world, step, { registries, events, rules });
	};

	/** Rails vessels: module `updateOnRails` hooks and a conditioning rebase of their elements. */
	// An agency's object is passive (plan 126, ADR 0190 point 3): a fixed circular orbit read from
	// its rails when needed, so the per-chunk hooks, heat, rebasing and SOI checks skip it.
	const stepRailsVessels = (step: number): void => {
		for (const id of vesselIds(core)) {
			const v = vesselOf(core, id);
			if (v.mode !== 'on-rails' || v.owner !== undefined) continue;
			runUpdateHooks(core, id, step);
			stepThermal(core, id, NO_HEAT, step); // radiation only: nothing hits a vessel on rails
		}
		processPending(core);
	};
	const rebaseAll = (step: number): void => {
		for (const id of vesselIds(core)) {
			const vessel = vesselOf(core, id);
			if (vessel.owner !== undefined) continue;
			rebaseRails(core, vessel, core.t);
			if (vessel.mode === 'on-rails') stepSasOnRails(core, vessel, step);
		}
	};
	/**
	 * The n-body warp budget (ADR 0122 point 5), once per real frame: the integrator's evaluations,
	 * not the wall clock, so the warp a world reaches is the same on every machine.
	 */
	const holdWarp = (flightSteps: number): void => {
		const used = takeEvaluations();
		if (core.warp <= 1) return;
		const nbody = nBodyOn(core) && used > NBODY_FRAME_EVALUATIONS;
		// Physics warp in any world (plan 247): the work of one frame is the flight steps times the
		// parts in flight, a count rather than a clock, so a replay agrees on every machine.
		const physics =
			core.warp <= PHYSICS_WARP_MAX &&
			flightSteps > 1 &&
			flightSteps * flightParts() > FLIGHT_FRAME_PART_STEPS;
		if (!nbody && !physics) return;
		const factor = Math.max(1, Math.floor(core.warp / 2));
		core.warp = factor;
		core.events.emit('warp:limited', {
			factor,
			reason: nbody
				? `n-body integration limits warp to ${factor}x`
				: `the simulation cannot keep up: warp limited to ${factor}x`
		});
	};
	/** Parts of the vessels in flight: what one flight step costs. */
	const flightParts = (): number => {
		let n = 0;
		for (const id of vesselIds(core)) {
			const v = vesselOf(core, id);
			if (v.mode === 'flight') n += v.parts.length;
		}
		return n;
	};

	/** Commands whose light time has passed apply first (signal delay, plan 117, ADR 0188 point 6). */
	const drain = (): void => drainQueue(core, (c, from) => dispatch(core, c, 'queued', from));

	/** One fixed flight step for every flight frame (and the rails vessels alongside). */
	function flightStep(): void {
		drain();
		wakePortNeighbours(core); // an idle station on rails can be docked with (plan 222)
		const tStart = core.t;
		runSystems(core.pre, dt);
		const overheated: Overheat[] = [];
		for (const frame of core.frames) {
			if (frame.inUse) overheated.push(...prepareFrame(core, frame, dt));
		}
		// docking ports pull each other in (plan 222, ADR 0218)
		for (const frame of core.frames) if (frame.inUse) pullPorts(core, frame);
		for (const frame of core.frames) {
			if (!frame.inUse) continue;
			for (const hit of advanceFrame(core, frame, dt)) damagePart(core, hit);
			for (const id of frame.vessels) {
				const vessel = vesselOf(core, id);
				vessel.idle = core.active.has(id) ? 0 : vessel.idle + dt;
				trackRest(core, frame, id, dt);
			}
		}
		for (const hit of overheated) burnPart(core, hit);
		// Splits requested by `update` hooks are applied after the backend step: rebuilding bodies
		// earlier would drop the forces already queued for this step (ADR 0018).
		processPending(core);
		spawnQueuedDebris(core); // thrown-off pieces after the splits (plan 219)
		capturePorts(core);
		stepJoints(core); // robotic joints re-pose their parts (plan 306, ADR 0269)
		stepRailsVessels(dt);
		core.t += dt;
		rebaseAll(dt);
		applySoiTransitions(core, tStart);
		completeNodes(core);
		reapDebris(core);
		pruneTargets(core);
		runSystems(core.post, dt);
		autoRails(core);
		collectCrewPlaces(core);
		updateCrewLife(core, tStart, true);
		runTransfers(core, dt); // plan 213
		refreshPatchedBodies(core);
		updateNetwork(core);
		collectMilestones(core);
		collectRange(core);
		evaluateObjectivesDue(core, 'step');
		runStaleBackground(core); // rails vessels' charge between ticks (plan 208, ADR 0214)
		updateRates(core); // plan 213
		// The step is not split; a boundary it crossed ticks now, at the boundary's own time (ADR 0171 point 4).
		if (atBoundary(core.t, nextTickTime(core))) runDueTicks(core, { registries, events, rules });
	}

	/**
	 * Analytic chunks when nothing is in flight: `h` is cut at each day boundary, where the world
	 * ticks run (ADR 0171 point 3).
	 */
	function railsStep(h: number): void {
		let left = h;
		while (left > 0) {
			const boundary = nextTickTime(core);
			const toBoundary = boundary - core.t;
			if (toBoundary <= left) {
				if (toBoundary > 0) {
					railsChunk(toBoundary);
					core.t = boundary; // the boundary from its day number, not the sum of chunks
					left -= toBoundary;
				}
				runDueTicks(core, { registries, events, rules }); // also a tick that is already due
			} else {
				railsChunk(left);
				left = 0;
			}
		}
	}

	function railsChunk(h: number): void {
		if (h <= 0) return;
		drain();
		const tStart = core.t;
		runSystems(core.pre, h);
		stepRailsVessels(h);
		core.t += h;
		rebaseAll(h);
		applySoiTransitions(core, tStart);
		completeNodes(core);
		reapDebris(core);
		pruneTargets(core);
		runSystems(core.post, h);
		collectCrewPlaces(core);
		updateCrewLife(core, tStart, false);
		runTransfers(core, h); // transfers run on rails too, in the same step as life support (plan 213)
		refreshPatchedBodies(core);
		updateNetwork(core);
		collectMilestones(core);
		collectRange(core);
		evaluateObjectivesDue(core, 'step');
		runStaleBackground(core);
		updateRates(core);
	}

	return {
		step(wallDelta) {
			if (!Number.isFinite(wallDelta) || wallDelta < 0) {
				throw new RangeError(`Sim.step: wallDelta must be a finite number >= 0, got ${wallDelta}`);
			}
			// rails warp holds only while the watched vessels allow it; frozen ones come back below it
			holdWarpLimit(core);
			thawFrozen(core);
			if (core.paused) return; // the clock is paused (plan 205): nothing advances
			stepOverrides(core); // the player's let-go channels return to their programs (plan 320)
			takeEvaluations(); // this frame's budget counts from here (ADR 0122 point 5)
			core.accumulator += warpedDelta(core, wallDelta);
			let flightSteps = 0;
			// physics warp lands on an alarm or warp-to time within one step, not within one frame
			const flightStop = stopAt(core);
			while (core.accumulator >= dt) {
				// mod autopilots fly their vessels (plan 310, ADR 0271): before the choice of step, so a
				// vessel one wakes into flight takes this step in physics, not a rails chunk that leaves it behind
				runAutopilots(core);
				wakeTurningVessels(core); // a real SAS turn takes the vessel's own torque (plan 310)
				if (hasFlightVessels(core)) {
					if (flightSteps++ >= maxSteps) {
						holdWarp(flightSteps);
						return;
					}
					flightStep();
					core.accumulator -= dt;
					if (flightStop !== null && core.t + dt > flightStop) {
						core.accumulator = 0;
						break;
					}
				} else {
					const h = Math.min(core.accumulator, RAILS_MAX_STEP);
					railsStep(h);
					core.accumulator -= h;
				}
				if (core.warpStopped) {
					// An SOI change of a controlled vessel: the rest of the time scaled by the old warp is dropped.
					core.warpStopped = false;
					core.accumulator = 0;
					return;
				}
			}
			const stop = stopAt(core);
			if (stop !== null) arriveAtWarpTarget(core, railsStep, stop);
			fireAlarms(core);
			followAlarms(core);
			holdWarp(flightSteps);
		},
		dispatch: (command, options) => dispatch(core, command, options?.source ?? 'player'),
		scripts: () => savedScripts(core),
		snapshot: () => takeSnapshot(core),
		save: () => writeSave({ core, mods, seed }),
		world: core.world,
		events,
		registries,
		report,
		rng: core.rng,
		home: core.root.def.id,
		get worldInfo() {
			if (frozenInfo === null || frozenFor !== core.rulesView) {
				frozenInfo = deepFreeze(cloneData(core.info));
				frozenFor = rulesView(core);
			}
			return frozenInfo;
		},
		unknownRules,
		get time() {
			return core.t;
		},
		get paused() {
			return core.paused;
		},
		designOf: (vessel) => designRecord(core, vessel),
		get warp() {
			return core.warp;
		},
		dispose() {
			for (const f of core.frames) f.backend.dispose();
		}
	};
}
