/** A part that keeps its vessel in flight, and the action that wakes it (plan 391 tests). */
import type { EntityId, Plugin } from '@orbital/core';
import { defineModule, definePlugin } from '@orbital/sdk';
import type { Sim } from '../../src/index.ts';

/** `fix.awake`: a negligible torque every step keeps a vessel in flight, as a pilot's input would. */
export const awake: Plugin = definePlugin({
	meta: { id: 'fix', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(ctx) {
		ctx.modules.register(
			defineModule({
				id: 'fix.awake',
				update(c) {
					c.vessel.applyTorque({ x: 1e-9, y: 0, z: 0 });
				},
				actions: { wake: () => {} }
			})
		);
		ctx.parts.register({
			id: 'fix.awake',
			title: 'Awake',
			mass: 1,
			shape: { kind: 'cylinder', radius: 0.3, height: 0.1 },
			attach: {
				top: { pos: [0, 0.05, 0], dir: [0, 1, 0] },
				bottom: { pos: [0, -0.05, 0], dir: [0, -1, 0] }
			},
			modules: [['fix.awake', undefined]]
		});
	}
});

/** Wake an uncontrolled vessel into flight through its `fix.awake` part. */
export function wakeVessel(sim: Sim, id: EntityId): void {
	const v = sim.snapshot().vessels.find((x) => x.id === id)!;
	const r = sim.dispatch({
		type: 'action',
		vessel: id,
		part: v.parts.find((p) => p.definition === 'fix.awake')!.id,
		module: 'fix.awake',
		action: 'wake'
	});
	if (!r.ok) throw new Error(r.reason);
}
