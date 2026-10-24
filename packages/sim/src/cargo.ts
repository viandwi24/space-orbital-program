/**
 * Cargo (plan 284, ADR 0264): small parts a suit or a container carries (`stock.inventory`), and
 * what an astronaut does with them: take them out of a container and put them in, attach one to a
 * hull (an engineer only), detach one back, or set a deployable one on the ground as a station
 * item. An item keeps the module states its part had (a battery's charge) while it is carried.
 */
import {
	resolveVesselDesign,
	cloneData,
	parseModuleConfig,
	withSettings,
	type CommandResult,
	type EntityId,
	type PartDefinition,
	type VesselDesign
} from '@orbital/core';
import { length, sub } from '@orbital/kepler';
import { vesselOfMember } from './crew.ts';
import { stationItems } from './stations.ts';
import {
	moduleDefOf,
	moduleState,
	partDefOf as corePartDef,
	partOf,
	vesselOf,
	type SimCore
} from './core.ts';
import { eastOf, pointOf, spawnBeside, standing, TAKE_RANGE } from './eva.ts';
import { refreshColliders } from './frames.ts';
import { motionOf } from './orbit.ts';
import { AMBIENT_TEMPERATURE } from './constants.ts';
import { moduleStateToken, PART } from './state.ts';

const refuse = (reason: string): CommandResult => ({ ok: false, reason });
const INVENTORY = 'stock.inventory';

/** One carried part, as `stock.inventory` keeps it. */
interface CargoItem {
	part: string;
	state?: Record<string, unknown>;
}
interface InventoryState {
	items: CargoItem[];
}

const defOf = (core: SimCore, id: EntityId): PartDefinition => corePartDef(core, partOf(core, id));

/** The inventory module of a part: its state and its capacity, litres; undefined when it has none. */
function inventoryOf(
	core: SimCore,
	partId: EntityId
): { state: InventoryState; capacity: number } | undefined {
	const mod = partOf(core, partId).modules.find((m) => m.id === INVENTORY);
	if (!mod) return undefined;
	const state = moduleState(core, partId, INVENTORY) as InventoryState | undefined;
	return state ? { state, capacity: (mod.config as { capacity: number }).capacity } : undefined;
}

/** The suit's own inventory part, or a reason it has none. */
function suitInventory(
	core: SimCore,
	suitId: EntityId
): { part: EntityId; state: InventoryState; capacity: number } | string {
	if (!core.world.hasEntity(suitId)) return `unknown vessel ${suitId}`;
	for (const id of vesselOf(core, suitId).parts) {
		const inv = inventoryOf(core, id);
		if (inv) return { part: id, ...inv };
	}
	return `vessel ${suitId} carries no inventory`;
}

const volumeOf = (core: SimCore, item: CargoItem): number =>
	core.registries.parts.get(item.part)?.cargo?.volume ?? 0;
const used = (core: SimCore, items: readonly CargoItem[]): number =>
	items.reduce((s, i) => s + volumeOf(core, i), 0);

/** The crew member in the suit, or a reason there is none. */
function wearer(core: SimCore, suitId: EntityId) {
	return core.crew.members.find((m) => vesselOfMember(core, m) === suitId);
}

/** Whether the suit stands within reach of a point of `partId`'s vessel. */
function withinReach(core: SimCore, suitId: EntityId, partId: EntityId): string | undefined {
	const suit = vesselOf(core, suitId);
	const part = partOf(core, partId);
	const vessel = vesselOf(core, part.vessel);
	if (suit.soi !== vessel.soi) return 'not near (another sphere)';
	const at = pointOf(core, part.vessel, partId, { x: 0, y: 0, z: 0 });
	const distance = length(sub(motionOf(core, suit).r, at));
	return distance > TAKE_RANGE
		? `${Math.round(distance)} m from the part (reach within ${TAKE_RANGE} m)`
		: undefined;
}

/** `cargo-move`: an item between the suit's inventory and a container part's. */
export function cargoMove(
	core: SimCore,
	command: { suit: EntityId; part: EntityId; index: number; direction: 'take' | 'store' }
): CommandResult {
	const mine = suitInventory(core, command.suit);
	if (typeof mine === 'string') return refuse(mine);
	if (!core.world.has(command.part, PART)) return refuse(`no part ${command.part}`);
	if (command.part === mine.part) return refuse('that is the suit itself');
	if (!wearer(core, command.suit)) return refuse(`vessel ${command.suit} carries no crew member`);
	const there = inventoryOf(core, command.part);
	if (!there) return refuse('that part holds no cargo');
	const far = withinReach(core, command.suit, command.part);
	if (far) return refuse(far);
	const [from, to] = command.direction === 'take' ? [there, mine] : [mine, there];
	const item = from.state.items[command.index];
	if (!item) return refuse(`no item ${command.index}`);
	if (used(core, to.state.items) + volumeOf(core, item) > to.capacity + 1e-9)
		return refuse('no room for it (cargo volume)');
	from.state.items.splice(command.index, 1);
	to.state.items.push(item);
	return { ok: true };
}

/** The states of a part's modules, to carry with it. */
function captureState(core: SimCore, partId: EntityId): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const m of partOf(core, partId).modules) {
		const s = moduleState(core, partId, m.id);
		if (s !== undefined) out[m.id] = cloneData(s);
	}
	return out;
}

/** Put saved module states back on a part (the item's own, over fresh ones). */
function restoreState(core: SimCore, partId: EntityId, saved: Record<string, unknown> | undefined) {
	if (!saved) return;
	for (const m of partOf(core, partId).modules) {
		if (saved[m.id] !== undefined)
			core.world.add(partId, moduleStateToken(m.id), cloneData(saved[m.id]));
	}
}

const isEngineer = (core: SimCore, suitId: EntityId): boolean =>
	wearer(core, suitId)?.profession === 'engineer';

/** `cargo-attach`: an engineer fixes an inventory item to the side of a hull part. */
export function cargoAttach(
	core: SimCore,
	command: { suit: EntityId; host: EntityId; index: number; angle: number; y: number }
): CommandResult {
	const mine = suitInventory(core, command.suit);
	if (typeof mine === 'string') return refuse(mine);
	if (!isEngineer(core, command.suit)) return refuse('only an engineer attaches parts');
	if (!core.world.has(command.host, PART)) return refuse(`no part ${command.host}`);
	const item = mine.state.items[command.index];
	if (!item) return refuse(`no item ${command.index}`);
	const def = core.registries.parts.get(item.part);
	if (!def?.cargo) return refuse('that part is not cargo');
	const far = withinReach(core, command.suit, command.host);
	if (far) return refuse(far);
	const host = partOf(core, command.host);
	const vesselId = host.vessel;
	const vessel = vesselOf(core, vesselId);
	if (vessel.docks?.length) return refuse('a docked vessel cannot take cargo yet; undock first');
	if (!vessel.design) return refuse('this vessel has no design to attach to');
	if (!def.attach?.radial) return refuse('that part has no side to attach by');
	// the design with the part on: the same resolver the Hangar uses finds where it sits
	const index = Math.max(...vessel.design.parts.map((p) => p.index), -1) + 1;
	const next: VesselDesign = {
		...vessel.design,
		formatVersion: Math.max(vessel.design.formatVersion, 2) as VesselDesign['formatVersion'],
		parts: [
			...vessel.design.parts,
			{
				index,
				part: def.id as VesselDesign['parts'][number]['part'],
				parent: {
					index: host.index,
					parentNode: 'surface',
					node: 'radial',
					radial: { angle: command.angle, y: command.y }
				}
			}
		]
	};
	const resolved = resolveVesselDesign(next, core.registries.parts);
	if (!resolved.ok) return refuse(`it does not fit there: ${resolved.errors[0] ?? 'unknown'}`);
	const rp = resolved.parts.find((p) => p.index === index);
	if (!rp?.parent) return refuse('it does not fit there');
	const world = core.world;
	const partId = world.createEntity();
	const modules: Array<{ id: string; config: unknown }> = [];
	for (const [moduleId, base] of def.modules ?? []) {
		const mdef = moduleDefOf(core, moduleId);
		const parsed = parseModuleConfig(mdef, withSettings(base, undefined));
		if (!parsed.ok) return refuse(`module "${moduleId}": ${parsed.message}`);
		modules.push({ id: moduleId, config: parsed.value });
		const state = mdef.state?.(parsed.value);
		if (state !== undefined) world.add(partId, moduleStateToken(moduleId), state);
	}
	world.add(partId, PART, {
		vessel: vesselId,
		index,
		definition: def.id,
		designPos: rp.position,
		yaw: rp.yaw,
		...(rp.tilted ? { rotation: rp.rotation } : {}),
		attachments: [],
		temperature: AMBIENT_TEMPERATURE,
		modules
	} as never);
	restoreState(core, partId, item.state);
	host.attachments.push({ node: rp.parent.parentNode, peer: partId, peerNode: rp.parent.node });
	partOf(core, partId).attachments.push({
		node: rp.parent.node,
		peer: command.host,
		peerNode: rp.parent.parentNode
	});
	vessel.parts = [...vessel.parts, partId].sort((a, b) => a - b);
	vessel.design = cloneData(next);
	mine.state.items.splice(command.index, 1);
	if (vessel.mode === 'flight') refreshColliders(core, vesselId, true);
	core.active.add(vesselId);
	return { ok: true };
}

/** `cargo-detach`: an engineer takes a cargo part off its hull into the suit's inventory. */
export function cargoDetach(
	core: SimCore,
	command: { suit: EntityId; part: EntityId }
): CommandResult {
	const mine = suitInventory(core, command.suit);
	if (typeof mine === 'string') return refuse(mine);
	if (!isEngineer(core, command.suit)) return refuse('only an engineer detaches parts');
	if (!core.world.has(command.part, PART)) return refuse(`no part ${command.part}`);
	const def = defOf(core, command.part);
	if (!def.cargo) return refuse('that part is not cargo: it cannot be carried');
	const part = partOf(core, command.part);
	const vesselId = part.vessel;
	const vessel = vesselOf(core, vesselId);
	if (vessel.root === command.part) return refuse('the root of a vessel cannot be detached');
	if (part.attachments.length !== 1)
		return refuse('something is attached to it: detach that first');
	if (vessel.docks?.length) return refuse('a docked vessel cannot give up cargo yet; undock first');
	const far = withinReach(core, command.suit, command.part);
	if (far) return refuse(far);
	const item: CargoItem = { part: def.id, state: captureState(core, command.part) };
	if (used(core, mine.state.items) + volumeOf(core, item) > mine.capacity + 1e-9)
		return refuse('no room for it (cargo volume)');
	const link = part.attachments[0]!;
	const host = partOf(core, link.peer);
	host.attachments = host.attachments.filter((a) => a.peer !== command.part);
	vessel.parts = vessel.parts.filter((p) => p !== command.part);
	vessel.stages = vessel.stages.map((s) => s.filter((p) => p !== command.part));
	if (vessel.groups)
		vessel.groups = vessel.groups
			.map((g) => ({ ...g, members: g.members.filter((m) => m.part !== command.part) }))
			.filter((g) => g.members.length > 0);
	if (vessel.design) {
		const index = part.index;
		vessel.design = {
			...vessel.design,
			parts: vessel.design.parts.filter((p) => p.index !== index),
			stages: vessel.design.stages.map((s) => s.filter((i) => i !== index))
		};
	}
	core.world.destroyEntity(command.part);
	mine.state.items.push(item);
	if (vessel.mode === 'flight') refreshColliders(core, vesselId, true);
	core.active.add(vesselId);
	return { ok: true };
}

/** `cargo-place`: a suit sets a deployable item on the ground beside it: a vessel of one part. */
export function cargoPlace(
	core: SimCore,
	command: { suit: EntityId; index: number }
): CommandResult {
	const mine = suitInventory(core, command.suit);
	if (typeof mine === 'string') return refuse(mine);
	if (!wearer(core, command.suit)) return refuse(`vessel ${command.suit} carries no crew member`);
	if (!standing(core, command.suit)) return refuse('an item is set down on the ground');
	const item = mine.state.items[command.index];
	if (!item) return refuse(`no item ${command.index}`);
	const def = core.registries.parts.get(item.part);
	if (!def?.cargo?.deployable) return refuse('that part is not a deployable item');
	const id = spawnBeside(
		core,
		command.suit,
		def,
		def.title,
		eastOf(core, command.suit, 1.5 + 1.2 * stationItems(core).length),
		true
	);
	if (typeof id === 'string') return refuse(id);
	restoreState(core, vesselOf(core, id).parts[0]!, item.state);
	mine.state.items.splice(command.index, 1);
	return { ok: true, vessel: id };
}
