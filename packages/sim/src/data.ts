/**
 * Data items on vessels (plan 083, ADR 0172). Items live in the state of modules that declare
 * `dataStorage` (`{ items, next }`), so they save, resume and stage with their part.
 */
import type {
	CommandResult,
	DataItem,
	DataStorageState,
	EntityId,
	NewDataItem
} from '@orbital/core';
import { moduleDefOf, moduleState, partOf, vesselOf, type SimCore } from './core.ts';

export interface StorageRef {
	part: EntityId;
	module: string;
	capacity: number;
	state: DataStorageState;
}

const usedBits = (state: DataStorageState): number =>
	state.items.reduce((sum, item) => sum + item.bits, 0);

/** The storages of a vessel in part order, then module order. */
export function storagesOf(core: SimCore, vesselId: EntityId): StorageRef[] {
	const out: StorageRef[] = [];
	for (const partId of vesselOf(core, vesselId).parts) {
		for (const m of partOf(core, partId).modules) {
			const storage = moduleDefOf(core, m.id).dataStorage;
			if (!storage) continue;
			const state = moduleState(core, partId, m.id) as DataStorageState;
			out.push({ part: partId, module: m.id, capacity: storage.capacity(m.config), state });
		}
	}
	return out;
}

export function dataUse(
	core: SimCore,
	vesselId: EntityId
): { used: number; capacity: number; items: number } {
	let used = 0;
	let capacity = 0;
	let items = 0;
	for (const s of storagesOf(core, vesselId)) {
		used += usedBits(s.state);
		capacity += s.capacity;
		items += s.state.items.length;
	}
	return { used, capacity, items };
}

const fits = (s: StorageRef, bits: number): boolean => usedBits(s.state) + bits <= s.capacity;

/**
 * Stores `item` on the first storage with room (ADR 0172 point 5) and returns its id; with no
 * room it is dropped (`data:dropped`) and undefined is returned.
 */
export function storeData(
	core: SimCore,
	vesselId: EntityId,
	item: NewDataItem
): string | undefined {
	if (!core.registries.dataKinds.has(item.kind)) {
		throw new Error(`data.store: unknown data kind "${item.kind}"`);
	}
	if (!(Number.isFinite(item.bits) && item.bits > 0)) {
		throw new RangeError(`data.store: bits must be a positive finite number, got ${item.bits}`);
	}
	const target = storagesOf(core, vesselId).find((s) => fits(s, item.bits));
	if (!target) {
		core.events.emit('data:dropped', {
			vessel: vesselId,
			item,
			kind: item.kind,
			bits: item.bits,
			reason: 'full'
		});
		return undefined;
	}
	const id = `${target.part}:${target.state.next++}`;
	target.state.items.push({ ...item, id });
	core.events.emit('data:stored', { vessel: vesselId, part: target.part, item: id });
	return id;
}

function find(
	core: SimCore,
	vesselId: EntityId,
	itemId: string
): { from: StorageRef; index: number } | undefined {
	for (const from of storagesOf(core, vesselId)) {
		const index = from.state.items.findIndex((i) => i.id === itemId);
		if (index >= 0) return { from, index };
	}
	return undefined;
}

/**
 * Puts `item` back, keeping its id, into the first storage of the vessel with room (a cancelled
 * transmission, plan 119); false when none has room.
 */
export function restoreData(core: SimCore, vesselId: EntityId, item: DataItem): boolean {
	const target = storagesOf(core, vesselId).find((s) => fits(s, item.bits));
	if (!target) return false;
	target.state.items.push({ ...item });
	return true;
}

/** `move-data` (ADR 0172 point 6). */
export function moveData(
	core: SimCore,
	vesselId: EntityId,
	itemId: string,
	to: EntityId
): CommandResult {
	const found = find(core, vesselId, itemId);
	if (!found) return { ok: false, reason: `vessel ${vesselId} has no data item "${itemId}"` };
	const target = storagesOf(core, vesselId).find((s) => s.part === to);
	if (!target) return { ok: false, reason: `part ${to} of vessel ${vesselId} has no data storage` };
	if (target.part === found.from.part && target.module === found.from.module) return { ok: true };
	const item: DataItem = found.from.state.items[found.index]!;
	if (!fits(target, item.bits)) {
		return { ok: false, reason: `no room on part ${to}: ${item.bits} bits needed` };
	}
	found.from.state.items.splice(found.index, 1);
	target.state.items.push(item);
	return { ok: true };
}

/** `delete-data` (ADR 0172 point 6). */
export function deleteData(core: SimCore, vesselId: EntityId, itemId: string): CommandResult {
	const found = find(core, vesselId, itemId);
	if (!found) return { ok: false, reason: `vessel ${vesselId} has no data item "${itemId}"` };
	found.from.state.items.splice(found.index, 1);
	return { ok: true };
}
