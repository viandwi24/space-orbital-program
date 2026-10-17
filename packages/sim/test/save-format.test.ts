/** Plan 043 / ADR 0050: reading saves at the sim boundary - the v1 fixture, damage, missing content. */
import { describe, expect, test } from 'bun:test';
import {
	LEGACY_WORLD_ID,
	legacyWorldInfo,
	parseSimSave,
	SaveError,
	SIM_SAVE_VERSION,
	simSaveChecksum,
	type SimSave,
	type WorldInfo
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import fixture from './fixtures/save-v1.json';
import fixtureV2 from './fixtures/save-v2.json';
import fixtureV3 from './fixtures/save-v3.json';
import fixtureV4 from './fixtures/save-v4.json';
import { rapier } from './helpers/vessels.ts';

const resume = (save: unknown, extra: { dt?: number; body?: string; world?: WorldInfo } = {}) =>
	createSim({ plugins: [Stock], backendFactory: rapier(16), resume: save, ...extra });

/** The fixture changed by `edit`, signed again so only the edit is wrong. */
const edited = (edit: (save: Omit<SimSave, 'checksum'>) => void): SimSave => {
	const { checksum: _c, ...rest } = structuredClone(fixture) as unknown as SimSave;
	edit(rest);
	return { ...rest, checksum: simSaveChecksum(rest) };
};

const reason = async (promise: Promise<unknown>): Promise<{ code: string; message: string }> => {
	try {
		await promise;
	} catch (e) {
		if (e instanceof SaveError) return { code: e.code, message: e.message };
		throw e;
	}
	throw new Error('expected a SaveError');
};

describe('the frozen format-1 fixture', () => {
	test('is migrated to the current format (plan 044) and resumes', async () => {
		const parsed = parseSimSave(JSON.stringify(fixture));
		expect(fixture.formatVersion).toBe(1);
		expect(parsed.formatVersion).toBe(SIM_SAVE_VERSION);
		expect(parsed.bodies).toEqual(['stock.home']);
		expect(parsed.frames.every((f) => f.soi === 'stock.home')).toBe(true);
		const sim = await resume(fixture);
		const vessels = sim.snapshot().vessels;
		expect(vessels.map((v) => v.mode).sort()).toEqual(['flight', 'on-rails']);
		expect(sim.time).toBeCloseTo(1, 9);
		for (let i = 0; i < 250; i++) sim.step(0.02);
		expect(sim.time).toBeCloseTo(6, 6);
		expect(sim.snapshot().vessels).toHaveLength(2);
	});

	test('continues exactly where its writer would have: a sim saved from it saves the migrated data', async () => {
		const sim = await resume(fixture);
		const migrated = parseSimSave(JSON.stringify(fixture));
		const { checksum: _a, apiVersion: _b, bodies: oldBodies, ...expected } = migrated;
		const { checksum: _c, apiVersion: _d, bodies, worldTick, economy, ...actual } = sim.save();
		// The world tick (plan 082) is new state: the fixture's day, no world-tick systems in stock.
		expect(worldTick).toEqual({ lastDay: 0, streams: {} });
		// No ledger in the old save: a fresh one (Sandbox world, starting funds from the rule, plan 095).
		expect(economy).toEqual({
			balances: { funds: 100_000, science: 0, reputation: 0 },
			entries: []
		});
		// The Legacy world had no rule values; the sim resolves the stock rules from its preset (078).
		expect(expected.worldInfo.rules).toEqual({});
		expect(actual.worldInfo.rules['stock.economy']).toBe(false);
		expect(actual).toEqual({
			...expected,
			worldInfo: { ...expected.worldInfo, rules: actual.worldInfo.rules }
		});
		// The old save listed the home planet only; the sim that continues it knows the moon too.
		expect(oldBodies).toEqual(['stock.home']);
		expect(bodies).toEqual(['stock.home', 'stock.cinder']);
	});
});

describe('a save the sim refuses', () => {
	test('a foreign JSON document', async () => {
		const r = await reason(resume({ formatVersion: 1, parts: [] }));
		expect(r.code).toBe('not-a-save');
		expect(r.message).toBe('This is not an Orbital save file.');
	});

	test('edited contents (checksum)', async () => {
		const r = await reason(resume({ ...fixture, time: 5 }));
		expect(r.code).toBe('damaged');
		expect(r.message).toMatch(/checksum/);
	});

	test('a newer format', async () => {
		const r = await reason(resume({ ...fixture, formatVersion: 99 }));
		expect(r.code).toBe('too-new');
	});

	test('a mod that is not loaded', async () => {
		const r = await reason(
			resume(edited((s) => s.mods.push({ id: 'ghost.mod', version: '2.0.0' })))
		);
		expect(r.code).toBe('missing-mod');
		expect(r.message).toContain('ghost.mod 2.0.0');
	});

	test('a part from content that is gone, named in the message', async () => {
		const r = await reason(
			resume(
				edited((s) => {
					const parts = s.world.components['sim.part'] as Record<string, { definition: string }>;
					Object.values(parts)[0]!.definition = 'gone.part';
				})
			)
		);
		expect(r.code).toBe('missing-mod');
		expect(r.message).toContain('part "gone.part"');
	});

	test('a vessel whose mode and rails disagree', async () => {
		const r = await reason(
			resume(
				edited((s) => {
					const vessels = s.world.components['sim.vessel'] as Record<string, { rails: unknown }>;
					const first = Object.values(vessels).find((v) => v.rails !== null)!;
					first.rails = null;
				})
			)
		);
		expect(r.code).toBe('damaged');
		expect(r.message).toMatch(/inconsistent rails/);
	});

	test('a vessel component of the wrong shape', async () => {
		const r = await reason(
			resume(
				edited((s) => {
					const vessels = s.world.components['sim.vessel'] as Record<
						string,
						Record<string, unknown>
					>;
					delete Object.values(vessels)[0]!.sas;
				})
			)
		);
		expect(r.code).toBe('damaged');
		expect(r.message).toMatch(/sas/);
	});

	test('a flight vessel without a body in any frame', async () => {
		const r = await reason(
			resume(
				edited((s) => {
					for (const frame of s.frames) frame.bodies = [];
				})
			)
		);
		expect(r.code).toBe('damaged');
	});

	test('a body listed in a frame for a vessel that is not in flight', async () => {
		const r = await reason(
			resume(
				edited((s) => {
					const frame = s.frames.find((f) => f.bodies.length > 0)!;
					frame.bodies[0]!.vessel = 0; // a part entity, not a vessel
				})
			)
		);
		expect(r.code).toBe('damaged');
	});

	test('a different fixed step', async () => {
		const r = await reason(resume(fixture, { dt: 0.01 }));
		expect(r.code).toBe('incompatible');
		expect(r.message).toMatch(/0\.02 s step/);
	});

	test('a different body', async () => {
		// Not registered: createSim's own error, before any save content is touched.
		await expect(resume(fixture, { body: 'stock.nowhere' })).rejects.toThrow(/not registered/);
	});

	test('more physics frames than the sim has', async () => {
		const save = edited((s) => {
			s.frames.push({
				...structuredClone(s.frames[0]!),
				id: 5,
				inUse: false,
				vessels: [],
				bodies: []
			});
			s.frames.push({
				...structuredClone(s.frames[0]!),
				id: 6,
				inUse: false,
				vessels: [],
				bodies: []
			});
		});
		const r = await reason(resume(save));
		expect(r.code).toBe('incompatible');
	});
});

describe('the frozen format-2 fixture (plan 045)', () => {
	test('is migrated to the current format with empty node lists and no warp target, and resumes', async () => {
		expect(fixtureV2.formatVersion).toBe(2);
		const parsed = parseSimSave(JSON.stringify(fixtureV2));
		expect(parsed.formatVersion).toBe(SIM_SAVE_VERSION);
		expect(parsed.warpTarget).toBeNull();
		const vessels = Object.values(parsed.world.components['sim.vessel']!) as Array<{
			nodes: unknown[];
		}>;
		expect(vessels).toHaveLength(2);
		expect(vessels.every((v) => Array.isArray(v.nodes) && v.nodes.length === 0)).toBe(true);
		const sim = await resume(fixtureV2);
		expect(sim.snapshot().vessels.every((v) => v.nodes!.length === 0)).toBe(true);
		for (let i = 0; i < 100; i++) sim.step(0.02);
		expect(sim.snapshot().vessels).toHaveLength(2);
		sim.dispose();
	});
});

describe('the frozen format-3 fixture (plan 045)', () => {
	test('reads as written, keeps its two nodes with their targets, resumes and saves the same nodes', async () => {
		expect(fixtureV3.formatVersion).toBe(3);
		const parsed = parseSimSave(JSON.stringify(fixtureV3));
		expect(parsed.formatVersion).toBe(SIM_SAVE_VERSION);
		const sim = await resume(fixtureV3);
		const orbiting = sim.snapshot().vessels.find((v) => v.mode === 'on-rails')!;
		expect(orbiting.nodes!.map((n) => [n.id, n.time])).toEqual([
			[1, 3_000],
			[2, 5_000]
		]);
		expect(orbiting.nodes![0]!.prograde).toBeCloseTo(120, 6);
		expect(orbiting.nodes![1]!.normal).toBeCloseTo(35, 6);
		const saved = sim.save();
		const vessels = Object.values(saved.world.components['sim.vessel']!) as Array<{
			nodes: Array<{ target: unknown }>;
		}>;
		expect(vessels.flatMap((v) => v.nodes).every((n) => n.target !== null)).toBe(true);
		sim.dispose();
	});
});

describe('the frozen format-4 fixture (plan 035)', () => {
	test('reads as written, keeps the target of its probe and resumes with it', async () => {
		expect(fixtureV4.formatVersion).toBe(4);
		const parsed = parseSimSave(JSON.stringify(fixtureV4));
		expect(parsed.formatVersion).toBe(5);
		expect(parsed.worldInfo.id).toBe(LEGACY_WORLD_ID);
		const sim = await resume(fixtureV4);
		const aimed = sim.snapshot().vessels.filter((v) => v.target !== undefined);
		expect(aimed).toHaveLength(2);
		const onVessel = aimed.find((v) => v.target!.kind === 'vessel')!;
		const onBody = aimed.find((v) => v.target!.kind === 'body')!;
		expect(String(onBody.target!.id)).toBe('stock.cinder');
		expect(onVessel.target!.distance).toBeGreaterThan(0);
		expect(onVessel.target!.approach).not.toBeNull();
		const before = onVessel.target!.distance;
		for (let i = 0; i < 50; i++) sim.step(0.02);
		const saved = sim.save();
		const vessels = Object.values(saved.world.components['sim.vessel']!) as Array<{
			target: { kind: string } | null;
		}>;
		expect(
			vessels
				.filter((v) => v.target !== null)
				.map((v) => v.target!.kind)
				.sort()
		).toEqual(['body', 'vessel']);
		expect(sim.snapshot().vessels.find((v) => v.id === onVessel.id)!.target!.distance).not.toBe(
			before
		);
		sim.dispose();
	});

	test('a format-3 fixture migrates to vessels without a target', async () => {
		const sim = await resume(fixtureV3);
		expect(sim.snapshot().vessels.every((v) => v.target === undefined)).toBe(true);
		sim.dispose();
	});
});

describe('the world of a run (plan 077, ADR 0110)', () => {
	const world: WorldInfo = {
		...legacyWorldInfo(7),
		id: '3f1c2a9e-6b1d-4c55-9a8e-2f0d6c1b7a10',
		epoch: { day: 9_000, fraction: 0.25 },
		rules: { 'stock.economy': false }
	};

	test('a new sim without a world runs in the Legacy world with its seed', async () => {
		const sim = await createSim({ plugins: [Stock], backendFactory: rapier(16), seed: 3 });
		expect(sim.worldInfo.id).toBe(LEGACY_WORLD_ID);
		expect(sim.worldInfo.seed).toBe(3);
		expect(sim.worldInfo.systemVersion).toBe(Stock.meta.version);
		expect(sim.save().worldInfo).toEqual({ ...sim.worldInfo });
		expect(Object.isFrozen(sim.worldInfo.epoch)).toBe(true);
		sim.dispose();
	});

	test('createSim({ world }) is saved, and resumes with the same world', async () => {
		const sim = await createSim({ plugins: [Stock], backendFactory: rapier(16), world });
		const save = sim.save();
		expect(save.formatVersion).toBe(SIM_SAVE_VERSION);
		// The world's own value is kept; every other stock rule comes from its preset (Sandbox).
		expect(save.worldInfo).toEqual({ ...world, rules: save.worldInfo.rules });
		expect(save.worldInfo.rules['stock.economy']).toBe(false);
		expect(save.worldInfo.rules['stock.tech-tree']).toBe(false);
		sim.dispose();
		const again = await resume(JSON.parse(JSON.stringify(save)));
		expect(again.worldInfo).toEqual(save.worldInfo);
		expect(JSON.stringify(again.save())).toBe(JSON.stringify(save));
		again.dispose();
		const same = await resume(save, { world });
		same.dispose();
	});

	test('a resume into another world, or an invalid world, is refused', async () => {
		const sim = await createSim({ plugins: [Stock], backendFactory: rapier(16), world });
		const save = sim.save();
		sim.dispose();
		const r = await reason(resume(save, { world: legacyWorldInfo(0) }));
		expect(r.code).toBe('incompatible');
		await expect(
			createSim({
				plugins: [Stock],
				backendFactory: rapier(16),
				world: { ...world, gravityModel: 'n-body' as never }
			})
		).rejects.toThrow(/n-body worlds are not available yet/);
	});
});
