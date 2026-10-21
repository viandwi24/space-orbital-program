/**
 * `Sim.dispatch`: validates plain-data commands at the sim boundary (zod `commandSchema` from
 * core, then semantic checks against the world) and applies them. Refusals are results, not
 * exceptions: commands come from outside the sim.
 */
import { endRent, ownedRefusal, rentRelay } from './agencies.ts';
import { DEFAULT_TRANSFER_RATE, transferRefusal } from './transfer.ts';
import { setFlowLock } from './resources.ts';
import { moduleAction } from './actions.ts';
import { addAlarm, removeAlarm } from './alarms.ts';
import {
	nameLaunched,
	renameVessel,
	setDebrisCap,
	setVesselType,
	terminateVessel
} from './fleet.ts';
import { lockRefusal, research } from './tech.ts';
import { recoverMilestones } from './milestones.ts';
import { stageRefusal, violation, watchAscent } from './range.ts';
import {
	failureOf,
	fixAnomaly,
	launchTrials,
	partTrials,
	repair,
	setGrade,
	staticFire
} from './reliability.ts';
import {
	bodyId,
	commandSchema,
	DELAYED_COMMANDS,
	PHYSICS_WARP_MAX,
	IDENTITY_RULES,
	padLatLon,
	resolveVesselDesign,
	ruleChangeProblem,
	ruleValueProblem,
	sitesOf,
	type Command,
	type CommandResult,
	type EntityId,
	type Quat
} from '@orbital/core';
import { bodyOfVessel } from './bodies.ts';
import { MAX_WARP } from './constants.ts';
import {
	autoCrew,
	hireCrew,
	dismissCrew,
	recoverCrew,
	seatCrew,
	seatProblem,
	transferCrew
} from './crew.ts';
import { deleteData, moveData } from './data.ts';
import { recoverScience, transmitData } from './science.ts';
import {
	buyLicence,
	commsOn,
	resetStations,
	setRouteMode,
	signalRefusal,
	updateNetwork
} from './comms.ts';
import { cancelTransmission, enqueueTransmission, recoverQueued } from './transmission.ts';
import { delayOf, enqueue, type CommandSource } from './delay.ts';
import { ruleOf } from './economy.ts';
import { dropForThrust, requestWarp, requestWarpTo } from './warp.ts';

/** The rule that allows pausing the clock (plan 205, ADR 0201 point 5). */
export const PAUSE_RULE = 'stock.pause-allowed';
import {
	debugAllowed,
	debugRefusal,
	grant,
	setCheat,
	setCrewLevel,
	setDebugMode,
	setLocation,
	setOrbit,
	setResource,
	setTemperature
} from './debug.ts';
import { applyActionGroup } from './actions.ts';
import {
	crewBoard,
	crewTakeSample,
	crewClimb,
	crewEva,
	crewGrab,
	crewJump,
	crewWalk,
	plantFlag
} from './eva.ts';
import { startObjective } from './objectives.ts';
import { acceptContract, cancelContract, declineContract } from './contracts.ts';
import { activateStrategy, endStrategy } from './strategies.ts';
import { claimFact, processDataset } from './discovery.ts';
import { broadcastMilestone } from './broadcast.ts';
import { hasBackground } from './tick.ts';
import { creditRecovery, recoveryBlocker } from './economy.ts';
import { launchSiteOf, marketBuy, marketSell, payLaunch, refuseLaunch } from './market.ts';
import { createRoute, deleteRoute, deployBase, joinSite } from './bases.ts';
import { NBODY_MAX_WARP, nBodyOn } from './nbody.ts';
import {
	placeBuilding,
	removeBuilding,
	upgradeBuilding,
	finishConstruction,
	foundBranch,
	foundSite,
	foundedInThisRun
} from './buildings.ts';
import {
	hasFlightVessels,
	controlProblem,
	isControlled,
	moduleDefOf,
	moduleState,
	partOf,
	vesselIds,
	vesselOf,
	type SimCore
} from './core.ts';
import { acquireFrame, enterFlight, refreshColliders } from './frames.ts';
import { makeContext, runStageHooks } from './hooks.ts';
import { makeRoom, makeRoomAt, roomBlocker, wake, wakeBlocker } from './modes.ts';
import { computeRails, isStableOrbit, orientationOf } from './orbit.ts';
import { removeNode, setNode } from './maneuver.ts';
import { setTarget } from './target.ts';
import { beginHold, sasLevelNeeded, sasLevelOf } from './sas.ts';
import { IDENTITY, qNormalize, qRotate } from './math.ts';
import { isTurned, partRotation } from './parts.ts';
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
	const problem = controlProblem(core, vessel);
	if (problem === 'no-source') return `vessel ${id} ("${vessel.name}") has no control source`;
	if (problem === 'no-crew')
		return `vessel ${id} ("${vessel.name}") has no crew in its command part`;
	if (problem === 'no-power')
		return `no power: vessel ${id} ("${vessel.name}") has no electric charge for its probe core`;
	return vessel;
}

/** A building or site change moves the ground stations (plan 114). */
function withStations(core: SimCore, result: CommandResult): CommandResult {
	if (result.ok) resetStations(core);
	return result;
}

/** Put the vessel in flight if it is not; returns a refusal reason when that is impossible. */
function ensureFlight(core: SimCore, id: EntityId, why: string): string | undefined {
	makeRoom(core, id);
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
	vessel.launchedAt ??= core.t; // the first stage is liftoff (plan 200)
	for (const partId of stage) {
		if (core.world.hasEntity(partId) && partOf(core, partId).vessel === id) {
			partTrials(core, id, partId, 'stage'); // reliability draws at staging (plan 130, ADR 0156)
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
	const seats = command.crew && seatProblem(core, command.design, command.crew);
	if (seats) return refuse(seats);
	const locked = lockRefusal(core, command.design);
	if (locked) return refuse(locked);
	const placement = command.placement ?? { kind: 'surface' };
	// fuel from the launch site's storage, then the market (plan 097, ADR 0124 point 6)
	const launchSite = launchSiteOf(core, placement);
	const short = refuseLaunch(core, command.design, launchSite);
	if (short) return refuse(short);
	// a site placement is a surface placement on the site's body at its pad (ADR 0142 point 5)
	let surface: { latitude: number; longitude: number } | undefined;
	let bodyName = placement.kind === 'site' ? undefined : placement.body;
	if (placement.kind === 'site') {
		const site = sitesOf(core.info).find((s) => s.id === placement.site);
		if (!site) {
			const known = sitesOf(core.info)
				.map((s) => `"${s.id}"`)
				.join(', ');
			return refuse(`unknown site "${placement.site}"; this world has ${known}`);
		}
		if (foundedInThisRun(core, site.id)) {
			return refuse(
				`site "${site.id}" was founded in this run; its ground is ready after the world is loaded again`
			);
		}
		const pad = placement.at ?? site.pads[placement.pad ?? 0];
		if (!pad)
			return refuse(`site "${site.id}" has ${site.pads.length} pad(s); no pad ${placement.pad}`);
		const siteBody = core.bodies.get(site.body);
		if (!siteBody)
			return refuse(`site "${site.id}" is on "${site.body}", which this sim does not have`);
		const [latitude, longitude] = padLatLon(site, pad, siteBody.def.radius);
		surface = { latitude, longitude };
		bodyName = bodyId(site.body);
	} else if (placement.kind === 'surface') {
		surface = { latitude: placement.latitude ?? 0, longitude: placement.longitude ?? 0 };
	}
	if (bodyName !== undefined && !core.bodies.has(bodyName)) {
		return refuse(
			`unknown body "${bodyName}"; this sim has ${[...core.bodies.keys()].map((b) => `"${b}"`).join(', ')}`
		);
	}
	const id = spawnVessel(core, command.design, resolved);
	nameLaunched(core, id);
	const vessel = vesselOf(core, id);
	vessel.soi = bodyName ?? core.root.def.id;
	const body = bodyOfVessel(core, vessel);
	if (surface) {
		// an aircraft lies level on the runway (plan 063, ADR 0161 point 3)
		placeOnSurface(core, id, surface.latitude, surface.longitude, command.design.aircraft === true);
	} else if (placement.kind === 'state') {
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
		vessel.rails = computeRails(
			body.mu,
			vessel.com,
			vessel.velocity,
			core.t,
			core.info.gravityModel
		);
		if (hasBackground(core, id)) vessel.backgroundAt = core.t; // background counts from the load (ADR 0171)
	} else {
		// far vessels that can be on rails make way for the launch, as for a wake (ADR 0250)
		if (core.warp <= PHYSICS_WARP_MAX) makeRoomAt(core, vessel.soi, vessel.com);
		const frame =
			core.warp > PHYSICS_WARP_MAX
				? undefined
				: acquireFrame(core, vessel.soi, vessel.com, vessel.velocity);
		if (!frame) {
			const reason =
				core.warp > PHYSICS_WARP_MAX
					? `time warp is ${core.warp}x; set warp to ${PHYSICS_WARP_MAX}x or less before loading a vessel into flight`
					: (roomBlocker(core, vessel.soi, vessel.com) ??
						'no free physics frame (another vessel is in flight far away)');
			destroyVessel(core, id, 'could not be placed');
			return refuse(reason);
		}
		enterFlight(core, id, frame);
	}
	if (!surface) vessel.launchedAt = core.t; // loaded in flight or orbit: no pad to wait on
	if (command.crew && command.crew.length > 0) {
		// Design indices to part entities: the vessel's parts follow the resolved order.
		const indexOf = new Map(resolved.parts.map((rp, i) => [rp.index, vessel.parts[i]!]));
		seatCrew(core, id, command.crew, (index) => indexOf.get(index)!);
	} else if (command.crew === undefined) autoCrew(core, id); // fill an empty command seat (plan 200)
	core.events.emit('vessel:mode-changed', { vessel: id, mode: vessel.mode, reason: 'loaded' });
	payLaunch(core, command.design, launchSite); // only a vessel that was placed is paid for (ADR 0113)
	if (placement.kind === 'site') {
		const site = sitesOf(core.info).find((s) => s.id === placement.site);
		if (site) watchAscent(core, id, site); // its ascent azimuth is judged at 2 km (ADR 0155)
	}
	launchTrials(core, id); // reliability draws at load (plan 130, ADR 0156 point 1)
	return accept(id);
}

/**
 * `antenna-point` (ADR 0188 point 2): a dish of the vessel points at a target (null: Auto). Never
 * refused for lack of signal, as antenna toggles are not.
 */
function pointAntenna(
	core: SimCore,
	vesselId: EntityId,
	partId: EntityId,
	target: string | null
): CommandResult {
	if (!core.world.has(vesselId, VESSEL)) return refuse(`no vessel ${vesselId}`);
	if (!vesselOf(core, vesselId).parts.includes(partId))
		return refuse(`part ${partId} is not on vessel ${vesselId}`);
	for (const m of partOf(core, partId).modules) {
		const def = moduleDefOf(core, m.id);
		if (!def.antenna) continue;
		const state = moduleState(core, partId, m.id) as { target?: string | null };
		const a = def.antenna(m.config, state);
		if (core.registries.antennas.get(a.antenna)?.kind !== 'dish')
			return refuse('only a dish can be pointed');
		state.target = target;
		core.comms.dirty = true;
		return accept();
	}
	return refuse(`part ${partId} has no antenna`);
}

/** Commands that may name an agency's vessel (renting, inspecting it). */
const OWNED_ALLOWED: ReadonlySet<string> = new Set([
	'relay-rent',
	'relay-end-rent',
	'comms-inspect'
]);

const clampUnit = (n: number): number => Math.max(-1, Math.min(1, n));

/** The control part's rotation in the vessel (ADR 0270 point 4), or undefined for the root or none. */
function controlTurn(core: SimCore, v: VesselState): Quat | undefined {
	const id = v.controlPart;
	if (id === undefined || id === v.root || !core.world.hasEntity(id)) return undefined;
	const part = partOf(core, id);
	return isTurned(part) ? partRotation(part) : undefined;
}

/**
 * Validate and apply a command. `source` says who sent it (plan 117, ADR 0188 point 6): the
 * signal-delay rule may queue a player's (or, under `enforced`, a script's) vessel control
 * command; `queued` is a command coming off that queue, applied now.
 */
export function dispatch(
	core: SimCore,
	raw: unknown,
	source: CommandSource | 'queued' = 'player'
): CommandResult {
	const parsed = commandSchema.safeParse(raw);
	if (!parsed.success) {
		const issues = parsed.error.issues.map(
			(i) => `${i.path.join('.') || '(command)'}: ${i.message}`
		);
		return refuse(`invalid command: ${issues.join('; ')}`);
	}
	const command = parsed.data;
	// an agency's vessel takes no orders from the player (plan 126, ADR 0190 point 3)
	if ('vessel' in command && !OWNED_ALLOWED.has(command.type)) {
		const owned = ownedRefusal(core, command.vessel as EntityId);
		if (owned) return refuse(owned);
	}
	if (source !== 'queued' && DELAYED_COMMANDS.has(command.type)) {
		const vessel = (command as { vessel: EntityId }).vessel;
		if (core.world.has(vessel, VESSEL)) {
			if (core.comms.dirty || core.comms.last === null) updateNetwork(core);
			const wait = delayOf(core, command, source);
			if (wait > 0) {
				const at = core.t + wait;
				enqueue(core, command, at);
				return { ok: true, queued: at };
			}
		}
	}
	if (command.type.startsWith('debug-')) {
		// the access rule first (ADR 0213 point 3); `debug-mode` checks its own
		const locked = command.type === 'debug-mode' ? undefined : debugRefusal(core);
		if (locked) return refuse(locked);
	}
	switch (command.type) {
		case 'throttle': {
			const v = controllable(core, command.vessel);
			if (typeof v === 'string') return refuse(v);
			const noSignal = signalRefusal(core, command.vessel, 'throttle');
			if (noSignal) return refuse(noSignal);
			if (command.value > 0 && v.mode === 'on-rails') {
				dropForThrust(core, command.vessel); // rails warp falls to physics warp (ADR 0202 point 5)
				const why = ensureFlight(core, command.vessel, 'throttle');
				if (why) return refuse(why);
			}
			v.control.throttle = command.value;
			return accept();
		}
		case 'trim': {
			const v = controllable(core, command.vessel);
			if (typeof v === 'string') return refuse(v);
			// an omitted axis keeps its value, 0 clears it (plan 245, ADR 0233)
			if (command.pitch !== undefined) {
				if (command.pitch === 0) delete v.trim;
				else v.trim = command.pitch;
			}
			if (command.yaw !== undefined) {
				if (command.yaw === 0) delete v.trimYaw;
				else v.trimYaw = command.yaw;
			}
			if (command.roll !== undefined) {
				if (command.roll === 0) delete v.trimRoll;
				else v.trimRoll = command.roll;
			}
			return accept();
		}
		case 'attitude': {
			const v = controllable(core, command.vessel);
			if (typeof v === 'string') return refuse(v);
			const noSignal = signalRefusal(core, command.vessel, 'attitude');
			if (noSignal) return refuse(noSignal);
			const t = command.translate;
			if (t && ![t.x, t.y, t.z].every((n) => Number.isFinite(n) && Math.abs(n) <= 1))
				return refuse('translate must be three numbers in -1..1');
			const translating = t !== undefined && (t.x !== 0 || t.y !== 0 || t.z !== 0);
			const demanded =
				command.pitch !== 0 || command.yaw !== 0 || command.roll !== 0 || translating;
			if (demanded && v.mode === 'on-rails') {
				const why = ensureFlight(core, command.vessel, 'attitude');
				if (why) return refuse(why);
			}
			// the input is in the control part's axes (ADR 0270 point 4): turned into the vessel's
			const turn = controlTurn(core, v);
			const torque = turn
				? qRotate(turn, { x: command.pitch, y: command.roll, z: command.yaw })
				: { x: command.pitch, y: command.roll, z: command.yaw };
			v.control.pitch = clampUnit(torque.x);
			v.control.yaw = clampUnit(torque.z);
			v.control.roll = clampUnit(torque.y);
			if (t !== undefined) {
				const move = turn ? qRotate(turn, t) : t;
				if (translating)
					v.translate = { x: clampUnit(move.x), y: clampUnit(move.y), z: clampUnit(move.z) };
				else delete v.translate;
			}
			return accept();
		}
		case 'transfer': {
			const v = core.world.get(command.vessel, VESSEL);
			if (!v) return refuse(`unknown vessel ${command.vessel}`);
			if (v.owner !== undefined)
				return refuse(`vessel ${command.vessel} belongs to another agency`);
			if (command.stop) {
				v.transfers = (v.transfers ?? []).filter((j) => j.resource !== command.resource);
				if (v.transfers.length === 0) delete v.transfers;
				return accept();
			}
			if (!command.from || !command.to) return refuse('a transfer needs source and target parts');
			const why = transferRefusal(core, command.vessel, command.resource, command.from, command.to);
			if (why) return refuse(why);
			const rate =
				command.rate ??
				core.registries.resources.get(command.resource)?.transferRate ??
				DEFAULT_TRANSFER_RATE;
			v.transfers = [
				...(v.transfers ?? []),
				{ resource: command.resource, from: [...command.from], to: [...command.to], rate }
			];
			return accept();
		}
		case 'set-flow-lock': {
			const v = core.world.get(command.vessel, VESSEL);
			if (!v) return refuse(`unknown vessel ${command.vessel}`);
			if (!v.parts.includes(command.part)) {
				return refuse(`part ${command.part} is not part of vessel ${command.vessel}`);
			}
			if (!setFlowLock(core, command.part, command.resource, command.locked)) {
				return refuse(`part ${command.part} has no lockable store of "${command.resource}"`);
			}
			return accept();
		}
		case 'set-rcs': {
			const v = controllable(core, command.vessel);
			if (typeof v === 'string') return refuse(v);
			const noSignal = signalRefusal(core, command.vessel, 'set-rcs');
			if (noSignal) return refuse(noSignal);
			if (command.on) v.rcs = true;
			else delete v.rcs;
			return accept();
		}
		case 'sas': {
			const v = controllable(core, command.vessel);
			if (typeof v === 'string') return refuse(v);
			const noSignal = signalRefusal(core, command.vessel, 'sas');
			if (noSignal) return refuse(noSignal);
			if (command.mode !== undefined && sasLevelNeeded(command.mode) > sasLevelOf(core, v)) {
				const labels = ['hold only', 'basic', 'advanced', 'full'];
				return refuse(
					`this vessel's control parts give ${labels[sasLevelOf(core, v)]} assist; ${command.mode} needs more`
				);
			}
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
			const noSignal = signalRefusal(core, command.vessel, 'stage');
			if (noSignal) return refuse(noSignal);
			if (v.nextStage >= v.stages.length)
				return refuse(`vessel ${command.vessel} has no stage left to fire`);
			const why = ensureFlight(core, command.vessel, 'stage');
			if (why) return refuse(why);
			// range safety judges the stage this firing drops (plan 127, ADR 0155 point 3)
			const range = stageRefusal(core, command.vessel);
			if (range.refusal) return refuse(range.refusal);
			const fired = fireStage(core, command.vessel);
			if (fired.ok && range.drop) {
				const { kind, latitude, longitude } = range.drop;
				violation(core, command.vessel, kind, {
					...(range.drop.kind === 'site' ? { site: range.drop.site } : {}),
					latitude,
					longitude
				});
			}
			return fired;
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
			const action = moduleAction(moduleDefOf(core, command.module), command.action);
			if (!action) return refuse(`module "${command.module}" has no action "${command.action}"`);
			const failure = failureOf(core, command.part, command.module);
			if (failure) return refuse(`module "${command.module}" has failed: ${failure.label}`);
			// an antenna can always be switched, or a probe could never get its signal back
			if (!moduleDefOf(core, command.module).antenna) {
				const noSignal = signalRefusal(core, command.vessel, 'action');
				if (noSignal) return refuse(noSignal);
			}
			core.comms.dirty = true;
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
		case 'warp':
			return requestWarp(core, command.factor, command.vessel);
		case 'warp-to':
			return requestWarpTo(core, command);
		case 'add-alarm':
			return addAlarm(core, command);
		case 'rename-vessel':
			return renameVessel(core, command.vessel, command.name);
		case 'set-vessel-type':
			return setVesselType(core, command.vessel, command.vesselType);
		case 'terminate-vessel':
			return terminateVessel(core, command.vessel);
		case 'set-debris-cap':
			return setDebrisCap(core, command.cap);
		case 'remove-alarm':
			return removeAlarm(core, command.id);
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
		case 'target-set': {
			const v = controllable(core, command.vessel);
			if (typeof v === 'string') return refuse(v);
			return setTarget(core, command.vessel, v, command.target);
		}
		case 'load-vessel':
			return loadVessel(core, command);
		case 'set-rule': {
			core.comms.dirty = true;
			return setRule(core, command.rule, command.value);
		}
		case 'recover-vessel': {
			const id = command.vessel;
			if (!core.world.has(id, VESSEL)) return refuse(`no vessel ${id}`);
			const why = recoveryBlocker(core, id);
			if (why) return refuse(why);
			creditRecovery(core, id);
			recoverScience(core, id); // science aboard at full value (plan 103, ADR 0178 point 7)
			recoverQueued(core, id); // and what its radio still held (plan 119, ADR 0189)
			recoverMilestones(core, id); // first returns, crew still aboard (plan 102, ADR 0147)
			recoverCrew(core, id); // XP at a safe return (plan 106, ADR 0176 point 5)
			destroyVessel(core, id, 'recovered');
			return accept();
		}
		case 'place-building':
			return withStations(core, placeBuilding(core, command));
		case 'remove-building':
			return withStations(core, removeBuilding(core, command));
		case 'upgrade-building':
			return withStations(core, upgradeBuilding(core, command));
		case 'found-site':
			return withStations(core, foundSite(core, command));
		case 'found-branch':
			return withStations(core, foundBranch(core, command));
		case 'transmit-data': {
			if (!core.world.has(command.vessel, VESSEL)) return refuse(`no vessel ${command.vessel}`);
			// through the radio's queue with comms on, at once with it off (ADR 0099 point 2, 0189)
			return commsOn(core)
				? enqueueTransmission(core, command.vessel, command.item)
				: transmitData(core, command.vessel, command.item);
		}
		case 'transmission-cancel':
			if (!core.world.has(command.vessel, VESSEL)) return refuse(`no vessel ${command.vessel}`);
			return cancelTransmission(core, command.vessel, command.item);
		case 'comms-inspect':
			// view state (ADR 0185 point 9): never saved, never refused
			core.comms.inspect = command.vessel;
			return accept();
		case 'comms-route': {
			if (!core.world.has(command.vessel, VESSEL)) return refuse(`no vessel ${command.vessel}`);
			const m = command.mode;
			if (m.kind === 'policy' && !core.registries.routePolicies.has(m.policy))
				return refuse(`no route policy "${m.policy}"`);
			setRouteMode(core, command.vessel, m);
			return accept();
		}
		case 'antenna-point':
			return pointAntenna(core, command.vessel, command.part, command.target);
		case 'contract-accept':
			return acceptContract(core, command.offer);
		case 'contract-decline':
			return declineContract(core, command.offer);
		case 'contract-cancel':
			return cancelContract(core, command.contract);
		case 'strategy-activate':
			return activateStrategy(core, command.strategy);
		case 'strategy-end':
			return endStrategy(core, command.strategy);
		case 'relay-rent':
			return rentRelay(core, command.vessel);
		case 'relay-end-rent':
			return endRent(core, command.vessel);
		case 'licence-buy':
			return buyLicence(core, command.band, command.channel);
		case 'discovery-process':
			return processDataset(core, command.dataset);
		case 'discovery-claim':
			return claimFact(core, command.body, command.fact, command.value, command.confidence);
		case 'comms-broadcast':
			return broadcastMilestone(core, command.milestone);
		case 'research':
			return research(core, command.node);
		case 'crew-hire':
			return hireCrew(core, command.profession);
		case 'deploy-base':
			return withStations(core, deployBase(core, command));
		case 'join-site':
			return joinSite(core, command);
		case 'create-route':
			return createRoute(core, command);
		case 'delete-route':
			return deleteRoute(core, command);
		case 'market-buy':
			return marketBuy(core, command);
		case 'market-sell':
			return marketSell(core, command);
		case 'crew-dismiss':
			return dismissCrew(core, command.member);
		case 'crew-eva':
			return crewEva(core, command.vessel, command.member);
		case 'crew-board':
			return crewBoard(core, command.suit, command.vessel);
		case 'crew-take':
			return crewTakeSample(core, command.suit, command.vessel, command.part);
		case 'crew-walk':
			if (!core.world.has(command.vessel, VESSEL)) return refuse(`no vessel ${command.vessel}`);
			return crewWalk(core, command.vessel, command.heading, command.speed);
		case 'crew-grab':
			if (!core.world.has(command.suit, VESSEL)) return refuse(`no vessel ${command.suit}`);
			return crewGrab(core, command.suit, command.release === true);
		case 'crew-climb':
			if (!core.world.has(command.suit, VESSEL)) return refuse(`no vessel ${command.suit}`);
			return crewClimb(core, command.suit, command.rate);
		case 'crew-jump':
			if (!core.world.has(command.suit, VESSEL)) return refuse(`no vessel ${command.suit}`);
			return crewJump(core, command.suit);
		case 'set-grade':
			return setGrade(core, command.part, command.grade);
		case 'static-fire':
			return staticFire(core, command.part);
		case 'fix-anomaly':
			return fixAnomaly(core, command.report);
		case 'repair':
			return repair(core, command.suit, command.vessel, command.part);
		case 'set-control-part': {
			const v = controllable(core, command.vessel);
			if (typeof v === 'string') return refuse(v);
			if (command.part === null) {
				delete v.controlPart;
				return accept();
			}
			if (!v.parts.includes(command.part)) {
				return refuse(`part ${command.part} is not on vessel ${command.vessel}`);
			}
			const controls = partOf(core, command.part).modules.some(
				(m) =>
					moduleDefOf(core, m.id).controlSource === true ||
					moduleDefOf(core, m.id).controlPoint === true
			);
			if (!controls) return refuse('only a command part or a docking port can be controlled from');
			v.controlPart = command.part;
			return accept();
		}
		case 'pause': {
			if (command.on && ruleOf(core, PAUSE_RULE) === false) {
				return refuse('this world does not allow pausing (stock.pause-allowed)');
			}
			core.paused = command.on;
			return accept();
		}
		case 'debug-mode':
			return setDebugMode(core, command.on);
		case 'debug-cheat': {
			const r = setCheat(core, command.cheat, command.on);
			// instant construction also finishes the work in progress (plan 236: a branch's HQ)
			if (
				r.ok &&
				command.cheat === 'instant-construction' &&
				command.on &&
				finishConstruction(core)
			)
				resetStations(core);
			return r;
		}
		case 'debug-grant':
			return grant(core, command);
		case 'debug-set-orbit':
			return setOrbit(core, command);
		case 'debug-set-location':
			return setLocation(core, command);
		case 'debug-set-resource':
			return setResource(core, command);
		case 'debug-set-temperature':
			return setTemperature(core, command);
		case 'debug-set-crew-level':
			return setCrewLevel(core, command.member, command.level);
		case 'plant-flag':
			if (!core.world.has(command.vessel, VESSEL)) return refuse(`no vessel ${command.vessel}`);
			return plantFlag(core, command.vessel);
		case 'crew-transfer':
			return transferCrew(core, command.vessel, command.member, command.to);
		case 'action-group': {
			const vessel = core.world.get(command.vessel, VESSEL);
			if (!vessel) return refuse(`unknown vessel ${command.vessel}`);
			const noSignal = signalRefusal(core, command.vessel, 'action-group');
			if (noSignal) return refuse(noSignal);
			core.comms.dirty = true;
			const why =
				vessel.mode === 'on-rails' ? ensureFlight(core, command.vessel, 'action group') : undefined;
			if (why) return refuse(why);
			const result = applyActionGroup(core, command.vessel, command.group, command.value);
			processPending(core);
			refreshColliders(core, command.vessel);
			return result;
		}
		case 'objective-start':
			return startObjective(core, command.source, command.vessel);
		case 'move-data':
		case 'delete-data': {
			if (!core.world.get(command.vessel, VESSEL))
				return refuse(`unknown vessel ${command.vessel}`);
			return command.type === 'move-data'
				? moveData(core, command.vessel, command.item, command.to)
				: deleteData(core, command.vessel, command.item);
		}
	}
}

/** ADR 0111 point 4: validated, written at once (effective from the next step), logged. */
function setRule(core: SimCore, id: string, value: boolean | number | string): CommandResult {
	if (IDENTITY_RULES.includes(id)) return refuse('identity rule');
	const rule = core.registries.rules.get(id);
	if (!rule) return refuse(`unknown rule "${id}"`);
	if (!rule.changeable) return refuse('identity rule');
	const why = ruleValueProblem(rule, value);
	if (why) return refuse(`invalid value for rule "${id}": ${why}`);
	const from = core.info.rules[id] ?? rule.default;
	if (from === value) return accept();
	// toward easier only during play (plan 230, ADR 0230); debug mode may change anything
	if (!debugAllowed(core)) {
		const current = ruleOf(core, id) ?? from;
		const harder = ruleChangeProblem(rule, current, value);
		if (harder) return refuse(`${rule.label}: ${harder}`);
	}
	core.info.rules[id] = value;
	core.info.changelog.push({ time: core.t, rule: id, from, to: value });
	core.rulesView = null;
	core.events.emit('world:rule-changed', { rule: id, from, to: value, time: core.t });
	return accept();
}
