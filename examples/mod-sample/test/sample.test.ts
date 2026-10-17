import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	importModBundle,
	installModSdk,
	loadPlugins,
	parseModPackage,
	partId,
	resolveMods,
	type ModPackage,
	type VesselDesign
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import * as sdk from '@orbital/sdk';
import { createSim } from '@orbital/sim';
import { buildMod } from '../../../tools/mod-build/build-mod.ts';
import { orbitState } from '../../../packages/sim/test/helpers/measure.ts';
import { rapier } from '../../../packages/sim/test/helpers/vessels.ts';

const folder = join(import.meta.dir, '..');
let pkg: ModPackage;

beforeAll(async () => {
	// The documented build command, run in-process; then the package is read back as the game reads a file.
	const built = await buildMod(folder);
	const parsed = await parseModPackage(built.text);
	if (!parsed.ok) throw new Error(parsed.errors.join('; '));
	pkg = parsed.package;
	installModSdk(sdk);
});

const resolve = () =>
	resolveMods([{ manifest: pkg.manifest, code: pkg.code, assets: pkg.assets }], {
		builtin: [Stock],
		importModule: importModBundle
	});

const design: VesselDesign = {
	formatVersion: 1,
	name: 'Beacon probe',
	parts: [
		{ index: 0, part: partId('stock.command-pod'), parent: null },
		{
			index: 1,
			part: partId('sample.beacon'),
			parent: { index: 0, parentNode: 'bottom', node: 'top' }
		},
		{
			index: 2,
			part: partId('sample.wide-tank'),
			parent: { index: 1, parentNode: 'bottom', node: 'top' }
		}
	],
	stages: []
};

async function flying(resume?: unknown) {
	const { plugins } = await resolve();
	const sim = await createSim({
		plugins: [Stock, ...plugins],
		backendFactory: rapier(4),
		maxFlightFrames: 1,
		...(resume === undefined ? {} : { resume })
	});
	return sim;
}

describe('the sample external mod, built and loaded the way the game does', () => {
	test('the package carries a manifest that matches the plugin and loads cleanly', async () => {
		expect(pkg.manifest).toMatchObject({ id: 'sample', version: '1.0.0', api: '^0.1' });
		const r = await resolve();
		expect(r.rejected).toEqual([]);
		expect(r.plugins.map((p) => p.meta.id)).toEqual(['sample']);
	});

	test('its parts and module are registered and the parts have their own look', async () => {
		const sim = await flying();
		expect(sim.report.order).toEqual(['stock', 'sample']);
		const beacon = sim.registries.parts.get('sample.beacon')!;
		expect(beacon.visual?.palette?.primary).toBe('#2f6f73');
		expect(sim.registries.modules.get('sample.beacon')).toBeDefined();
		expect(sim.registries.parts.get('sample.wide-tank')!.modules?.[0]?.[0]).toBe(
			'stock.resource-container'
		);
	});

	test('its dock panel is registered from the bundle (plan 112, ADR 0149)', async () => {
		const sim = await flying();
		const panel = sim.registries.panels.get('sample.beacon')!;
		expect(panel.title).toBe('Beacon');
		expect(panel.contexts).toEqual(['flight', 'map']);
		expect(typeof panel.canvas?.draw).toBe('function');
	});

	test('the package ships the model the engine part names, hashed inside the fingerprint', async () => {
		expect(Object.keys(pkg.assets ?? {})).toEqual(['models/spike-engine.glb']);
		expect(pkg.formatVersion).toBe(2);
		const r = await resolve();
		expect(r.partAssets).toEqual([
			{ part: 'sample.spike-engine', mod: 'sample', path: 'models/spike-engine.glb' }
		]);
		const sim = await flying();
		const engine = sim.registries.parts.get('sample.spike-engine')!;
		expect(engine.visual?.asset).toBe('models/spike-engine.glb');
		expect(engine.visual?.kind).toBe('engine'); // the fallback generator if the model cannot load
		expect(sim.registries.parts.get('sample.spike-engine')!.modules?.[0]?.[0]).toBe('stock.engine');
	});

	test('flown: the beacon counts on rails, answers a ping, and the state survives a save', async () => {
		const sim = await flying();
		const r = sim.dispatch({
			type: 'load-vessel',
			design,
			placement: { kind: 'state', ...orbitState(sim, 100_000) }
		});
		if (!r.ok) throw new Error(r.reason);
		const vessel = sim.snapshot().vessels[0]!;
		const part = vessel.parts.find((p) => p.definition === 'sample.beacon')!;
		const ping = sim.dispatch({
			type: 'action',
			vessel: r.vessel!,
			part: part.id,
			module: 'sample.beacon',
			action: 'ping'
		});
		expect(ping.ok).toBe(true);
		for (let i = 0; i < 250; i++) sim.step(0.02); // 5 s in flight, then the idle vessel goes on rails
		expect(sim.snapshot().vessels[0]!.mode).toBe('on-rails');
		expect(sim.dispatch({ type: 'warp', factor: 1_000 }).ok).toBe(true);
		sim.step(0.1); // about 100 s of orbit in 10 s chunks
		const state = () =>
			sim.snapshot().vessels[0]!.parts.find((p) => p.definition === 'sample.beacon')!.modules[
				'sample.beacon'
			];
		const before = state() as { beats: number; pings: number };
		expect(before.pings).toBe(1);
		expect(before.beats).toBeGreaterThanOrEqual(20);

		// The state lives in the world: a resumed sim (same mod loaded) continues from it.
		const again = await flying(JSON.parse(JSON.stringify(sim.save())));
		const resumed = again
			.snapshot()
			.vessels[0]!.parts.find((p) => p.definition === 'sample.beacon')!;
		expect(resumed.modules['sample.beacon']).toEqual(before);
		expect(again.save().mods.map((m) => m.id)).toEqual(['stock', 'sample']);
	});

	test('a save that needs the mod is refused when the mod is not loaded, naming it', async () => {
		const sim = await flying();
		sim.dispatch({
			type: 'load-vessel',
			design,
			placement: { kind: 'state', ...orbitState(sim, 100_000) }
		});
		const saved = JSON.parse(JSON.stringify(sim.save()));
		await expect(
			createSim({ plugins: [Stock], backendFactory: rapier(4), maxFlightFrames: 1, resume: saved })
		).rejects.toThrow(/sample/);
	});

	test('the sample script is valid and pings the beacon through the ship API', async () => {
		const source = readFileSync(join(folder, 'scripts/beacon.js'), 'utf8');
		const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
			...args: string[]
		) => (...values: unknown[]) => Promise<void>;
		const calls: unknown[][] = [];
		const lines: string[] = [];
		const ship = {
			t: 0,
			parts: [{ id: 7, modules: { 'sample.beacon': { beats: 0, pings: 0 } } }]
		};
		const run = new AsyncFunction('ship', 'action', 'wait', 'print', source);
		await run(
			ship,
			(...a: unknown[]) => (calls.push(a), Promise.resolve({ ok: true })),
			async (s: number) => void (ship.t += s),
			(line: string) => lines.push(line)
		);
		expect(calls).toHaveLength(6);
		expect(calls[0]).toEqual([7, 'sample.beacon', 'ping']);
		expect(lines).toHaveLength(6);
	});
});

describe('the sample patch (plan 079)', () => {
	test('the built package raises stock.engine-lv thrust and the report names the sample', async () => {
		const { plugins } = await resolve();
		const { registries, report } = loadPlugins([Stock, ...plugins]);
		const engine = registries.parts.get('stock.engine-lv')!;
		const config = engine.modules!.find(([id]) => id === 'stock.engine')![1] as { thrust: number };
		expect(config.thrust).toBe(230_000);
		expect(report.patches).toEqual([
			{
				id: 'sample.engine-lv-thrust',
				by: 'sample',
				target: 'part',
				applied: ['stock.engine-lv'],
				changes: [
					{
						entry: 'stock.engine-lv',
						path: 'modules.stock.engine.thrust',
						from: 215_000,
						to: 230_000
					}
				]
			}
		]);
		expect(report.provenance.part['stock.engine-lv']).toEqual({
			'modules.stock.engine.thrust': ['stock', 'sample']
		});
	});
});
