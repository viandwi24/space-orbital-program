/** Plan 039 / 201 / 253 (ADRs 0053, 0233): the ladder and the governor's rules on synthetic frame series. */
import { describe, expect, test } from 'bun:test';
import {
	DEFAULT_GOVERNOR,
	QualityGovernor,
	governorLadder,
	levelCost,
	sceneKeyOf,
	type GovernorLevel
} from '../src/quality-governor.ts';
import { GRAPHICS_PRESETS } from '../src/presets.ts';

interface Run {
	changes: Array<{ t: number; level: GovernorLevel; reason: string }>;
	/** Intervals of every drawn frame, ms. */
	drawn: number[];
	/** Seconds of play simulated. */
	seconds: number;
}

/**
 * A display of `hz` and a page whose frame costs `cost(level, t)` ms: the next rAF comes at the first
 * vsync after the frame is done, the way a vsync-locked display shows it. `scene(t)` names the scene.
 */
function play(
	g: QualityGovernor,
	seconds: number,
	cost: (level: GovernorLevel, tMs: number) => number,
	options: {
		hz?: number;
		scene?: (tSeconds: number) => string;
		work?: (level: GovernorLevel, tMs: number) => number;
	} = {}
): Run {
	const period = 1000 / (options.hz ?? 60);
	const out: Run = { changes: [], drawn: [], seconds };
	let t = 0;
	let last = period;
	let lastDraw = 0;
	let known = g.history.length;
	while (t < seconds * 1000) {
		if (options.scene) g.setScene(options.scene(t / 1000));
		const r = g.tick(last);
		if (g.history.length > known) {
			const c = g.history[g.history.length - 1]!;
			out.changes.push({ t: t / 1000, level: c.level, reason: c.reason });
			known = g.history.length;
		}
		let step = period;
		if (r.render) {
			const c = cost(g.level, t);
			step = Math.max(period, Math.ceil(c / period - 1e-9) * period);
			out.drawn.push(t - lastDraw);
			lastDraw = t;
		}
		t += step;
		last = step;
	}
	return out;
}

/** A Retina-like machine: the top rung costs `top` ms, the others by their relative pixel cost. */
const retina = (top: number) => (level: GovernorLevel) => top * levelCost(level);
const over = (run: Run, ms: number, afterSeconds = 0): number => {
	let t = 0;
	let n = 0;
	let total = 0;
	for (const d of run.drawn) {
		t += d / 1000;
		if (t < afterSeconds) continue;
		total++;
		if (d > ms) n++;
	}
	return total === 0 ? 0 : n / total;
};

describe('governorLadder', () => {
	test('resolution first, then the half-resolution planet pass, then the next preset, ending at low', () => {
		const name = (l: GovernorLevel): string =>
			`${l.preset}@${l.scale}${l.planetScale < 1 ? '+half' : ''}`;
		expect(governorLadder('high').map(name)).toEqual([
			'high@1',
			'high@0.85',
			'high@1+half',
			'high@0.7+half',
			'medium@1',
			'medium@0.85',
			'medium@1+half',
			'medium@0.7+half',
			'low@1',
			'low@0.85',
			'low@1+half',
			'low@0.7+half',
			'low@0.55+half'
		]);
	});
	test('without float render targets the ladder has no half-resolution rung', () => {
		const ladder = governorLadder('high', false);
		expect(ladder.every((l) => l.planetScale === 1)).toBe(true);
		expect(ladder.map((l) => `${l.preset}@${l.scale}`)).toEqual([
			'high@1',
			'high@0.85',
			'medium@1',
			'medium@0.85',
			'low@1',
			'low@0.85'
		]);
		const g = new QualityGovernor('high', DEFAULT_GOVERNOR, false);
		play(g, 900, () => 60);
		expect(g.level).toEqual({ preset: 'low', scale: 0.85, planetScale: 1 });
	});
	test('the planet pass goes to half size before the frame drops to 0.7 and before the preset falls', () => {
		const ladder = governorLadder('high');
		const firstHalf = ladder.findIndex((l) => l.planetScale < 1);
		expect(ladder[firstHalf]).toEqual({ preset: 'high', scale: 1, planetScale: 0.5 });
		expect(ladder.findIndex((l) => l.preset === 'medium')).toBeGreaterThan(firstHalf);
		// within a preset the resolution never rises while the planet pass is at half size
		for (const preset of GRAPHICS_PRESETS) {
			const rungs = ladder.filter((l) => l.preset === preset && l.planetScale < 1);
			for (let i = 1; i < rungs.length; i++) {
				expect(rungs[i]!.scale).toBeLessThan(rungs[i - 1]!.scale);
			}
		}
	});
	test('the ceiling is the first rung and nothing above it appears', () => {
		expect(governorLadder('medium')[0]).toEqual({ preset: 'medium', scale: 1, planetScale: 1 });
		expect(governorLadder('medium').some((l) => l.preset === 'high')).toBe(false);
		expect(governorLadder('low')).toHaveLength(5);
	});
});

describe('QualityGovernor: rules on synthetic frame series (plan 253)', () => {
	test('a machine inside the budget never changes level', () => {
		const g = new QualityGovernor('high');
		const run = play(g, 120, () => 9);
		expect(run.changes).toEqual([]);
		expect(g.level).toEqual({ preset: 'high', scale: 1, planetScale: 1 });
	});

	test('a Retina-like series settles on a rung and never oscillates', () => {
		const g = new QualityGovernor('high');
		const run = play(g, 300, retina(40));
		expect(run.changes.length).toBeGreaterThan(0);
		// downward only, and quiet after the settle: nothing changes after the first 20 s
		for (const c of run.changes) expect(c.t).toBeLessThan(20);
		const names = run.changes.map(
			(c) => `${c.level.preset}@${c.level.scale}${c.level.planetScale < 1 ? '+h' : ''}`
		);
		expect(new Set(names).size).toBe(names.length);
		// frames over 33.3 ms are rare once it has settled
		expect(over(run, 34, 20)).toBeLessThan(0.01);
		expect(g.level.planetScale).toBeLessThan(1);
	});

	test('a sudden heavy scene drops within about a second, two rungs when it is very heavy', () => {
		const g = new QualityGovernor('high');
		const run = play(g, 20, (l, t) => (t < 8_000 ? 9 : 45 * levelCost(l)));
		const first = run.changes[0]!;
		expect(first.t).toBeGreaterThanOrEqual(8);
		expect(first.t).toBeLessThan(9.3);
		expect(first.reason).toContain('two rungs');
		expect(first.level).toEqual(governorLadder('high')[2]!);
	});

	test('a one-frame spike is not a drop', () => {
		const g = new QualityGovernor('high');
		const run = play(g, 20, (_l, t) => (Math.floor(t / 100) % 50 === 7 ? 90 : 9));
		expect(run.changes).toEqual([]);
	});

	test('no step up without evidence: a clean machine at a lowered rung stays there, however long', () => {
		const g = new QualityGovernor('high');
		play(g, 12, retina(40));
		const level = g.level;
		expect(level).not.toEqual(governorLadder('high')[0]!);
		// 20 minutes of frames well inside the budget, the same scene: no timer retries
		const run = play(g, 1_200, () => 6);
		expect(run.changes).toEqual([]);
		expect(g.level).toEqual(level);
	});

	test('a changed scene earns one trial per rung; a failed trial bans the rung for that scene', () => {
		const g = new QualityGovernor('high');
		const scene = (t: number) => (t < 40 ? 'A' : t < 400 ? 'B' : 'C');
		const ladder = governorLadder('high');
		const index = (l: GovernorLevel) =>
			ladder.findIndex(
				(x) => x.preset === l.preset && x.scale === l.scale && x.planetScale === l.planetScale
			);
		// the two top rungs never hold (two vsyncs); from the third down the frame is easy
		const run = play(g, 600, (l) => (index(l) < 2 ? 40 : 9), { scene });
		expect(index(g.level)).toBe(2);
		const ups = run.changes.filter((c) => c.reason === 'scene changed, one trial up');
		const failed = run.changes.filter((c) => c.reason.startsWith('trial failed'));
		// A: the descent only. B: one trial up (fails, banned in B). C: one trial up (fails, banned in C).
		expect(ups.length).toBe(2);
		expect(failed.length).toBe(2);
		for (const f of failed) expect(f.reason).toContain('banned in this scene');
		expect(ups[0]!.t).toBeGreaterThanOrEqual(40);
		expect(ups[1]!.t).toBeGreaterThanOrEqual(400);
		expect(run.changes.filter((c) => !c.reason.includes('trial')).length).toBeGreaterThanOrEqual(1);
		expect(run.changes[run.changes.length - 1]!.t).toBeLessThan(410);
	});

	test('measured headroom steps up, one rung at least 30 s after the last change', () => {
		const g = new QualityGovernor('high');
		const lowered = (l: GovernorLevel) => (levelCost(l) > 0.7 ? 40 : 6);
		// the work times (5 ms at the rung above's pixel cost) leave room
		let run = play(g, 12, lowered);
		const down = g.level;
		expect(down).not.toEqual(governorLadder('high')[0]!);
		// feed work times through `frame`: 16.67 ms intervals, 4 ms of work
		const ups: number[] = [];
		for (let i = 0; i < 60 * 60; i++) {
			const level = g.frame(1000 / 60, 4);
			if (level) ups.push(i / 60);
		}
		expect(ups.length).toBeGreaterThan(0);
		expect(ups[0]!).toBeGreaterThanOrEqual(30 - 12); // never sooner than the minimum gap
		expect(g.history.some((h) => h.reason === 'measured headroom')).toBe(true);
		run = play(g, 1, () => 5);
		void run;
	});

	test('measured work too close to the budget does not step up', () => {
		const g = new QualityGovernor('high');
		play(g, 12, retina(40));
		const before = g.history.length;
		for (let i = 0; i < 60 * 600; i++) g.frame(1000 / 60, 13.5);
		expect(g.history.length).toBe(before);
	});

	test('every change says why', () => {
		const g = new QualityGovernor('high');
		play(g, 60, retina(40), { scene: (t) => (t < 30 ? 'A' : 'B') });
		expect(g.history.length).toBeGreaterThan(0);
		for (const h of g.history) expect(h.reason.length).toBeGreaterThan(8);
	});

	test('a 120 Hz display is judged against 60 fps and draws every second rAF', () => {
		const g = new QualityGovernor('high');
		const run = play(g, 60, () => 7, { hz: 120 });
		expect(g.displayRate).toBe(120);
		expect(g.targetFps).toBe(60);
		expect(g.renderEvery).toBe(2);
		expect(run.changes).toEqual([]);
		const steady = run.drawn.slice(200);
		expect(Math.min(...steady)).toBeGreaterThan(15);
		expect(Math.max(...steady)).toBeLessThan(18);
	});

	test('a display throttled to 30 Hz is found out and not fought: quality goes back, 30 is the target', () => {
		const g = new QualityGovernor('high');
		const run = play(g, 90, () => 9, { hz: 30 });
		expect(g.displayRate).toBe(30);
		expect(g.targetFps).toBe(30);
		expect(g.renderEvery).toBe(1);
		expect(g.level).toEqual(governorLadder('high')[0]!);
		expect(run.changes[run.changes.length - 1]!.reason).toContain('30 Hz');
		// the search for a lever takes some seconds; after it nothing moves
		expect(run.changes[run.changes.length - 1]!.t).toBeLessThan(25);
	});

	test('a CPU-bound machine whose next preset is cheaper is not mistaken for a 30 Hz display', () => {
		const g = new QualityGovernor('high');
		play(g, 90, (l) => (l.preset === 'high' ? 19.5 : 9));
		expect(g.targetFps).toBe(60);
		expect(g.level.preset).toBe('medium');
	});

	test('60 is out of reach at the lowest rung: it locks to 30 and paces every second rAF', () => {
		const g = new QualityGovernor('high');
		const run = play(g, 120, (l) => 25 + 100 * levelCost(l));
		expect(g.isLockedTo30).toBe(true);
		expect(g.targetFps).toBe(30);
		expect(g.renderEvery).toBe(2);
		expect(g.history.some((h) => h.reason.startsWith('locked to 30'))).toBe(true);
		// even pacing: after the lock the drawn frames are 33 ms, not 40-55 fps floating
		const late = run.drawn.slice(-200);
		expect(Math.min(...late)).toBeGreaterThan(30);
		expect(Math.max(...late)).toBeLessThan(55);
	});

	test('intervals longer than the cutoff (hidden tab) are not frames', () => {
		const g = new QualityGovernor('high');
		play(g, 5, () => 9);
		for (let i = 0; i < 50; i++) expect(g.frame(2000)).toBeNull();
		expect(g.level.scale).toBe(1);
	});

	test('never goes above the ceiling', () => {
		const g = new QualityGovernor('medium');
		play(g, 400, () => 6);
		expect(g.level).toEqual({ preset: 'medium', scale: 1, planetScale: 1 });
	});

	test('disabled: always the ceiling at full resolution, every rAF drawn', () => {
		const g = new QualityGovernor('high');
		play(g, 30, retina(40));
		expect(g.level.scale).toBeLessThan(1);
		expect(g.setEnabled(false)).toEqual({ preset: 'high', scale: 1, planetScale: 1 });
		const run = play(g, 60, retina(80));
		expect(run.changes).toEqual([]);
		expect(g.tick(16.7)).toEqual({ render: true, level: null });
		expect(g.isEnabled).toBe(false);
		g.setEnabled(true);
		expect(play(g, 30, retina(40)).changes.length).toBeGreaterThan(0);
	});

	test('a new ceiling restarts from it and forgets the bans', () => {
		const g = new QualityGovernor('high');
		play(g, 60, retina(40));
		expect(g.level.preset === 'high' && g.level.scale === 1).toBe(false);
		expect(g.setCeiling('medium')).toEqual({ preset: 'medium', scale: 1, planetScale: 1 });
		expect(governorLadder('medium')[0]).toEqual(g.level);
	});
});

describe('hysteresis (plan 201, kept by plan 253)', () => {
	test('a trace swinging around 55 fps changes the preset at most once in 30 s', () => {
		// raw intervals: `period` seconds at 50 fps, then as long at 62 fps
		for (const period of [1, 2, 4, 6, 10]) {
			const g = new QualityGovernor('high');
			let last = 'high';
			let n = 0;
			let t = 0;
			while (t < 30) {
				const ms = Math.floor(t / period) % 2 === 0 ? 20 : 1000 / 62;
				const level = g.frame(ms);
				if (level && level.preset !== last) n++;
				if (level) last = level.preset;
				t += ms / 1000;
			}
			expect(n).toBeLessThanOrEqual(1);
		}
	});

	test('a machine just too slow for high never changes preset twice within 30 s, scenes flipping', () => {
		const g = new QualityGovernor('high');
		const run = play(g, 900, (l) => (l.preset === 'high' ? 19.5 : 9), {
			scene: (t) => (Math.floor(t / 20) % 2 === 0 ? 'A' : 'B')
		});
		const at: number[] = [];
		let last = 'high';
		for (const c of run.changes) {
			if (c.level.preset !== last) at.push(c.t);
			last = c.level.preset;
		}
		expect(at.length).toBeGreaterThan(0);
		for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(30);
	});
});

describe('sceneKeyOf', () => {
	test('names the body, the altitude band and the view', () => {
		const at = (altitude: number, map = false) =>
			sceneKeyOf({ body: 'stock.home', altitude, atmosphereTop: 70_000, map });
		expect(at(100)).toBe('stock.home:ground:flight');
		expect(at(5_000)).toBe('stock.home:air:flight');
		expect(at(40_000)).toBe('stock.home:upper:flight');
		expect(at(200_000)).toBe('stock.home:space:flight');
		expect(at(200_000, true)).toBe('stock.home:space:map');
		expect(new Set([at(100), at(5_000), at(40_000), at(200_000)]).size).toBe(4);
	});
});
