/** EVA v2 page model (plan 225): headings and translations relative to the view, the suit's status. */
import type { VesselSnapshot } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import {
	chuteStep,
	horizonAt,
	jetpackTranslate,
	rotate,
	suitStatus,
	walkHeading
} from './eva-model';

const ID = { x: 0, y: 0, z: 0, w: 1 };
/** On the equator at +X; the body's pole is +Y, so up is +X, north +Y and east -Z. */
const AT = { x: 600_000, y: 0, z: 0 };

describe('EVA v2 page model', () => {
	it('finds up, north and east as the sim does', () => {
		const h = horizonAt(AT, ID);
		expect(h.up).toEqual({ x: 1, y: 0, z: 0 });
		expect(h.north.y).toBeCloseTo(1, 12);
		expect(h.east.z).toBeCloseTo(-1, 12);
	});

	it('W walks where the camera looks, D to its right, A to its left; nothing held is null', () => {
		// the camera looks north and a little down
		const view = { x: -0.3, y: 1, z: 0 };
		expect(walkHeading(view, AT, ID, 1, 0)).toBeCloseTo(0, 9);
		expect(walkHeading(view, AT, ID, 0, 1)).toBeCloseTo(Math.PI / 2, 9);
		expect(walkHeading(view, AT, ID, 0, -1)).toBeCloseTo((3 * Math.PI) / 2, 9);
		expect(walkHeading(view, AT, ID, -1, 0)).toBeCloseTo(Math.PI, 9);
		expect(walkHeading(view, AT, ID, 0, 0)).toBeNull();
	});

	it("the jetpack's translation is in the suit's own frame and never longer than 1", () => {
		// a suit standing upright here: its +Y (the nose) along local up (+X)
		const s = Math.SQRT1_2;
		const upright = { x: 0, y: 0, z: -s, w: s };
		expect(rotate(upright, { x: 0, y: 1, z: 0 }).x).toBeCloseTo(1, 12);
		const t = jetpackTranslate({ x: 0, y: 1, z: 0 }, AT, upright, 0, 0, 1);
		expect(t.y).toBeCloseTo(1, 9);
		const both = jetpackTranslate({ x: 0, y: 1, z: 0 }, AT, upright, 1, 1, 1);
		expect(Math.hypot(both.x, both.y, both.z)).toBeCloseTo(1, 9);
	});

	it("reads the suit's propellant, oxygen, charge and jetpack switch", () => {
		const v = {
			id: 7,
			parts: [{ id: 8, definition: 'stock.eva-suit', modules: { 'stock.jetpack': { on: true } } }],
			resources: [
				{ resource: 'stock.cold-gas', amount: 12, capacity: 20 },
				{ resource: 'stock.oxygen', amount: 0.4, capacity: 0.5 }
			]
		} as unknown as VesselSnapshot;
		const st = suitStatus(v);
		expect(st.gas).toEqual({ amount: 12, capacity: 20 });
		expect(st.oxygen).toEqual({ amount: 0.4, capacity: 0.5 });
		expect(st.charge).toBeNull();
		expect(st.jetpack).toBe(true);
		expect(st.jetpackPart).toBe(8);
	});

	it('reads the helmet and the personal chute, and what the chute key does in each state', () => {
		const v = {
			id: 7,
			parts: [
				{
					id: 8,
					definition: 'stock.eva-suit',
					modules: {
						'stock.helmet': { on: false, breathable: true },
						'stock.parachute': { status: 'armed' }
					}
				}
			]
		} as unknown as VesselSnapshot;
		const st = suitStatus(v);
		expect(st.helmet).toEqual({ on: false, breathable: true, part: 8 });
		expect(st.chute).toEqual({ status: 'armed', part: 8 });
		const bare = suitStatus({ id: 7, parts: [] } as unknown as VesselSnapshot);
		expect(bare.helmet).toBeNull();
		expect(bare.chute).toBeNull();
		expect(['stowed', 'armed', 'semi', 'full', 'cut', 'torn'].map(chuteStep)).toEqual([
			'deploy',
			'disarm',
			'cut',
			'cut',
			null,
			null
		]);
	});
});
