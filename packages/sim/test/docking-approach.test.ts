/** Docking (plan 222): the e2e approach in the sim — Beta holds target on Alpha, Alpha targets its port on RCS. */
import { describe, expect, test } from 'bun:test';
import { entityId, partId, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { orbitState } from './helpers/measure.ts';
import { rapier } from './helpers/vessels.ts';

const probe = (name: string, heavy: boolean): VesselDesign =>
	({
		formatVersion: 3,
		name,
		parts: [
			{ index: 0, part: partId('stock.probe-core'), parent: null },
			{
				index: 1,
				part: partId('stock.docking-port'),
				parent: { index: 0, parentNode: 'top', node: 'bottom' }
			},
			{
				index: 2,
				part: partId('stock.reaction-wheel'),
				parent: { index: 0, parentNode: 'bottom', node: 'top' }
			},
			{
				index: 3,
				part: partId('stock.monoprop-tank'),
				parent: { index: 2, parentNode: 'bottom', node: 'top' }
			},
			...(heavy
				? [4, 5, 6].map((index) => ({
						index,
						part: partId('stock.tank-medium'),
						parent: { index: index - 1, parentNode: 'bottom', node: 'top' }
					}))
				: []),
			...(heavy
				? [0, 1, 2, 3].map((k) => ({
						index: 7 + k,
						part: partId('stock.rcs-block'),
						parent: {
							index: 5,
							parentNode: 'surface',
							node: 'radial',
							radial: { angle: (k * Math.PI) / 2, y: 0 }
						}
					}))
				: [])
		],
		stages: []
	}) as VesselDesign;

describe('docking approach (plan 222)', () => {
	test('from 20 m on RCS with both holding SAS target, the ports capture', async () => {
		const sim = await createSim({ plugins: [Stock], backendFactory: rapier(), seed: 3 });
		const s = orbitState(sim, 100_000);
		const a = sim.dispatch({
			type: 'load-vessel',
			design: probe('Alpha', true),
			placement: { kind: 'state', ...s, orientation: { x: 0, y: 0, z: 0, w: 1 } }
		});
		const b = sim.dispatch({
			type: 'load-vessel',
			design: probe('Beta', false),
			placement: {
				kind: 'state',
				position: { ...s.position, z: s.position.z - 20 },
				velocity: s.velocity,
				orientation: { x: 0, y: 0, z: 0, w: 1 }
			}
		});
		const A = a.vessel!;
		const B = b.vessel!;
		const v = (id: number) => sim.snapshot().vessels.find((x) => x.id === id)!;
		expect(
			(sim.dispatch({ type: 'target-set', vessel: B, target: { kind: 'vessel', id: A } }),
			sim.dispatch({ type: 'sas', vessel: B, mode: 'target', reference: 'orbit' }))
		).toMatchObject({ ok: true });
		const portB = v(B).ports![0]!.part;
		expect(
			sim.dispatch({
				type: 'target-set',
				vessel: A,
				target: { kind: 'vessel', id: B, part: portB }
			})
		).toMatchObject({ ok: true });
		sim.dispatch({ type: 'set-rcs', vessel: A, on: true });
		sim.dispatch({ type: 'sas', vessel: A, mode: 'target', reference: 'orbit' });
		const push = (y: number) =>
			sim.dispatch({
				type: 'attitude',
				vessel: A,
				pitch: 0,
				yaw: 0,
				roll: 0,
				translate: { x: 0, y, z: 0 }
			});
		// a stick tap puts Alpha in flight (SAS alone holds on rails); Beta joins it within 50 m
		sim.dispatch({ type: 'attitude', vessel: A, pitch: 1, yaw: 0, roll: 0 });
		sim.step(0.02);
		push(0);
		let docked = false;
		sim.events.on('vessel:docked', () => (docked = true));
		for (let i = 0; i < 180 * 50 && !docked; i++) {
			const t = i * 0.02;
			const port = v(A).target?.port;
			if (t > 30 && port) push(port.closing < 0.2 ? 0.2 : port.closing > 0.4 ? -0.2 : 0);
			sim.step(0.02);
		}
		console.log(
			`docking approach: captured ${docked ? `after ${sim.time.toFixed(0)} s` : 'never'}`
		);
		expect(docked).toBe(true);
		sim.dispose();
	}, 120_000);
});
