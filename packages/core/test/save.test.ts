/** Plan 043 / ADR 0050: the save envelope - validation, checksum, migration chain. */
import { describe, expect, test } from 'bun:test';
import {
	hashText,
	LEGACY_WORLD_ID,
	legacyWorldInfo,
	parseSimSave,
	readSimSave,
	SaveError,
	SIM_SAVE_FORMAT,
	SIM_SAVE_VERSION,
	simSaveChecksum,
	type SaveMigration,
	type SimSave
} from '../src/index.ts';
import fixtureV4 from '../../sim/test/fixtures/save-v4.json';

const unsigned = (): Omit<SimSave, 'checksum'> => ({
	format: SIM_SAVE_FORMAT,
	formatVersion: SIM_SAVE_VERSION,
	apiVersion: '0.1.13',
	mods: [{ id: 'stock', version: '0.1.0' }],
	bodies: ['stock.home'],
	home: 'stock.home',
	comms: { seq: 0, routes: [], queue: [], transmissions: [] },
	dt: 0.02,
	seed: 1,
	time: 12.5,
	warp: 1,
	warpTarget: null,
	accumulator: 0.005,
	rng: 123,
	worldInfo: legacyWorldInfo(1, '0.1.0'),
	world: { formatVersion: 1, nextEntity: 0, entities: [], components: {} },
	frames: []
});
const signed = (u = unsigned()): SimSave => ({ ...u, checksum: simSaveChecksum(u) });

const code = (fn: () => unknown): string => {
	try {
		fn();
	} catch (e) {
		if (e instanceof SaveError) return e.code;
		throw e;
	}
	return 'no error';
};

describe('hashText', () => {
	test('is stable and sensitive to every character', () => {
		expect(hashText('orbital')).toBe(hashText('orbital'));
		expect(hashText('orbital')).not.toBe(hashText('orbitaL'));
		expect(hashText('')).toHaveLength(14);
	});
});

describe('readSimSave', () => {
	test('accepts a well-formed save, also after a JSON text round trip', () => {
		const save = signed();
		expect(readSimSave(save)).toEqual(save);
		expect(parseSimSave(JSON.stringify(save))).toEqual(save);
		expect(parseSimSave(JSON.stringify(save, null, 2))).toEqual(save); // layout does not matter
	});

	test('a foreign file is "not a Space Orbital Program save", not a crash', () => {
		for (const raw of [
			null,
			42,
			'text',
			[],
			{},
			{ format: 'something-else' },
			{ name: 'Two-stage', parts: [] }
		]) {
			expect(code(() => readSimSave(raw))).toBe('not-a-save');
		}
		expect(() => readSimSave({})).toThrow('This is not a Space Orbital Program save file.');
	});

	test('text that is not JSON is rejected with its own message', () => {
		expect(code(() => parseSimSave('{"format": "orbital-sim-sa'))).toBe('not-json');
		expect(code(() => parseSimSave(''))).toBe('not-json');
		expect(() => parseSimSave('nope')).toThrow(/not valid JSON/);
	});

	test('a missing or invalid format version is refused', () => {
		const { formatVersion: _v, ...rest } = signed();
		expect(code(() => readSimSave(rest))).toBe('not-a-save');
		expect(code(() => readSimSave({ ...signed(), formatVersion: 0 }))).toBe('not-a-save');
		expect(code(() => readSimSave({ ...signed(), formatVersion: 1.5 }))).toBe('not-a-save');
	});

	test('a save from a newer game says to update', () => {
		const newer = { ...signed(), formatVersion: SIM_SAVE_VERSION + 1 };
		expect(code(() => readSimSave(newer))).toBe('too-new');
		expect(() => readSimSave(newer)).toThrow(/newer version of Orbital.*Update the game/);
	});

	test('an edited or cut-off save fails its checksum', () => {
		const edited = { ...signed(), time: 99 };
		expect(code(() => readSimSave(edited))).toBe('damaged');
		expect(() => readSimSave(edited)).toThrow(/checksum/);
		const { checksum: _c, ...noSum } = signed();
		expect(code(() => readSimSave(noSum))).toBe('damaged');
		const text = JSON.stringify(signed());
		expect(code(() => parseSimSave(text.slice(0, text.length - 30)))).toBe('not-json');
	});

	test('a well-signed save with a broken shape is damaged, with the first problems named', () => {
		for (const patch of [
			{ dt: -1 },
			{ time: -5 },
			{ warp: 0.5 },
			{ rng: 2 ** 40 },
			{ world: { formatVersion: 1, nextEntity: 'x' } },
			{ frames: [{ id: 0, inUse: true }] },
			{ mods: [{ id: '' }] }
		]) {
			const u = { ...unsigned(), ...patch } as Omit<SimSave, 'checksum'>;
			const save = { ...u, checksum: simSaveChecksum(u) };
			expect(code(() => readSimSave(save))).toBe('damaged');
		}
		const nonFinite = { ...unsigned(), time: Number.NaN };
		expect(code(() => readSimSave({ ...nonFinite, checksum: simSaveChecksum(nonFinite) }))).toBe(
			'damaged'
		);
	});
});

describe('migration chain', () => {
	/** A format-1 save, as an older game wrote it, upgraded by a pretend format 2 (and 3). */
	const toTwo: SaveMigration = (data) => ({ ...data, formatVersion: 2, renamed: data.time });
	const toThree: SaveMigration = (data) => {
		const { renamed, ...rest } = data;
		return { ...rest, formatVersion: 3, time: renamed };
	};

	test('a save of an older version is upgraded step by step before it is validated', () => {
		const old = signed({ ...unsigned(), formatVersion: 1 }); // checksum over its own bytes
		const upgraded = readSimSave(old, { 1: toTwo, 2: toThree }, 3);
		expect(upgraded.formatVersion).toBe(3);
		expect(upgraded.bodies).toEqual(['stock.home']);
		expect(upgraded.time).toBe(12.5);
		// Signed again, so the upgraded save passes a second read.
		expect(readSimSave(upgraded, {}, 3)).toEqual(upgraded);
	});

	test('the checksum is verified against the version the file was written in', () => {
		const tampered = { ...signed({ ...unsigned(), formatVersion: 1 }), time: 1 };
		expect(code(() => readSimSave(tampered, { 1: toTwo }, 2))).toBe('damaged');
	});

	test('a missing step is "incompatible", not a crash', () => {
		expect(code(() => readSimSave(signed({ ...unsigned(), formatVersion: 1 }), {}, 2))).toBe(
			'incompatible'
		);
	});

	test('the shipped 2 to 3 and 3 to 4 steps give every vessel an empty node list and no target, and the save no warp target', () => {
		const v2 = {
			...unsigned(),
			formatVersion: 2,
			warpTarget: undefined,
			world: {
				formatVersion: 1 as const,
				nextEntity: 1,
				entities: [0],
				components: { 'sim.vessel': { '0': { name: 'v' } }, other: { '0': 1 } }
			}
		};
		const save = readSimSave({ ...v2, checksum: simSaveChecksum(v2 as never) });
		expect(save.formatVersion).toBe(SIM_SAVE_VERSION);
		expect(save.warpTarget).toBeNull();
		expect(save.world.components['sim.vessel']!['0']).toEqual({
			name: 'v',
			nodes: [],
			target: null
		});
		expect(save.world.components['other']).toEqual({ '0': 1 });
	});

	test('the shipped 1 to 2 step makes the root body a list and centres every frame on it', () => {
		const { bodies: _b, ...rest } = unsigned();
		const v1 = {
			...rest,
			formatVersion: 1,
			body: 'stock.home',
			frames: [
				{
					id: 0,
					inUse: false,
					origin: { x: 0, y: 0, z: 0 },
					velocity: { x: 0, y: 0, z: 0 },
					vessels: [],
					bodies: []
				}
			]
		};
		const save = readSimSave({ ...v1, checksum: simSaveChecksum(v1 as never) });
		expect(save.formatVersion).toBe(SIM_SAVE_VERSION);
		expect(save.bodies).toEqual(['stock.home']);
		expect(save.frames[0]!.soi).toBe('stock.home');
		expect('body' in save).toBe(false);
	});
});

describe('format 5: the world info (plan 077, ADR 0110)', () => {
	test('the frozen format-4 fixture migrates to the Legacy world: patched, fictional day 0, no rules', () => {
		expect(fixtureV4.formatVersion).toBe(4);
		const save = readSimSave(fixtureV4);
		expect(save.formatVersion).toBe(SIM_SAVE_VERSION);
		expect(save.home).toBe('stock.home');
		expect(save.worldInfo).toEqual({
			id: LEGACY_WORLD_ID,
			seed: fixtureV4.seed,
			systemId: 'stock',
			systemVersion: fixtureV4.mods.find((m) => m.id === 'stock')!.version,
			variant: 'default',
			gravityModel: 'patched',
			epoch: { day: 0, fraction: 0 },
			rules: {},
			sites: [],
			preset: 'stock.sandbox',
			changelog: []
		});
		// Re-signed: the migrated save reads again unchanged.
		expect(readSimSave(save)).toEqual(save);
	});

	test('an n-body world reads since plan 125 (ADR 0122 point 8)', () => {
		const u = unsigned();
		const nBody = { ...u, worldInfo: { ...u.worldInfo, gravityModel: 'n-body' } };
		const save = { ...nBody, checksum: simSaveChecksum(nBody as never) };
		expect(readSimSave(save).worldInfo.gravityModel).toBe('n-body');
	});

	test('a damaged world info is "damaged"', () => {
		for (const worldInfo of [
			undefined,
			{ ...legacyWorldInfo(1), id: '' },
			{ ...legacyWorldInfo(1), epoch: { day: 0.5, fraction: 0 } },
			{ ...legacyWorldInfo(1), epoch: { day: 0, fraction: 1 } },
			{ ...legacyWorldInfo(1), rules: { a: null } },
			{ ...legacyWorldInfo(1), sites: [{ name: 'no id' }] }
		]) {
			const u = { ...unsigned(), worldInfo } as never;
			expect(code(() => readSimSave({ ...(u as object), checksum: simSaveChecksum(u) }))).toBe(
				'damaged'
			);
		}
	});
});

describe('the debug state in the world info (plan 203, ADR 0213)', () => {
	test('a format-8 save without it reads as never used', () => {
		const save = readSimSave(signed());
		expect(save.worldInfo.debug).toBeUndefined();
	});

	test('a save with it round-trips', () => {
		const u = unsigned();
		u.worldInfo = {
			...u.worldInfo,
			debug: { mode: true, usedCheats: true, cheats: ['infinite-fuel'] }
		};
		const save = signed(u);
		expect(readSimSave(JSON.parse(JSON.stringify(save))).worldInfo.debug).toEqual({
			mode: true,
			usedCheats: true,
			cheats: ['infinite-fuel']
		});
	});
});

describe('format 9: cold gas (plan 208, ADR 0203 point 2)', () => {
	test('an old save with stock.eva-propellant loads as stock.cold-gas with the same amount', () => {
		const container = { amounts: { 'stock.eva-propellant': 3.25, 'stock.oxygen': 1 } };
		const v8 = signed({
			...unsigned(),
			formatVersion: 8,
			world: {
				formatVersion: 1,
				nextEntity: 1,
				entities: [0],
				components: { 'module:stock.resource-container': { '0': container } }
			}
		} as Omit<SimSave, 'checksum'>);
		const read = readSimSave(v8);
		expect(read.formatVersion).toBe(9);
		const comps = read.world.components as Record<string, Record<string, unknown>>;
		expect(comps['module:stock.resource-container']!['0']).toEqual({
			amounts: { 'stock.cold-gas': 3.25, 'stock.oxygen': 1 }
		});
		expect(JSON.stringify(read)).not.toContain('stock.eva-propellant');
	});
});
