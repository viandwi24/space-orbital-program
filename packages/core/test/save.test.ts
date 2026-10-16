/** Plan 043 / ADR 0050: the save envelope - validation, checksum, migration chain. */
import { describe, expect, test } from 'bun:test';
import {
	hashText,
	parseSimSave,
	readSimSave,
	SaveError,
	SIM_SAVE_FORMAT,
	SIM_SAVE_VERSION,
	simSaveChecksum,
	type SaveMigration,
	type SimSave
} from '../src/index.ts';

const unsigned = (): Omit<SimSave, 'checksum'> => ({
	format: SIM_SAVE_FORMAT,
	formatVersion: SIM_SAVE_VERSION,
	apiVersion: '0.1.13',
	mods: [{ id: 'stock', version: '0.1.0' }],
	bodies: ['stock.home'],
	dt: 0.02,
	seed: 1,
	time: 12.5,
	warp: 1,
	warpTarget: null,
	accumulator: 0.005,
	rng: 123,
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

	test('a foreign file is "not an Orbital save", not a crash', () => {
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
		expect(() => readSimSave({})).toThrow('This is not an Orbital save file.');
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

	test('the shipped 2 to 3 step gives every vessel an empty node list and the save no warp target', () => {
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
		expect(save.formatVersion).toBe(3);
		expect(save.warpTarget).toBeNull();
		expect(save.world.components['sim.vessel']!['0']).toEqual({ name: 'v', nodes: [] });
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
