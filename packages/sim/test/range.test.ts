/** Range safety in the sim (plan 127, ADR 0155): the drop judged at staging, penalties, the azimuth. */
import { describe, expect, test } from 'bun:test';
import {
	LEGACY_SITE,
	bodyOrientation,
	createBodyTerrainField,
	legacyWorldInfo,
	type Quat,
	type Site,
	type Vec3,
	type WorldInfo
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { createAscent, defaultAscent } from './helpers/ascent.ts';
import { rapier, twoStage } from './helpers/vessels.ts';
import { pilotFor } from './helpers/crew.ts';

const R = 600_000;
const DEG = Math.PI / 180;
const OTHER: Site = {
	...LEGACY_SITE,
	id: 'w.downrange',
	name: 'Downrange base',
	kind: 'base',
	latitude: 2 * DEG,
	longitude: 1.2,
	pads: [{ east: 0, north: 0 }]
};

const world = (mode: 'cost' | 'hard' | 'off'): WorldInfo => ({
	...legacyWorldInfo(1),
	id: '7d0b3f2e-127a-4c55-9e10-3a8f6c2d1b77',
	preset: 'stock.career',
	sites: [LEGACY_SITE, OTHER],
	rules: { 'stock.range-safety': mode }
});

const make = (mode: 'cost' | 'hard' | 'off', resume?: unknown) =>
	createSim({
		plugins: [Stock],
		backendFactory: rapier(16),
		terrain: createBodyTerrainField,
		...(resume ? { resume } : { world: world(mode) })
	} as never);

function rotate(q: Quat, v: Vec3): Vec3 {
	const u = { x: q.x, y: q.y, z: q.z };
	const c1 = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
	const t = { x: 2 * c1.x, y: 2 * c1.y, z: 2 * c1.z };
	const c2 = { x: u.y * t.z - u.z * t.y, y: u.z * t.x - u.x * t.z, z: u.x * t.y - u.y * t.x };
	return { x: v.x + q.w * t.x + c2.x, y: v.y + q.w * t.y + c2.y, z: v.z + q.w * t.z + c2.z };
}

/** The two-stage vessel 6 km above the other site, moving with the ground: it falls onto it. */
function overTheOtherSite(sim: Sim): number {
	const home = sim.registries.bodies.get('stock.home')!;
	const q = bodyOrientation(home, 0);
	const n = {
		x: Math.cos(OTHER.latitude) * Math.cos(OTHER.longitude),
		y: Math.sin(OTHER.latitude),
		z: -Math.cos(OTHER.latitude) * Math.sin(OTHER.longitude)
	};
	const up = rotate(q, n);
	const position = { x: up.x * (R + 6_000), y: up.y * (R + 6_000), z: up.z * (R + 6_000) };
	const omega = (2 * Math.PI) / home.rotationPeriod!;
	// moving with the ground: ω × r about the spin axis (y)
	const velocity = { x: omega * position.z, y: 0, z: -omega * position.x };
	const r = sim.dispatch({
		type: 'load-vessel',
		design: twoStage(),
		placement: { kind: 'state', body: 'stock.home', position, velocity },
		...pilotFor(sim)
	} as never);
	if (!r.ok) throw new Error(r.reason);
	return Number(r.vessel);
}

/** Fire stages until one is refused or none is left; the refusal, if any. */
function stageAll(sim: Sim, id: number): string | undefined {
	for (let i = 0; i < 4; i++) {
		const r = sim.dispatch({ type: 'stage', vessel: id } as never);
		if (!r.ok) return r.reason.includes('no stage left') ? undefined : r.reason;
		sim.step(0.02);
	}
	return undefined;
}

const penalties = (sim: Sim) =>
	sim.save().economy!.entries.filter((e) => e.cause === 'range-safety');

describe('range safety at staging (ADR 0155 point 3)', () => {
	test('hard: the stage that would drop onto another site is refused with the reason', async () => {
		const sim = await make('hard');
		const id = overTheOtherSite(sim);
		// the first stage lights the engine and drops nothing; the next one would drop the lower stage
		expect(sim.snapshot().range?.warnings).toEqual([]);
		expect(sim.dispatch({ type: 'stage', vessel: id } as never).ok).toBe(true);
		sim.step(0.02);
		expect(sim.snapshot().range?.warnings[0]).toMatchObject({ kind: 'site', site: 'w.downrange' });
		expect(stageAll(sim, id)).toBe(
			'the spent stage would fall on site "w.downrange"; stage over the sea or change the ascent'
		);
		expect(penalties(sim)).toEqual([]);
		sim.dispose();
	});

	test('cost: it proceeds and books the penalty once', async () => {
		const sim = await make('cost');
		const events: string[] = [];
		sim.events.on('range:violation', (e) => events.push(`${e.kind}:${e.site}:${e.penalised}`));
		const id = overTheOtherSite(sim);
		expect(stageAll(sim, id)).toBeUndefined();
		for (let i = 0; i < 200; i++) sim.step(0.02);
		expect(events).toEqual(['site:w.downrange:true']);
		expect(penalties(sim).map((e) => [e.currency, e.amount])).toEqual([
			['funds', -10_000],
			['reputation', -10]
		]);
		sim.dispose();
	});

	test('off: nothing is judged', async () => {
		const sim = await make('off');
		const id = overTheOtherSite(sim);
		expect(sim.snapshot().range).toBeUndefined();
		expect(stageAll(sim, id)).toBeUndefined();
		expect(penalties(sim)).toEqual([]);
		sim.dispose();
	});
});

describe('the ascent azimuth (ADR 0155 point 4)', () => {
	test('judged once at 2 km against the site fan, and still judged after a save and resume', async () => {
		const sim = await make('cost');
		const r = sim.dispatch({
			type: 'load-vessel',
			design: twoStage(),
			placement: { kind: 'site', site: 'legacy' },
			...pilotFor(sim)
		} as never);
		if (!r.ok) throw new Error(r.reason);
		const fan = sim.snapshot().range!.site!;
		expect(fan.id).toBe('legacy');
		const saved = sim.save();
		expect(saved.range).toEqual({ pending: [{ vessel: Number(r.vessel), site: 'legacy' }] });
		sim.dispose();

		const again = await make('cost', saved);
		const events: Array<{ kind: string; azimuth?: number }> = [];
		again.events.on('range:violation', (e) => events.push({ kind: e.kind, azimuth: e.azimuth }));
		const ascent = createAscent(again, r.vessel!, defaultAscent);
		while (again.time < 120 && again.save().range !== undefined) {
			again.step(0.02);
			ascent.update();
		}
		expect(again.save().range).toBeUndefined();
		const east = fan.fan.some((a) => a.from <= 90 && 90 <= a.to);
		// the scripted ascent climbs east: a violation exactly when east is outside the fan
		expect(events.filter((e) => e.kind === 'azimuth').length).toBe(east ? 0 : 1);
		again.dispose();
	});
});
