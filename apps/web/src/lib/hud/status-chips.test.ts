/** Plan 272 (V3 §2.2, ADR 0253 point 7): the status strip's chips. */
import { describe, expect, it } from 'vitest';
import { statusChips } from './status-chips';

const none = { uncontrolled: null, link: null, blackout: 0, range: null } as const;

describe('statusChips', () => {
	it('all clear: no chip', () => {
		expect(statusChips(none)).toEqual([]);
	});

	it('no power: UNCONTROLLED in red, then NO POWER in amber, both with Open Parts', () => {
		const chips = statusChips({ ...none, uncontrolled: 'no-power' });
		expect(chips.map((c) => [c.id, c.tone, c.fix?.panel])).toEqual([
			['control', 'danger', 'host.parts'],
			['power', 'warning', 'host.parts']
		]);
		expect(chips[0]!.reason).toBe('no power');
		expect(chips[0]!.testid).toBe('hud-uncontrolled');
	});

	it('no command part: UNCONTROLLED with no fix', () => {
		const [c] = statusChips({ ...none, uncontrolled: 'no-crew' });
		expect(c!.reason).toBe('no crew or probe core');
		expect(c!.fix).toBeNull();
	});

	it('a lost link is NO SIGNAL with Open Comms; a linked one shows nothing', () => {
		const lost = statusChips({
			...none,
			link: { state: 'lost', text: 'Occluded by Earth', bars: 0, blackout: 0 }
		});
		expect(lost.map((c) => [c.label, c.fix?.panel, c.testid])).toEqual([
			['No signal', 'host.comms', 'hud-link']
		]);
		expect(
			statusChips({
				...none,
				link: { state: 'linked', text: 'Linked to KSC', bars: 4, blackout: 0 }
			})
		).toEqual([]);
	});

	it('no antenna says to add one, and that the Space Center is a ground station already', () => {
		const [c] = statusChips({
			...none,
			link: { state: 'lost', text: 'No antenna', bars: 0, blackout: 0 }
		});
		expect(c!.body).toContain('Add an antenna in the Hangar');
		expect(c!.body).toContain('ground station already');
	});

	it('a blackout without a comms network is PLASMA BLACKOUT; the range warning follows', () => {
		const chips = statusChips({ ...none, blackout: 0.8, range: 'Booster lands in the sea' });
		expect(chips.map((c) => c.id)).toEqual(['plasma', 'range']);
		expect(chips[1]!.reason).toBe('Booster lands in the sea (predicted)');
	});

	it('SAS on with little torque is LOW TORQUE with the half-turn time; none is NO TORQUE (plan 310)', () => {
		const low = statusChips({ ...none, sas: { mode: 'prograde', accel: 0.0004 } });
		expect(low.map((c) => c.label)).toEqual(['Low torque']);
		expect(low[0]!.body).toContain('177 s');
		const zero = statusChips({ ...none, sas: { mode: 'hold', accel: 0 } });
		expect(zero.map((c) => [c.label, c.fix?.panel])).toEqual([['No torque', 'host.parts']]);
		expect(statusChips({ ...none, sas: { mode: 'off', accel: 0 } })).toEqual([]);
		expect(statusChips({ ...none, sas: { mode: 'hold', accel: 0.05 } })).toEqual([]);
		expect(statusChips({ ...none, sas: { mode: 'hold' } })).toEqual([]);
	});
});
