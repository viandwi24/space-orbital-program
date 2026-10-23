/** The Repair button on EVA (player-journey audit Q1, J6). */
import { describe, expect, it } from 'vitest';
import { repairOffer } from './repair-offer';

const vessel = (id: number, x: number, parts: Array<{ id: number; definition: string }>) => ({
	id,
	soi: 'stock.home',
	position: { x, y: 0, z: 0 },
	parts: parts.map((p) => ({ ...p, position: { x: 0, y: 0, z: 0 } }))
});
const snapshot = (crewOf: string, failedMode = 'stock.engine-shutdown', x = 20) =>
	({
		vessels: [vessel(1, 0, [{ id: 10, definition: 'stock.eva-suit' }]), vessel(2, x, [{ id: 20, definition: 'stock.engine-lv' }])],
		crew: [{ id: 'c1', profession: crewOf, vessel: 1 }],
		reliability: {
			models: [],
			reports: [],
			failed: [{ vessel: 2, part: 20, module: 'stock.engine', mode: failedMode, label: 'Engine shutdown' }]
		}
	}) as never;
const repairable = (mode: string) => mode === 'stock.engine-shutdown';

describe('the repair offer', () => {
	it('an engineer in the suit within 50 m of a failed part is offered its repair', () => {
		expect(repairOffer(snapshot('engineer'), 1, repairable)).toEqual({
			vessel: 2,
			part: 20,
			definition: 'stock.engine-lv',
			failure: 'Engine shutdown'
		});
	});
	it('not a pilot, not too far, not a failure the field cannot mend', () => {
		expect(repairOffer(snapshot('pilot'), 1, repairable)).toBeNull();
		expect(repairOffer(snapshot('engineer', 'stock.engine-shutdown', 80), 1, repairable)).toBeNull();
		expect(repairOffer(snapshot('engineer', 'stock.antenna-dead'), 1, repairable)).toBeNull();
	});
});
