/**
 * The world side of Debug mode (plan 203, ADR 0212): which worlds need it, and the "used cheats"
 * mark on the world record, which the Worlds cards and the achievements read.
 */
import type { DebugAccess } from '@orbital/core';
import type { WorldRecord } from '../save/world-record';

/** The rule the access comes from (ADR 0212 point 1). */
export const DEBUG_RULE = 'stock.debug-tools';

/**
 * The world's debug access from its record: the rule as created, else the preset's default (a
 * world made before the rule existed). The Legacy world is a Sandbox world.
 */
export function accessOfRecord(record: Pick<WorldRecord, 'preset' | 'world'> | undefined): DebugAccess {
	const value = record?.world?.rules[DEBUG_RULE];
	if (value === 'always' || value === 'opt-in' || value === 'locked') return value;
	const preset = record?.preset ?? 'sandbox';
	if (/sandbox$/.test(preset)) return 'always';
	if (/hardcore$/.test(preset)) return 'locked';
	return 'opt-in';
}

/**
 * Debug mode was turned on in Settings: the active world is marked when it is one that needs the
 * mode (`opt-in`). Its sim takes the mode at the next flight.
 */
export async function markActiveWorldForDebug(): Promise<void> {
	const [{ openSaveStore }, { activeWorldId, browserWorldsEnv, createWorlds }] = await Promise.all([
		import('../save/open-store'),
		import('../worlds/worlds')
	]);
	const { store, worlds } = await openSaveStore();
	const service = createWorlds(worlds, store, browserWorldsEnv());
	const id = activeWorldId();
	if (accessOfRecord(await service.get(id)) === 'opt-in') await service.markUsedCheats(id);
}
