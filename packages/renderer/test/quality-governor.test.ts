/** Plan 039 / 201 / 253 (ADRs 0053, 0233): the ladder and the governor's rules on synthetic frame series. */
import { describe, expect, test } from 'bun:test';
import {
	DEFAULT_GOVERNOR,
	PRESET_FLOOR_SCALE,
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
		const r = g.tick(last, options.work?.(g.level, t));
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
	test('resolution first down to 0.85, then the half-resolution planet pass, then the next preset; only low goes lower', () => {
		const name = (l: GovernorLevel): string =>
			`${l.preset}@${l.scale}${l.planetScale < 1 ? '+half' : ''}`;
		expect(governorLadder('high').map(name)).toEqual([
			'high@1',
			'high@0.85',
			'high@1+half',
			'medium@1',
			'medium@0.85',
			'medium@1+half',
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

	test('tick passes the GPU time on: measured headroom steps up (plan 261 Phase 8)', () => {
		const g = new QualityGovernor('high');
		play(g, 12, (l: GovernorLevel) => (levelCost(l) > 0.7 ? 40 : 6));
		const before = g.history.length;
		for (let i = 0; i < 60 * 60; i++) g.tick(1000 / 60, 4);
		expect(g.history.slice(before).some((h) => h.reason === 'measured headroom')).toBe(true);
	});

	test('a work time that under-reports tries the rung above once per scene, not every gap', () => {
		const g = new QualityGovernor('high');
		// the frame at the top rung misses vsync, at the rungs below it holds 60; the work time says 6 ms everywhere
		const cost = (l: GovernorLevel) => (levelCost(l) > 0.9 ? 30 : 10);
		play(g, 10, cost, { work: () => 6 });
		const run = play(g, 600, cost, { work: () => 6 });
		const ups = run.changes.filter((c) => c.reason === 'measured headroom');
		expect(ups.length).toBeLessThanOrEqual(1);
	});

	test('resolution only (WebGPU, plan 261): every rung keeps the ceiling preset and the floor still goes to 0.55', () => {
		const ladder = governorLadder('high', true, 1, false);
		expect(ladder.every((l) => l.preset === 'high')).toBe(true);
		expect(ladder.at(-1)!.scale).toBe(0.55);
		const g = new QualityGovernor('high', undefined, true, false);
		play(g, 120, () => 60);
		expect(g.level.preset).toBe('high');
		expect(g.history.every((h) => h.level.preset === 'high')).toBe(true);
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
		expect(g.level).not.toEqual({ preset: 'high', scale: 1, planetScale: 1 });
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

describe('the pixel budget shapes the rungs (plan 253 with plan 252)', () => {
	test('a pass the budget already draws near half size has no half rungs', () => {
		const ladder = governorLadder('high', true, 0.55);
		expect(ladder.filter((l) => l.planetScale < 1)).toEqual([]);
		expect(ladder[0]).toEqual({ preset: 'high', scale: 1, planetScale: 1 });
		expect(ladder.some((l) => l.preset === 'medium')).toBe(true);
	});

	test('at full budget the half rungs stay', () => {
		expect(governorLadder('high', true, 1).some((l) => l.planetScale < 1)).toBe(true);
	});

	test('learning the budget at the top rebuilds the ladder; later it waits', () => {
		const g = new QualityGovernor('high');
		expect(g.ladderLength).toBe(governorLadder('high').length);
		g.setBudgetedPlanetScale(0.55);
		expect(g.ladderLength).toBe(governorLadder('high', true, 0.55).length);
		expect(g.level).toEqual({ preset: 'high', scale: 1, planetScale: 1 });
	});
});

describe('plan 362 (ADR 0304): presets before deep resolution, a learned start, the frame-rate limit', () => {
	test('no rung below 0.85 of the side until the last preset', () => {
		for (const half of [true, false]) {
			const ladder = governorLadder('high', half);
			for (const l of ladder)
				if (l.preset !== 'low') expect(l.scale).toBeGreaterThanOrEqual(PRESET_FLOOR_SCALE);
			expect(ladder.at(-1)!.preset).toBe('low');
		}
	});

	test("the owner's M5 in orbit: high costs 40 ms at any scale, medium 10: the governor ends on medium, not high at 55 %", () => {
		const g = new QualityGovernor('high');
		const run = play(g, 60, (l) => (l.preset === 'high' ? 40 : 10));
		expect(g.level.preset).toBe('medium');
		expect(g.isLockedTo30).toBe(false);
		// within a few seconds, and held at 60 afterwards
		const firstMedium = run.changes.find((c) => c.level.preset === 'medium')!;
		expect(firstMedium.t).toBeLessThan(6);
		expect(over(run, 1000 / 60 + 1, 10)).toBeLessThan(0.02);
	});

	test('startAt begins at the learned rung; above it only evidence raises the level', () => {
		const g = new QualityGovernor('high');
		expect(g.startAt({ preset: 'medium', scale: 0.85 })).toEqual({
			preset: 'medium',
			scale: 0.85,
			planetScale: 1
		});
		// a learned scale between rungs takes the rung at or under it
		const h = new QualityGovernor('high');
		expect(h.startAt({ preset: 'medium', scale: 0.9 }).scale).toBe(0.85);
		// a preset not on the ladder (above the ceiling) leaves the start at the ceiling
		const m = new QualityGovernor('medium');
		expect(m.startAt({ preset: 'high', scale: 1 })).toEqual(governorLadder('medium')[0]!);
		// disabled: always the ceiling
		const d = new QualityGovernor('high');
		d.setEnabled(false);
		expect(d.startAt({ preset: 'low', scale: 1 }).preset).toBe('high');
	});

	test('the frame-rate limit: Display draws every rAF on 120 Hz, 60 every second, 30 every fourth', () => {
		const drawnShare = (cap: number | null, enabled = true): number => {
			const g = new QualityGovernor('high');
			g.setEnabled(enabled);
			g.setFrameCap(cap);
			const run = play(g, 20, () => 4, { hz: 120 });
			return run.drawn.length / 20;
		};
		expect(drawnShare(null)).toBeGreaterThan(110);
		expect(drawnShare(60)).toBeGreaterThan(55);
		expect(drawnShare(60)).toBeLessThan(65);
		expect(drawnShare(30)).toBeLessThan(33);
		// the limit paces the drawing with the governor off too
		expect(drawnShare(30, false)).toBeLessThan(33);
		expect(drawnShare(null, false)).toBeGreaterThan(110);
	});

	test('at Display rate on 120 Hz a frame of 12 ms holds the level (the target stays 60)', () => {
		const g = new QualityGovernor('high');
		g.setFrameCap(null);
		const run = play(g, 60, () => 12, { hz: 120 });
		expect(run.changes).toEqual([]);
		expect(g.targetFps).toBe(60);
	});

	test('a 30 cap judges against 30: 25 ms frames keep the ceiling', () => {
		const g = new QualityGovernor('high');
		g.setFrameCap(30);
		const run = play(g, 60, () => 25);
		expect(run.changes).toEqual([]);
		expect(g.budgetMs).toBeCloseTo(1000 / 30, 5);
	});

	test('work time that under-reads by 3x (Apple timestamps) does not raise the level after a drop', () => {
		const g = new QualityGovernor('high');
		// the frame at high 100 % costs 33 ms, the work time says 9; lower rungs hold 60 with 6 ms "measured"
		const cost = (l: GovernorLevel) => (l.preset === 'high' && l.scale === 1 && l.planetScale === 1 ? 33 : 12);
		const work = (l: GovernorLevel) => (cost(l) === 33 ? 9 : 4);
		const run = play(g, 300, cost, { work });
		expect(run.changes.filter((c) => c.reason === 'measured headroom')).toEqual([]);
	});

	test('a steady judder (one frame in four misses vsync, 50 fps) drops a rung; one in twenty does not', () => {
		let n = 0;
		const judder = (every: number) => (l: GovernorLevel) =>
			l.preset === 'high' && l.scale === 1 ? (++n % every === 0 ? 30 : 12) : 10;
		const g = new QualityGovernor('high');
		play(g, 20, judder(4));
		expect(g.level).not.toEqual(governorLadder('high')[0]!);
		expect(g.history[0]!.reason).toContain('for 5 s');
		const h = new QualityGovernor('high');
		const run = play(h, 20, judder(20));
		expect(run.changes).toEqual([]);
	});

	test('a stutter no level fixes (one frame in five slow at every level) stops after one judder drop, no 30 lock', () => {
		let n = 0;
		const g = new QualityGovernor('high');
		const run = play(g, 120, () => (++n % 5 === 0 ? 30 : 8));
		const judders = run.changes.filter((c) => c.reason.includes('for 5 s'));
		// one resolution step, one preset step, then it holds
		expect(judders.length).toBeLessThanOrEqual(2);
		expect(g.level.preset).not.toBe('low');
		expect(g.isLockedTo30).toBe(false);
		expect(g.history.some((h) => h.reason.includes('not the graphics'))).toBe(true);
	});

	test('a judder the resolution does not fix but the next preset does: high 85 % then medium', () => {
		let n = 0;
		// high misses one frame in eight at any scale (its shadow map and part detail), medium none
		const g = new QualityGovernor('high');
		const run = play(g, 60, (l) => (l.preset === 'high' ? (++n % 8 === 0 ? 30 : 12) : 10));
		expect(g.level.preset).toBe('medium');
		expect(run.changes.some((c) => c.reason.includes('the resolution did not help'))).toBe(true);
		expect(g.history.some((h) => h.reason.includes('not the graphics'))).toBe(false);
	});
});

describe('plan 373 (ADR 0310): held while the reachable presets warm', () => {
	test('held: paced, no level change however slow; released: it judges again', () => {
		const g = new QualityGovernor('high');
		g.setHeld(true);
		const run = play(g, 20, () => 60);
		expect(run.changes).toEqual([]);
		expect(g.level).toEqual(governorLadder('high')[0]!);
		g.setHeld(false);
		expect(play(g, 20, () => 60).changes.length).toBeGreaterThan(0);
	});
});
