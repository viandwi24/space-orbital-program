import { bodyId, entityId, type Snapshot, type VesselSnapshot } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import { scriptView } from './script-channel';

const vessel = (id: number): VesselSnapshot => ({
	id: entityId(id),
	name: `V${id}`,
	mode: 'on-rails',
	soi: bodyId('stock.home'),
	position: { x: 1, y: 2, z: 3 },
	velocity: { x: 0, y: 0, z: 0 },
	orientation: { x: 0, y: 0, z: 0, w: 1 },
	parts: [
		{
			id: entityId(100 + id),
			definition: 'stock.tank-small' as never,
			position: { x: 0, y: 0, z: 0 },
			orientation: { x: 0, y: 0, z: 0, w: 1 },
			modules: {}
		}
	]
});

describe('what a script Worker is sent', () => {
	const snapshot: Snapshot = {
		t: 42,
		vessels: [vessel(1), vessel(2), vessel(3)],
		bodies: [
			{
				id: bodyId('stock.home'),
				position: { x: 0, y: 0, z: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 }
			}
		]
	};

	it('keeps the controlled vessel whole and the others without parts, and no bodies', () => {
		const view = scriptView(snapshot, 2);
		expect(view.t).toBe(42);
		expect(view.bodies).toEqual([]);
		expect(view.vessels.map((v) => [Number(v.id), v.name, v.parts.length])).toEqual([
			[1, 'V1', 0],
			[2, 'V2', 1],
			[3, 'V3', 0]
		]);
		// the original snapshot is untouched
		expect(snapshot.vessels[0]!.parts).toHaveLength(1);
	});
});
