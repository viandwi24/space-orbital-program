/**
 * `createSim`: boots plugins, owns the world and the physics frames, and runs the fixed-timestep
 * loop (simulation.md). No clock, no I/O: time is an input to `step`.
 */
import {
	createRng,
	createWorld,
	GRAVITATIONAL_CONSTANT,
	loadPlugins,
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
	type World
} from '@orbital/core';
import { dispatch } from './commands.ts';
import { DEFAULT_MAX_FLIGHT_FRAMES, RAILS_MAX_STEP, SIM_DT } from './constants.ts';
import { hasFlightVessels, vesselIds, vesselOf, type SimCore } from './core.ts';
import { advanceFrame, createFrame, prepareFrame } from './frames.ts';
import { runUpdateHooks } from './hooks.ts';
import { autoRails, reapDebris, trackRest } from './modes.ts';
import { rebaseRails } from './orbit.ts';
import { stepSasOnRails } from './sas.ts';
import { restoreFrames, restoreWorld, writeSave } from './save.ts';
import { takeSnapshot } from './snapshot.ts';
import { stepThermal, type HeatInput, type Overheat } from './thermal.ts';
import { burnPart, damagePart, processPending } from './vessel.ts';

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
	 * the root body so the field can take its radius from the registered data. Absent: the ground
	 * is the flat reference sphere, as before plan 031.
	 */
	terrain?: TerrainField | ((body: BodyDefinition) => TerrainField);
	/**
	 * Continue a run from `Sim.save()` output (plan 043, ADR 0050): the world, the clock, the PRNG
	 * and every flight body come from the save, so the run goes on exactly as the saved one would
	 * have. Read from the outside, so it is validated like a file (`SaveError` with a readable
	 * message); the plugins must be the ones that wrote it, `seed`, `dt` and `body` default to the
	 * save's. Mutable behaviour kept in a plugin's own closures, outside the world, is not saved.
	 */
	resume?: unknown;
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
	/** Simulation time, s. */
	readonly time: number;
	readonly warp: number;
	/** Release the physics backends. */
	dispose(): void;
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
	const { registries, events, report } = loadPlugins(options.plugins);

	if (resume) {
		const missing = resume.mods.filter((m) => !report.order.includes(m.id));
		if (missing.length > 0) {
			throw new SaveError(
				'missing-mod',
				`This save needs mods that are not loaded: ${missing.map((m) => `${m.id} ${m.version}`).join(', ')}.`
			);
		}
	}
	const seed = options.seed ?? resume?.seed ?? 0;
	const bodies = registries.bodies.list();
	const wantedBody = options.body ?? resume?.body;
	const bodyDef = wantedBody
		? registries.bodies.get(wantedBody)
		: bodies.find((b) => b.parent === undefined);
	if (!bodyDef) {
		throw new Error(
			wantedBody
				? `createSim: body "${wantedBody}" is not registered`
				: 'createSim: no root body registered (a body without `parent`); load a plugin that defines one'
		);
	}

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
		terrain: typeof options.terrain === 'function' ? options.terrain(bodyDef) : options.terrain,
		body: {
			def: bodyDef,
			mu: GRAVITATIONAL_CONSTANT * bodyDef.mass,
			omega: (2 * Math.PI) / bodyDef.rotationPeriod
		},
		pre: systems.filter((s) => s.phase === 'pre-physics'),
		post: systems.filter((s) => s.phase === 'post-physics'),
		pending: [],
		active: new Set(),
		t: resume?.time ?? 0,
		warp: resume?.warp ?? 1,
		accumulator: resume?.accumulator ?? 0
	};
	if (resume) {
		if (bodyDef.id !== resume.body) {
			throw new SaveError(
				'incompatible',
				`This save is in the sphere of "${resume.body}"; the sim was asked to simulate "${bodyDef.id}".`
			);
		}
		restoreFrames(core, resume);
	}
	/** Plugins that booted, in boot order, with the versions the save should record. */
	const mods = report.order.flatMap((id) => {
		const plugin = options.plugins.find((p) => p.meta.id === id);
		return plugin ? [{ id, version: plugin.meta.version }] : [];
	});

	const runSystems = (list: SystemDefinition[], step: number): void => {
		for (const s of list) s.update(core.world, step, { registries, events });
	};

	/** Rails vessels: module `updateOnRails` hooks and a conditioning rebase of their elements. */
	const stepRailsVessels = (step: number): void => {
		for (const id of vesselIds(core)) {
			if (vesselOf(core, id).mode !== 'on-rails') continue;
			runUpdateHooks(core, id, step);
			stepThermal(core, id, NO_HEAT, step); // radiation only: nothing hits a vessel on rails
		}
		processPending(core);
	};
	const rebaseAll = (): void => {
		for (const id of vesselIds(core)) {
			const vessel = vesselOf(core, id);
			rebaseRails(core, vessel, core.t);
			if (vessel.mode === 'on-rails') stepSasOnRails(core, vessel);
		}
	};

	/** One fixed flight step for every flight frame (and the rails vessels alongside). */
	function flightStep(): void {
		runSystems(core.pre, dt);
		const overheated: Overheat[] = [];
		for (const frame of core.frames) {
			if (frame.inUse) overheated.push(...prepareFrame(core, frame, dt));
		}
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
		stepRailsVessels(dt);
		core.t += dt;
		rebaseAll();
		reapDebris(core);
		runSystems(core.post, dt);
		autoRails(core);
	}

	/** One analytic chunk when nothing is in flight. */
	function railsStep(h: number): void {
		runSystems(core.pre, h);
		stepRailsVessels(h);
		core.t += h;
		rebaseAll();
		reapDebris(core);
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
		save: () => writeSave({ core, mods, seed }),
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
