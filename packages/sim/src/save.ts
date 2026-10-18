/**
 * Save and resume (plan 043, ADR 0050). `writeSave` turns the live sim into plain data;
 * `restore` puts it back into a freshly built `SimCore`. The world already holds every module's
 * state, vessel and part components (ADR 0010), so what is added here is what lives outside it: the
 * clock, the PRNG, and the rigid bodies of the flight frames. A body is not snapshotted from the
 * physics engine; its pose and velocity (float32-exact when read back) are written and the body
 * is created again, so the saved data is independent of the backend.
 */
import { saveTech } from './tech.ts';
import { saveMilestones } from './milestones.ts';
import { saveRange } from './range.ts';
import {
	cloneData,
	SIM_SAVE_FORMAT,
	SIM_SAVE_VERSION,
	API_VERSION,
	SAS_MODES,
	deserializeWorld,
	SaveError,
	simSaveChecksum,
	type EntityId,
	type EventBus,
	type EventMap,
	type SimSave,
	type SaveFrame,
	type World
} from '@orbital/core';
import { createVesselBody } from './frames.ts';
import { partOf, vesselIds, vesselOf, type SimCore } from './core.ts';
import { saveScience } from './science.ts';
import { runAllBackground, saveTickState } from './tick.ts';
import { PART, VESSEL } from './state.ts';

type Check = (value: unknown) => string | undefined;

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
const num: Check = (v) =>
	typeof v === 'number' && Number.isFinite(v) ? undefined : 'not a finite number';
const bool: Check = (v) => (typeof v === 'boolean' ? undefined : 'not a boolean');
const str: Check = (v) => (typeof v === 'string' ? undefined : 'not a string');
const entity: Check = (v) =>
	typeof v === 'number' && Number.isInteger(v) && v >= 0 ? undefined : 'not an entity id';
const oneOf =
	(...values: string[]): Check =>
	(v) =>
		typeof v === 'string' && values.includes(v) ? undefined : `not one of ${values.join(', ')}`;
const arrayOf =
	(item: Check): Check =>
	(v) => {
		if (!Array.isArray(v)) return 'not a list';
		for (let i = 0; i < v.length; i++) {
			const why = item(v[i]);
			if (why) return `[${i}] ${why}`;
		}
		return undefined;
	};
const shape =
	(fields: Record<string, Check>): Check =>
	(v) => {
		if (!isRecord(v)) return 'not an object';
		for (const [key, check] of Object.entries(fields)) {
			const why = check(v[key]);
			if (why) return `${key}: ${why}`;
		}
		return undefined;
	};
const vec3 = shape({ x: num, y: num, z: num });
const quat = shape({ x: num, y: num, z: num, w: num });
const optional =
	(check: Check): Check =>
	(v) =>
		v === undefined ? undefined : check(v);
const orNull =
	(check: Check): Check =>
	(v) =>
		v === null ? undefined : check(v);
const either =
	(kind: string, variants: Record<string, Check>): Check =>
	(v) => {
		if (!isRecord(v)) return 'not an object';
		const check = variants[String(v[kind])];
		return check ? check(v) : `${kind} is not one of ${Object.keys(variants).join(', ')}`;
	};

const railsCheck = orNull(
	either('kind', {
		elements: shape({
			elements: shape({ a: num, e: num, i: num, raan: num, argp: num, m0: num, epoch: num })
		}),
		state: shape({ r: vec3, v: vec3, t0: num }),
		surface: shape({ r: vec3, q: quat })
	})
);

/** Shape of the `sim.vessel` component (state.ts `VesselState`): what the sim reads unchecked. */
export const checkVesselState: Check = shape({
	name: str,
	mode: oneOf('flight', 'on-rails'),
	soi: str,
	root: entity,
	parts: arrayOf(entity),
	control: shape({ throttle: num, pitch: num, roll: num, yaw: num }),
	sas: shape({
		mode: oneOf(...SAS_MODES),
		reference: oneOf('surface', 'orbit'),
		hold: quat,
		settling: bool,
		integral: vec3,
		error: num,
		quiet: bool,
		active: bool,
		demand: vec3
	}),
	nodes: arrayOf(
		shape({
			id: entity,
			time: num,
			prograde: num,
			normal: num,
			radial: num,
			target: orNull(shape({ body: str, v: vec3 }))
		})
	),
	target: orNull(either('kind', { body: shape({ id: str }), vessel: shape({ id: entity }) })),
	stages: arrayOf(arrayOf(entity)),
	nextStage: entity,
	com: vec3,
	velocity: vec3,
	orientation: quat,
	rails: railsCheck,
	idle: num,
	landed: bool,
	rest: num
});

/** Shape of the `sim.part` component (state.ts `PartState`). */
export const checkPartState: Check = shape({
	vessel: entity,
	index: entity,
	definition: str,
	designPos: vec3,
	yaw: num,
	rotation: optional(quat),
	link: optional(shape({ peer: entity, point: vec3 })),
	attachments: arrayOf(shape({ node: str, peer: entity, peerNode: str })),
	temperature: num,
	modules: arrayOf(shape({ id: str }))
});

export interface WriteSaveInput {
	core: SimCore;
	mods: ReadonlyArray<{ id: string; version: string }>;
	seed: number;
}

/** Plain-data copy of the whole simulation, taken between steps. */
export function writeSave({ core, mods, seed }: WriteSaveInput): SimSave {
	runAllBackground(core); // background closed forms are saved up to date (ADR 0171 point 7)
	const frames: SaveFrame[] = core.frames.map((frame) => ({
		id: frame.id,
		inUse: frame.inUse,
		origin: { ...frame.origin },
		velocity: { ...frame.velocity },
		soi: frame.inUse ? frame.soi : core.root.def.id,
		vessels: [...frame.vessels],
		bodies: [...frame.bodies].map(([vessel, body]) => {
			const t = frame.backend.getTransform(body.handle);
			const v = frame.backend.getVelocity(body.handle);
			return {
				vessel,
				origin: t.position,
				rotation: t.rotation,
				linear: v.linear,
				angular: v.angular,
				mass: body.mass,
				com: { ...body.com },
				inertia: { ...body.inertia },
				inertiaFrame: { ...body.inertiaFrame },
				masses: [...body.masses]
			};
		})
	}));
	const science = saveScience(core);
	const milestones = saveMilestones(core);
	const tech = saveTech(core);
	const range = saveRange(core);
	const unsigned: Omit<SimSave, 'checksum'> = {
		format: SIM_SAVE_FORMAT,
		formatVersion: SIM_SAVE_VERSION,
		apiVersion: API_VERSION,
		mods: mods.map((m) => ({ id: m.id, version: m.version })),
		bodies: [...core.bodies.keys()],
		home: core.root.def.id,
		dt: core.dt,
		seed,
		time: core.t,
		warp: core.warp,
		warpTarget: core.warpTarget,
		accumulator: core.accumulator,
		rng: core.rng.state(),
		worldInfo: cloneData(core.info),
		worldTick: saveTickState(core.ticks),
		economy: cloneData(core.economy),
		...(core.objectives.state.next > 1 ? { objectives: cloneData(core.objectives.state) } : {}),
		...(core.crew.next > 1 ? { crew: cloneData(core.crew) } : {}),
		...(science ? { science } : {}),
		...(milestones ? { milestones } : {}),
		...(tech ? { tech } : {}),
		...(range ? { range } : {}),
		world: core.world.serialize(),
		frames
	};
	return { ...unsigned, checksum: simSaveChecksum(unsigned) };
}

const damaged = (what: string): SaveError =>
	new SaveError('damaged', `This save is damaged: ${what}.`);

/** The world of a save, with its sim components checked against the registered content. */
export function restoreWorld(
	save: SimSave,
	events: EventBus<EventMap>,
	hasPart: (id: string) => boolean,
	hasModule: (id: string) => boolean,
	hasBody: (id: string) => boolean
): World {
	let world: World;
	try {
		world = deserializeWorld(save.world, { events });
	} catch (e) {
		throw damaged(e instanceof Error ? e.message : String(e));
	}
	const missing = new Set<string>();
	for (const id of world.query([VESSEL])) {
		const why = checkVesselState(world.get(id, VESSEL));
		if (why) throw damaged(`vessel ${id}: ${why}`);
		const vessel = world.get(id, VESSEL)!;
		if (!hasBody(vessel.soi)) missing.add(`body "${vessel.soi}"`);
		if (!vessel.parts.includes(vessel.root)) throw damaged(`vessel ${id} has no root part`);
		if ((vessel.mode === 'flight') !== (vessel.rails === null)) {
			throw damaged(`vessel ${id} is in "${vessel.mode}" mode with inconsistent rails`);
		}
		for (const part of vessel.parts) {
			if (world.get(part, PART)?.vessel !== id)
				throw damaged(`part ${part} does not belong to vessel ${id}`);
		}
		for (const stage of vessel.stages) {
			for (const part of stage) {
				// A stage may list parts a split already took away; only a missing entity is damage.
				if (!world.hasEntity(part))
					throw damaged(`stage of vessel ${id} lists missing part ${part}`);
			}
		}
	}
	for (const id of world.query([PART])) {
		const why = checkPartState(world.get(id, PART));
		if (why) throw damaged(`part ${id}: ${why}`);
		const part = world.get(id, PART)!;
		if (part.link && !world.hasEntity(part.link.peer)) {
			throw damaged(`part ${id} is linked to missing part ${part.link.peer}`);
		}
		if (!hasPart(part.definition)) missing.add(`part "${part.definition}"`);
		for (const m of part.modules) if (!hasModule(m.id)) missing.add(`module "${m.id}"`);
	}
	if (missing.size > 0) {
		throw new SaveError(
			'missing-mod',
			`This save needs content that is not loaded: ${[...missing].sort().join(', ')}. Enable the mod that provides it.`
		);
	}
	return world;
}

/** Recreate the flight frames and their bodies from the save; the world is already in `core`. */
export function restoreFrames(core: SimCore, save: SimSave): void {
	if (save.frames.length > core.frames.length) {
		throw new SaveError(
			'incompatible',
			`This save used ${save.frames.length} physics frames; this sim has ${core.frames.length}.`
		);
	}
	const placed = new Set<EntityId>();
	for (const saved of save.frames) {
		const frame = core.frames[saved.id];
		if (!frame || frame.id !== saved.id) throw damaged(`unknown physics frame ${saved.id}`);
		frame.inUse = saved.inUse;
		if (saved.inUse && !core.bodies.has(saved.soi)) {
			throw new SaveError(
				'missing-mod',
				`This save needs the body "${saved.soi}", which is not loaded.`
			);
		}
		frame.soi = saved.soi;
		frame.origin = { ...saved.origin };
		frame.velocity = { ...saved.velocity };
		frame.bodies.clear();
		frame.tiles.clear();
		frame.wet.clear();
		frame.wetVessels.clear();
		frame.waterImpacts = [];
		for (const body of saved.bodies) {
			const id = body.vessel as EntityId;
			if (!core.world.hasEntity(id) || vesselOf(core, id).mode !== 'flight' || placed.has(id)) {
				throw damaged(`frame ${saved.id} holds a body for vessel ${id} that is not in flight`);
			}
			placed.add(id);
			// The mass properties last pushed to the backend, not the current ones: the next step pushes
			// any change itself, as it would have without the save.
			createVesselBody(
				core,
				frame,
				id,
				{
					origin: body.origin,
					rotation: body.rotation,
					linear: body.linear,
					angular: body.angular
				},
				{
					mass: body.mass,
					centerOfMass: body.com,
					inertia: body.inertia,
					inertiaFrame: body.inertiaFrame,
					masses: new Map(body.masses as Array<[EntityId, number]>)
				}
			);
		}
		frame.vessels = [...saved.vessels] as EntityId[];
		for (const id of frame.vessels) {
			if (!frame.bodies.has(id))
				throw damaged(`vessel ${id} is listed in frame ${saved.id} without a body`);
		}
	}
	for (const id of vesselIds(core)) {
		if (vesselOf(core, id).mode === 'flight' && !placed.has(id)) {
			throw damaged(`vessel ${id} is in flight but no physics frame holds it`);
		}
	}
	for (const id of vesselIds(core)) {
		for (const part of vesselOf(core, id).parts) partOf(core, part); // throws on a missing part
	}
}
