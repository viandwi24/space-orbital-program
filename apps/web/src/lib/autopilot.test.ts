import { bodyId, entityId, type Command, type PartDefinition, type Snapshot } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import { createAutopilot } from './autopilot';

const body = {
	id: bodyId('stock.home'),
	mass: 5.97e24,
	radius: 600_000,
	rotationPeriod: 21_600
};

const snapshot = (extra: object): Snapshot =>
	({
		t: 3,
		bodies: [],
		vessels: [
			{
				id: entityId(1),
				mode: 'on-rails',
				soi: bodyId('stock.home'),
				position: { x: 600_000, y: 0, z: 0 },
				velocity: { x: 0, y: 0, z: 0 },
				orientation: { x: 0, y: 0, z: 0, w: 1 },
				parts: [],
				...extra
			}
		]
	}) as unknown as Snapshot;

function setup() {
	const sent: Command[] = [];
	const ap = createAutopilot({
		vessel: entityId(1),
		body: body as never,
		parts: [] as PartDefinition[],
		resources: [],
		send: (c) => void sent.push(c)
	});
	return { sent, ap };
}

describe('autopilot on surface rails (plan 017)', () => {
	it('starts from a vessel parked on surface rails: throttle and stage wake it', () => {
		const { sent, ap } = setup();
		ap.update(snapshot({ surface: true }));
		expect(sent.map((c) => c.type)).toEqual(expect.arrayContaining(['throttle', 'stage']));
	});
	it('still ignores a vessel that is on Kepler rails', () => {
		const { sent, ap } = setup();
		ap.update(snapshot({}));
		expect(sent).toEqual([]);
	});
});
