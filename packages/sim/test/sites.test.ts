/** Placement at a site's pad and terrain from the world's sites (plan 084, ADR 0142). */
import { describe, expect, test } from 'bun:test';
import {
	LEGACY_SITE,
	createBodyTerrainField,
	legacyWorldInfo,
	type Site,
	type WorldInfo
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { probe, rapier } from './helpers/vessels.ts';

const DEG = Math.PI / 180;

async function simIn(world?: WorldInfo) {
	return createSim({
		plugins: [Stock],
		backendFactory: rapier(),
		seed: 1,
		terrain: createBodyTerrainField,
		...(world ? { world } : {})
	});
}

describe('placement at a site', () => {
	test('{ site: "legacy", pad: 0 } places the vessel where the default does', async () => {
		const a = await simIn();
		const b = await simIn();
		const ra = a.dispatch({ type: 'load-vessel', design: probe() });
		const rb = b.dispatch({
			type: 'load-vessel',
			design: probe(),
			placement: { kind: 'site', site: 'legacy', pad: 0 }
		});
		expect(ra.ok && rb.ok).toBe(true);
		const va = a.snapshot().vessels[0]!;
		const vb = b.snapshot().vessels[0]!;
		expect(vb.position).toEqual(va.position);
		expect(vb.orientation).toEqual(va.orientation);
		a.dispose();
		b.dispose();
	});

	test('unknown sites and pads are refused with the reason', async () => {
		const sim = await simIn();
		const bad = (placement: { kind: 'site'; site: string; pad?: number }) =>
			sim.dispatch({ type: 'load-vessel', design: probe(), placement });
		expect(bad({ kind: 'site', site: 'nowhere' })).toEqual({
			ok: false,
			reason: 'unknown site "nowhere"; this world has "legacy"'
		});
		const pad = bad({ kind: 'site', site: 'legacy', pad: 3 });
		expect(pad.ok).toBe(false);
		expect(pad.ok ? '' : pad.reason).toContain('no pad 3');
		sim.dispose();
	});

	test('a world with a base at latitude 30: the vessel stands on its pad, on flat ground', async () => {
		const base: Site = {
			...LEGACY_SITE,
			id: 'w.north',
			name: 'North base',
			kind: 'base',
			latitude: 30 * DEG,
			longitude: 1.0,
			flatRadius: 3_000,
			blendWidth: 6_000,
			pads: [{ east: 400, north: -250 }]
		};
		const world: WorldInfo = { ...legacyWorldInfo(1), id: 'w-084', sites: [LEGACY_SITE, base] };
		const sim = await simIn(world);
		const r = sim.dispatch({
			type: 'load-vessel',
			design: probe(),
			placement: { kind: 'site', site: 'w.north' }
		});
		expect(r.ok).toBe(true);
		for (let i = 0; i < 100; i++) sim.step(0.02);
		const v = sim.snapshot().vessels[0]!;
		const home = sim.snapshot().bodies[0]!;
		// on the ground, upright, at the latitude of the pad (north offset -250 m)
		const r0 = Math.hypot(v.position.x, v.position.y, v.position.z);
		const lat = Math.asin(v.position.y / r0);
		expect(lat).toBeCloseTo(30 * DEG - 250 / 600_000, 5);
		expect(v.terrainHeight).toBe(0);
		expect(r0 - 600_000).toBeLessThan(5);
		expect(String(home.id)).toBe('stock.home');
		sim.dispose();
	});
});
