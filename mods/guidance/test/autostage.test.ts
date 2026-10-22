/** Plan 360: autostage drops spent boosters as MechJeb's does, and never crew or a burning engine. */
import { describe, expect, test } from 'bun:test';
import { entityId, type PilotEngine, type PilotStage, type VesselPilot } from '@orbital/sdk';
import { autoStage } from '../src/index.ts';

const engine = (part: number, ignited: boolean, flameout: boolean): PilotEngine => ({
	part: entityId(part),
	thrustVacuum: 100_000,
	ispVacuum: 300,
	ignited,
	flameout
});
/** A pilot with these engines, next stage and crew; counts its `stage` calls. */
function pilot(time: number, engines: PilotEngine[], next: PilotStage | null | undefined, crew: number[] = []) {
	const calls = { stage: 0 };
	const p = {
		time,
		engines,
		nextStage: next,
		maxThrust: engines.reduce((s, e) => s + (e.ignited && !e.flameout ? e.thrustVacuum : 0), 0),
		vessel: { crew: crew.map((c) => ({ member: 'k', part: entityId(c) })) },
		stage: () => {
			calls.stage++;
		}
	} as unknown as VesselPilot;
	return { p, calls };
}
const stage = (drops: number[], ignites: number[] = []): PilotStage => ({
	drops: drops.map(entityId),
	ignites: ignites.map(entityId)
});

describe('autostage (plan 360)', () => {
	const core = engine(1, true, false);
	const srb = engine(2, false, true); // burnt out: stock clears `ignited`

	test('a burnt-out booster beside a burning core goes half a second later', () => {
		const memory = { stagedAt: -1e9 };
		const a = pilot(10, [core, srb], stage([2, 3]));
		expect(autoStage(a.p, memory)).toBe(false); // the moment it burns out
		const b = pilot(10.6, [core, srb], stage([2, 3]));
		expect(autoStage(b.p, memory)).toBe(true);
		expect(b.calls.stage).toBe(1);
	});

	test('never when the stage would drop crew or a burning engine', () => {
		const crewed = pilot(10, [core, srb], stage([2, 9]), [9]);
		const memory = { stagedAt: -1e9, spentAt: 0 };
		expect(autoStage(crewed.p, memory)).toBe(false);
		const burning = pilot(10, [core, srb], stage([1, 2]));
		expect(autoStage(burning.p, { stagedAt: -1e9, spentAt: 0 })).toBe(false);
		// the next stage does not hold a decoupler for the booster
		const other = pilot(10, [core, srb], stage([7]));
		expect(autoStage(other.p, { stagedAt: -1e9, spentAt: 0 })).toBe(false);
	});

	test('nothing burns: the next stage when it lights an engine, never to drop the last one or past the last stage', () => {
		const dry = engine(1, false, true);
		expect(autoStage(pilot(10, [dry], stage([1, 5], [6])).p, { stagedAt: -1e9 })).toBe(true);
		expect(autoStage(pilot(10, [dry], stage([1, 5])).p, { stagedAt: -1e9 })).toBe(false);
		expect(autoStage(pilot(10, [dry], null).p, { stagedAt: -1e9 })).toBe(false);
		// a host without stage facts: the old rule
		expect(autoStage(pilot(10, [dry], undefined).p, { stagedAt: -1e9 })).toBe(true);
	});

	test('not within the gap after the last staging', () => {
		expect(autoStage(pilot(10, [engine(1, false, true)], stage([1], [6])).p, { stagedAt: 9.5 })).toBe(false);
	});
});
