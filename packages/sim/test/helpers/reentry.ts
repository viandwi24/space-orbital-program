/**
 * Re-entry fixtures (plan 014): a vessel placed at the top of the atmosphere, moving down at a
 * given flight-path angle, with its bottom end facing the airflow (tail first, which is
 * aerodynamically stable for a stack with its mass forward of its drag).
 */
import type { EntityId, Plugin, VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim } from '../../src/index.ts';
import { RADIUS, homeMu } from './measure.ts';
import { rapier, stack } from './vessels.ts';

const PROBE = ['stock.command-pod', 'stock.reaction-wheel', 'stock.tank-small'];

/** Pod, reaction wheel and tank: the tank's bottom end faces the airflow tail first. */
export const probeEntry = (): VesselDesign => stack('Probe', PROBE, []);

/** The same probe with a heat shield under the tank. */
export const shieldedProbe = (): VesselDesign =>
	stack('Shielded probe', [...PROBE, 'stock.heat-shield'], []);

/** A deorbit entry: top of the atmosphere, below circular speed, 2.9 degrees down. */
export const deorbit: EntryOptions = { altitude: 70_000, speed: 2_250, angle: 0.05 };

export interface EntryOptions {
	/** Altitude, m. */
	altitude: number;
	/** Speed relative to the inertial frame, m/s. */
	speed: number;
	/** Angle below the local horizontal, rad. */
	angle: number;
}

/**
 * Load `design` on a ballistic path into the atmosphere, bottom first, and return the sim; `plugins`
 * add test parts, `heating` sets the re-entry heating rule (plan 212).
 */
export async function enter(
	design: VesselDesign,
	opts: EntryOptions,
	extra: { plugins?: Plugin[]; heating?: number } = {}
) {
	const sim = await createSim({
		plugins: [Stock, ...(extra.plugins ?? [])],
		backendFactory: rapier(16),
		seed: 1
	});
	if (extra.heating !== undefined) {
		const set = sim.dispatch({
			type: 'set-rule',
			rule: 'stock.reentry-heating',
			value: extra.heating
		});
		if (!set.ok) throw new Error(set.reason);
	}
	const damaged: Array<{ t: number } & Record<string, unknown>> = [];
	sim.events.on('part:damaged', (e) => damaged.push({ t: sim.time, ...e }));
	const r = RADIUS + opts.altitude;
	// Velocity in the x-z plane: tangential along -Z, radial inward along -X.
	const vx = -opts.speed * Math.sin(opts.angle);
	const vz = -opts.speed * Math.cos(opts.angle);
	// +Y of the vessel must point opposite the velocity so the bottom faces the flow.
	const dx = -vx / opts.speed;
	const dz = -vz / opts.speed;
	const s = Math.SQRT1_2;
	const placed = sim.dispatch({
		type: 'load-vessel',
		design,
		placement: {
			kind: 'state',
			position: { x: r, y: 0, z: 0 },
			velocity: { x: vx, y: 0, z: vz },
			orientation: { x: dz * s, y: 0, z: -dx * s, w: s }
		}
	});
	if (!placed.ok) throw new Error(placed.reason);
	return { sim, id: placed.vessel as EntityId, damaged, mu: homeMu(sim) };
}
