/**
 * `Sim.dispatch`: validates plain-data commands at the sim boundary (zod `commandSchema` from
 * core, then semantic checks against the world) and applies them. Refusals are results, not
 * exceptions: commands come from outside the sim.
 */
import {
	commandSchema,
	resolveVesselDesign,
	type Command,
	type CommandResult,
	type EntityId
} from '@orbital/core';
import { bodyOfVessel } from './bodies.ts';
import { MAX_WARP } from './constants.ts';
import {
	hasFlightVessels,
	isControlled,
	moduleDefOf,
	partOf,
	vesselIds,
	vesselOf,
	type SimCore
} from './core.ts';
import { acquireFrame, enterFlight, refreshColliders } from './frames.ts';
import { makeContext, runStageHooks } from './hooks.ts';
import { wake, wakeBlocker } from './modes.ts';
import { computeRails, isStableOrbit, orientationOf } from './orbit.ts';
import { removeNode, setNode } from './maneuver.ts';
import { beginHold } from './sas.ts';
import { IDENTITY, qNormalize } from './math.ts';
import {
	destroyVessel,
	placeAtState,
	placeOnSurface,
	processPending,
	spawnVessel
} from './vessel.ts';
import { VESSEL, PART, type VesselState } from './state.ts';

const refuse = (reason: string): CommandResult => ({ ok: false, reason });
const accept = (vessel?: EntityId): CommandResult =>
	vessel === undefined ? { ok: true } : { ok: true, vessel };

function controllable(core: SimCore, id: EntityId): VesselState | string {
	const vessel = core.world.get(id, VESSEL);
	if (!vessel) return `unknown vessel ${id}`;
	if (!isControlled(core, vessel)) return `vessel ${id} ("${vessel.name}") has no control source`;
	return vessel;
}

/** Put the vessel in flight if it is not; returns a refusal reason when that is impossible. */
function ensureFlight(core: SimCore, id: EntityId, why: string): string | undefined {
	const blocker = wakeBlocker(core, id);
	if (blocker) return blocker;
	wake(core, id, why);
	return undefined;
}

function fireStage(core: SimCore, id: EntityId): CommandResult {
	const vessel = vesselOf(core, id);
	const stage = vessel.stages[vessel.nextStage];
	if (!stage) return refuse(`vessel ${id} has no stage left to fire`);
	const index = vessel.nextStage;
	vessel.nextStage += 1;
	for (const partId of stage) {
		if (core.world.hasEntity(partId) && partOf(core, partId).vessel === id) {
			runStageHooks(core, partId);
		}
	}
	processPending(core);
	refreshColliders(core, id);
	core.events.emit('stage:activated', { vessel: id, stage: index });
	return accept();
}

function loadVessel(
	core: SimCore,
	command: Extract<Command, { type: 'load-vessel' }>
): CommandResult {
	const resolved = resolveVesselDesign(command.design, core.registries.parts);
	if (!resolved.ok) return refuse(`invalid design: ${resolved.errors.join('; ')}`);
	const placement = command.placement ?? { kind: 'surface' };
	if (placement.body !== undefined && !core.bodies.has(placement.body)) {
		return refuse(
			`unknown body "${placement.body}"; this sim has ${[...core.bodies.keys()].map((b) => `"${b}"`).join(', ')}`
		);
	}
	const id = spawnVessel(core, command.design, resolved);
	const vessel = vesselOf(core, id);
	vessel.soi = placement.body ?? core.root.def.id;
	const body = bodyOfVessel(core, vessel);
	if (placement.kind === 'surface') {
		placeOnSurface(core, id, placement.latitude ?? 0, placement.longitude ?? 0);
	} else {
		placeAtState(
			core,
			id,
			placement.position,
			placement.velocity,
			qNormalize(placement.orientation ?? IDENTITY)
		);
	}
	const onRails = placement.kind === 'state' && isStableOrbit(body, vessel.com, vessel.velocity);
	if (onRails) {
		vessel.rails = computeRails(body.mu, vessel.com, vessel.velocity, core.t);
	} else {
		const frame =
			core.warp > 1 ? undefined : acquireFrame(core, vessel.soi, vessel.com, vessel.velocity);
		if (!frame) {
			destroyVessel(core, id, 'could not be placed');
			return refuse(
				core.warp > 1
					? `time warp is ${core.warp}x; set warp to 1 before loading a vessel into flight`
					: 'no free physics frame (another vessel is in flight far away)'
			);
		}
		enterFlight(core, id, frame);
	}
	core.events.emit('vessel:mode-changed', { vessel: id, mode: vessel.mode, reason: 'loaded' });
	return accept(id);
}

export function dispatch(core: SimCore, raw: unknown): CommandResult {
	const parsed = commandSchema.safeParse(raw);
	if (!parsed.success) {
		const issues = parsed.error.issues.map(
			(i) => `${i.path.join('.') || '(command)'}: ${i.message}`
		);
		return refuse(`invalid command: ${issues.join('; ')}`);
	}
	const command = parsed.data;
	switch (command.type) {
		case 'throttle': {
			const v = controllable(core, command.vessel);
			if (typeof v === 'string') return refuse(v);
			if (command.value > 0 && v.mode === 'on-rails') {
				const why = ensureFlight(core, command.vessel, 'throttle');
				if (why) return refuse(why);
			}
			v.control.throttle = command.value;
			return accept();
		}
		case 'attitude': {
			const v = controllable(core, command.vessel);
			if (typeof v === 'string') return refuse(v);
			const demanded = command.pitch !== 0 || command.yaw !== 0 || command.roll !== 0;
			if (demanded && v.mode === 'on-rails') {
				const why = ensureFlight(core, command.vessel, 'attitude');
				if (why) return refuse(why);
			}
			v.control.pitch = command.pitch;
			v.control.yaw = command.yaw;
			v.control.roll = command.roll;
			return accept();
		}
		case 'sas': {
			const v = controllable(core, command.vessel);
			if (typeof v === 'string') return refuse(v);
			if (command.reference !== undefined) v.sas.reference = command.reference;
			if (command.mode !== undefined && command.mode !== v.sas.mode) {
				v.sas.mode = command.mode;
				v.sas.integral = { x: 0, y: 0, z: 0 };
				v.sas.active = false;
				v.sas.quiet = false;
				v.sas.error = 0;
				if (command.mode === 'hold') beginHold(v.sas, orientationOf(core, v));
			}
			return accept();
		}
		case 'stage': {
			const v = controllable(core, command.vessel);
			if (typeof v === 'string') return refuse(v);
			if (v.nextStage >= v.stages.length)
				return refuse(`vessel ${command.vessel} has no stage left to fire`);
			const why = ensureFlight(core, command.vessel, 'stage');
			if (why) return refuse(why);
			return fireStage(core, command.vessel);
		}
		case 'action': {
			const vessel = core.world.get(command.vessel, VESSEL);
			if (!vessel) return refuse(`unknown vessel ${command.vessel}`);
			const part = core.world.get(command.part, PART);
			if (!part || part.vessel !== command.vessel) {
				return refuse(`part ${command.part} is not part of vessel ${command.vessel}`);
			}
			const instance = part.modules.find((m) => m.id === command.module);
			if (!instance) return refuse(`part ${command.part} has no module "${command.module}"`);
			const action = moduleDefOf(core, command.module).actions?.[command.action];
			if (!action) return refuse(`module "${command.module}" has no action "${command.action}"`);
			const why =
				vessel.mode === 'on-rails' ? ensureFlight(core, command.vessel, 'action') : undefined;
			if (why) return refuse(why);
			const args =
				command.args === undefined
					? []
					: Array.isArray(command.args)
						? command.args
						: [command.args];
			try {
				action(makeContext(core, command.part, command.module), ...args);
			} catch (e) {
				return refuse(
					`action "${command.module}.${command.action}" failed: ${e instanceof Error ? e.message : String(e)}`
				);
			}
			processPending(core);
			refreshColliders(core, command.vessel);
			return accept();
		}
		case 'warp': {
			if (command.factor > MAX_WARP)
				return refuse(`warp ${command.factor} exceeds the maximum ${MAX_WARP}`);
			if (command.factor > 1 && hasFlightVessels(core)) {
				const flying = vesselIds(core).filter((id) => vesselOf(core, id).mode === 'flight');
				return refuse(
					`time warp needs every vessel on rails; in flight: ${flying.map((id) => `${id} ("${vesselOf(core, id).name}")`).join(', ')}`
				);
			}
			core.warp = command.factor;
			core.warpTarget = null;
			return accept();
		}
		case 'warp-to': {
			if (command.factor > MAX_WARP)
				return refuse(`warp ${command.factor} exceeds the maximum ${MAX_WARP}`);
			if (command.time <= core.t) return refuse('warp-to needs a time that has not passed');
			if (hasFlightVessels(core)) {
				const flying = vesselIds(core).filter((id) => vesselOf(core, id).mode === 'flight');
				return refuse(
					`time warp needs every vessel on rails; in flight: ${flying.map((id) => `${id} ("${vesselOf(core, id).name}")`).join(', ')}`
				);
			}
			core.warp = command.factor;
			core.warpTarget = command.time;
			return accept();
		}
		case 'node-set': {
			const v = controllable(core, command.vessel);
			if (typeof v === 'string') return refuse(v);
			return setNode(core, v, command);
		}
		case 'node-remove': {
			const v = controllable(core, command.vessel);
			if (typeof v === 'string') return refuse(v);
			return removeNode(core, v, command.id);
		}
		case 'load-vessel':
			return loadVessel(core, command);
	}
}
