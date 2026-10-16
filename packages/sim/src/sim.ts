/**
 * `createSim`: boots plugins, owns the world and the physics frames, and runs the fixed-timestep
 * loop (simulation.md). No clock, no I/O: time is an input to `step`.
 */
import {
	createRng,
	createWorld,
	GRAVITATIONAL_CONSTANT,
	loadPlugins,
	type Command,
	type CommandResult,
	type EventBus,
	type EventMap,
	type LoadReport,
	type PhysicsBackend,
	type Plugin,
	type ReadonlyRegistries,
	type Rng,
	type Snapshot,
	type SystemDefinition,
	type World
} from '@orbital/core';
import { dispatch } from './commands.ts';
import { DEFAULT_MAX_FLIGHT_FRAMES, RAILS_MAX_STEP, SIM_DT } from './constants.ts';
import { hasFlightVessels, vesselIds, vesselOf, type SimCore } from './core.ts';
import { advanceFrame, createFrame, prepareFrame } from './frames.ts';
import { runUpdateHooks } from './hooks.ts';
import { autoRails } from './modes.ts';
import { rebaseRails } from './orbit.ts';
import { takeSnapshot } from './snapshot.ts';
import { destroyVessel, processPending } from './vessel.ts';

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
}

export interface Sim {
	/** Advance by `wallDelta` seconds of host time (scaled by the warp factor). */
	step(wallDelta: number): void;
	/**
	 * Validate and apply a command. Typed for in-process callers; the second overload is for data
	 * that came over the wire (`postMessage`) and is validated at runtime either way. Bad input is
	 * a refusal in the result, never an exception.
	 */
	dispatch(command: Command): CommandResult;
	dispatch(command: unknown): CommandResult;
	/** Plain-data view of the current state. */
	snapshot(): Snapshot;
	readonly world: World;
	readonly events: EventBus<EventMap>;
	readonly registries: ReadonlyRegistries;
	readonly report: LoadReport;
	readonly rng: Rng;
	/** Simulation time, s. */
	readonly time: number;
	readonly warp: number;
	/** Release the physics backends. */
	dispose(): void;
}

export async function createSim(options: SimOptions): Promise<Sim> {
	const dt = options.dt ?? SIM_DT;
	if (!(dt > 0)) throw new RangeError(`createSim: dt must be positive, got ${dt}`);
	const maxSteps = options.maxStepsPerCall ?? 5000;
	const { registries, events, report } = loadPlugins(options.plugins);

	const bodies = registries.bodies.list();
	const bodyDef = options.body
		? registries.bodies.get(options.body)
		: bodies.find((b) => b.parent === undefined);
	if (!bodyDef) {
		throw new Error(
			options.body
				? `createSim: body "${options.body}" is not registered`
				: 'createSim: no root body registered (a body without `parent`); load a plugin that defines one'
		);
	}

	const frames = [];
	const frameCount = options.maxFlightFrames ?? DEFAULT_MAX_FLIGHT_FRAMES;
	for (let i = 0; i < frameCount; i++) frames.push(createFrame(i, await options.backendFactory()));

	const systems: SystemDefinition[] = registries.systems.list();
	const core: SimCore = {
		world: createWorld({ events }),
		events,
		registries,
		dt,
		rng: createRng(options.seed ?? 0),
		frames,
		body: {
			def: bodyDef,
			mu: GRAVITATIONAL_CONSTANT * bodyDef.mass,
			omega: (2 * Math.PI) / bodyDef.rotationPeriod
		},
		pre: systems.filter((s) => s.phase === 'pre-physics'),
		post: systems.filter((s) => s.phase === 'post-physics'),
		pending: [],
		active: new Set(),
		forces: new Map(),
		t: 0,
		warp: 1,
		accumulator: 0
	};

	const runSystems = (list: SystemDefinition[], step: number): void => {
		for (const s of list) s.update(core.world, step, { registries, events });
	};

	/** Rails vessels: module `updateOnRails` hooks and a conditioning rebase of their elements. */
	const stepRailsVessels = (step: number): void => {
		for (const id of vesselIds(core)) {
			if (vesselOf(core, id).mode !== 'on-rails') continue;
			runUpdateHooks(core, id, step);
		}
		processPending(core);
	};
	const rebaseAll = (): void => {
		for (const id of vesselIds(core)) rebaseRails(core, vesselOf(core, id), core.t);
	};

	/** One fixed flight step for every flight frame (and the rails vessels alongside). */
	function flightStep(): void {
		runSystems(core.pre, dt);
		for (const frame of core.frames) if (frame.inUse) prepareFrame(core, frame, dt);
		processPending(core);
		for (const frame of core.frames) {
			if (!frame.inUse) continue;
			for (const crashed of advanceFrame(core, frame, dt)) {
				destroyVessel(core, crashed, 'crashed into the ground');
			}
			for (const id of frame.vessels) {
				const vessel = vesselOf(core, id);
				vessel.idle = core.active.has(id) ? 0 : vessel.idle + dt;
			}
		}
		stepRailsVessels(dt);
		core.t += dt;
		rebaseAll();
		runSystems(core.post, dt);
		autoRails(core);
	}

	/** One analytic chunk when nothing is in flight. */
	function railsStep(h: number): void {
		runSystems(core.pre, h);
		stepRailsVessels(h);
		core.t += h;
		rebaseAll();
		runSystems(core.post, h);
	}

	return {
		step(wallDelta) {
			if (!Number.isFinite(wallDelta) || wallDelta < 0) {
				throw new RangeError(`Sim.step: wallDelta must be a finite number >= 0, got ${wallDelta}`);
			}
			core.accumulator += wallDelta * core.warp;
			let flightSteps = 0;
			while (core.accumulator >= dt) {
				if (hasFlightVessels(core)) {
					if (flightSteps++ >= maxSteps) return;
					flightStep();
					core.accumulator -= dt;
				} else {
					const h = Math.min(core.accumulator, RAILS_MAX_STEP);
					railsStep(h);
					core.accumulator -= h;
				}
			}
		},
		dispatch: (command) => dispatch(core, command),
		snapshot: () => takeSnapshot(core),
		world: core.world,
		events,
		registries,
		report,
		rng: core.rng,
		get time() {
			return core.t;
		},
		get warp() {
			return core.warp;
		},
		dispose() {
			for (const f of core.frames) f.backend.dispose();
		}
	};
}
