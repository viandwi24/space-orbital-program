/**
 * A polar customer (player-journey audit Q7, ADR 0327): a vessel remembers the latitude of the site
 * it was launched from, and a satellite objective with `minLaunchLatitude` counts only a vessel
 * launched from that far north or south, so an equatorial Space Center needs a branch for it.
 */
import { describe, expect, test } from 'bun:test';
import {
	LEGACY_SITE,
	createBodyTerrainField,
	legacyWorldInfo,
	type EntityId,
	type WorldInfo
} from '@orbital/core';
import Stock, { POLAR_LAUNCH_LATITUDE } from '@orbital/mod-stock';
import { defineContract, definePlugin } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import { rapier, stack } from './helpers/vessels.ts';

const DEG = Math.PI / 180;
const R = 600_000;

const fix = definePlugin({
	meta: { id: 'fix', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(ctx) {
		ctx.contracts.register(
			defineContract({
				id: 'fix.polar',
				title: 'Polar satellite',
				objectives: {
					objective: 'stock.satellite',
					params: {
						periapsis: 200_000,
						apoapsis: 200_000,
						inclination: 90 * DEG,
						minLaunchLatitude: POLAR_LAUNCH_LATITUDE
					}
				}
			})
		);
	}
});

/** The Space Center on the equator and a branch at 35° N. */
const world: WorldInfo = {
	...legacyWorldInfo(1),
	id: 'w-polar',
	sites: [
		structuredClone(LEGACY_SITE),
		{
			...structuredClone(LEGACY_SITE),
			id: 'north',
			name: 'North',
			latitude: 35 * DEG,
			longitude: 0.4
		}
	]
};

const satellite = () =>
	stack('Polar sat', ['stock.probe-core', 'stock.whip-antenna', 'stock.rtg'], []);

/** Launch from `site`, then (debug) put the vessel on the contract's polar orbit. */
function launchToPolar(sim: Sim, site: string): EntityId {
	const r = sim.dispatch({
		type: 'load-vessel',
		design: satellite(),
		placement: { kind: 'site', site }
	});
	if (!r.ok) throw new Error(r.reason);
	const id = r.vessel!;
	sim.dispatch({ type: 'debug-mode', on: true });
	const a = R + 200_000;
	const set = sim.dispatch({
		type: 'debug-set-orbit',
		vessel: id,
		orbit: { body: 'stock.home' as never, a, e: 0, i: 90 * DEG, raan: 0, argp: 0, m0: 0 }
	});
	if (!set.ok) throw new Error(set.reason);
	return id;
}

async function polarRun(site: string) {
	const sim = await createSim({
		plugins: [Stock, fix],
		backendFactory: rapier(),
		seed: 1,
		terrain: createBodyTerrainField,
		world
	});
	expect(
		sim.dispatch({ type: 'objective-start', source: { kind: 'contract', id: 'fix.polar' } }).ok
	).toBe(true);
	const id = launchToPolar(sim, site);
	for (let i = 0; i < 10; i++) sim.step(0.02);
	const status = sim.snapshot().objectives![0]!.status;
	const saved = JSON.stringify(sim.save());
	sim.dispose();
	return { id, status, saved };
}

describe('a polar customer', () => {
	test('a satellite launched from the equatorial Space Center does not count', async () => {
		const { status } = await polarRun('legacy');
		expect(status).toBe('active');
	});

	test('the same satellite launched from the branch at 35° N completes it, and the save keeps the latitude', async () => {
		const { status, saved } = await polarRun('north');
		expect(status).toBe('done');
		const latitude = Number(/"launchLatitude":([-0-9.e]+)/.exec(saved)?.[1]);
		expect(latitude).toBeGreaterThan(34.9 * DEG);
		expect(latitude).toBeLessThan(35.1 * DEG);
	});
});
