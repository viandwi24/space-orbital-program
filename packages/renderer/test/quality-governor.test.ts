import { describe, expect, test } from 'bun:test';
import {
	DEFAULT_GOVERNOR,
	QualityGovernor,
	governorLadder,
	type GovernorLevel
} from '../src/quality-governor.ts';

/** Feeds `seconds` of frames of `ms` each; returns every level change in order. */
function run(g: QualityGovernor, seconds: number, ms: number): GovernorLevel[] {
	const changes: GovernorLevel[] = [];
	const frames = Math.round((seconds * 1000) / ms);
	for (let i = 0; i < frames; i++) {
		const c = g.frame(ms);
		if (c) changes.push(c);
	}
	return changes;
}

/** Feeds frames of `ms` until the level changes (or `maxSeconds` pass); returns the new level or null. */
function untilChange(g: QualityGovernor, ms: number, maxSeconds = 120): GovernorLevel | null {
	const frames = Math.round((maxSeconds * 1000) / ms);
	for (let i = 0; i < frames; i++) {
		const c = g.frame(ms);
		if (c) return c;
	}
	return null;
}

describe('governorLadder', () => {
	test('resolution first, then the next preset at full resolution, ending at low', () => {
		expect(governorLadder('high').map((l) => `${l.preset}@${l.scale}`)).toEqual([
			'high@1',
			'high@0.85',
			'high@0.7',
			'medium@1',
			'medium@0.85',
			'medium@0.7',
			'low@1',
			'low@0.85',
			'low@0.7',
			'low@0.55'
		]);
	});
	test('the ceiling is the first rung and nothing above it appears', () => {
		expect(governorLadder('medium')[0]).toEqual({ preset: 'medium', scale: 1 });
		expect(governorLadder('medium').some((l) => l.preset === 'high')).toBe(false);
		expect(governorLadder('low')).toHaveLength(4);
	});
});

describe('QualityGovernor', () => {
	test('a machine inside the budget never changes level', () => {
		const g = new QualityGovernor('high');
		expect(run(g, 120, 16.7)).toEqual([]);
		expect(g.level).toEqual({ preset: 'high', scale: 1 });
	});

	test('steps down after the smoothed interval stays over budget, not on a short spike', () => {
		const g = new QualityGovernor('high');
		run(g, 5, 16.7);
		// a one second hitch at 40 ms is not enough
		expect(run(g, 1, 40)).toEqual([]);
		expect(run(g, 5, 16.7)).toEqual([]);
		// sustained 25 ms (40 fps) is
		const changes = run(g, 6, 25);
		expect(changes[0]).toEqual({ preset: 'high', scale: 0.85 });
	});

	test('keeps stepping down while the machine stays slow and stops at the floor', () => {
		const g = new QualityGovernor('high');
		run(g, 600, 40);
		expect(g.level).toEqual({ preset: 'low', scale: 0.55 });
		expect(run(g, 60, 40)).toEqual([]);
	});

	test('the first seconds and the seconds after a change are not judged (shader compiles)', () => {
		const g = new QualityGovernor('high');
		expect(run(g, DEFAULT_GOVERNOR.settleSeconds - 0.5, 200)).toEqual([]);
		const first = untilChange(g, 25)!;
		expect(first.scale).toBe(0.85);
		// right after the change a slow stretch shorter than the settle time does not count
		expect(run(g, DEFAULT_GOVERNOR.settleSeconds - 0.1, 60)).toEqual([]);
	});

	test('intervals longer than the cutoff (hidden tab) are not frames', () => {
		const g = new QualityGovernor('high');
		run(g, 5, 16.7);
		for (let i = 0; i < 50; i++) expect(g.frame(2000)).toBeNull();
		expect(g.level.scale).toBe(1);
	});

	test('steps back up after a calm spell and stays up when the trial holds', () => {
		const g = new QualityGovernor('high');
		const lowered = untilChange(g, 25)!;
		expect(lowered).toEqual({ preset: 'high', scale: 0.85 });
		const up = untilChange(g, 15, DEFAULT_GOVERNOR.probationSeconds + 10)!;
		expect(up).toEqual({ preset: 'high', scale: 1 });
		// the trial held for longer than the probe window: nothing changes and the wait is the base again
		expect(run(g, DEFAULT_GOVERNOR.probeSeconds + 2, 15)).toEqual([]);
		expect(g.nextProbationSeconds).toBe(DEFAULT_GOVERNOR.probationSeconds);
	});

	test('a failed trial doubles the calm needed for the next one, up to the cap', () => {
		const g = new QualityGovernor('high');
		expect(untilChange(g, 25)!.scale).toBe(0.85); // one rung down
		let waits: number[] = [];
		for (let round = 0; round < 8; round++) {
			waits.push(g.nextProbationSeconds);
			// calm until the trial step up, then slow again at once: the trial fails
			expect(untilChange(g, 15, 400)!.scale).toBe(1); // the trial step up
			expect(untilChange(g, 25)!.scale).toBe(0.85); // and straight back down
		}
		expect(waits[0]).toBe(DEFAULT_GOVERNOR.probationSeconds);
		expect(waits[1]).toBe(DEFAULT_GOVERNOR.probationSeconds * 2);
		expect(waits[2]).toBe(DEFAULT_GOVERNOR.probationSeconds * 4);
		expect(Math.max(...waits)).toBe(DEFAULT_GOVERNOR.maxProbationSeconds);
		waits = [];
	});

	test('never goes above the ceiling', () => {
		const g = new QualityGovernor('medium');
		run(g, 400, 15);
		expect(g.level).toEqual({ preset: 'medium', scale: 1 });
	});

	test('disabled: always the ceiling at full resolution, whatever the interval', () => {
		const g = new QualityGovernor('high');
		run(g, 30, 25);
		expect(g.level.scale).toBeLessThan(1);
		expect(g.setEnabled(false)).toEqual({ preset: 'high', scale: 1 });
		expect(run(g, 200, 50)).toEqual([]);
		expect(g.level).toEqual({ preset: 'high', scale: 1 });
		expect(g.isEnabled).toBe(false);
		g.setEnabled(true);
		expect(run(g, 20, 25).length).toBeGreaterThan(0);
	});

	test('a new ceiling restarts from it', () => {
		const g = new QualityGovernor('high');
		run(g, 60, 40);
		expect(g.level.preset).not.toBe('high');
		expect(g.setCeiling('medium')).toEqual({ preset: 'medium', scale: 1 });
		expect(governorLadder('medium')[0]).toEqual(g.level);
	});
});
