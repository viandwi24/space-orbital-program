/**
 * The performance gate's numbers (plan 411): what a scene run is summarised to, the budgets it is
 * held to, and the table that is printed. Pure: `scripts/perf-gate.ts` drives the browser and calls
 * this; the unit test covers the comparison.
 */

/** A device tier and the frame it is held to (ADR 0330): the M5 locks 120, the base M2 and mid-range Windows 60. */
export const TIERS = {
	m5: { label: 'M5 MacBook Pro', targetHz: 120 },
	m2: { label: 'base M2', targetHz: 60 },
	windows: { label: 'mid-range Windows', targetHz: 60 }
} as const;
export type TierId = keyof typeof TIERS;

export const SCENES = [
	'pad',
	'3km',
	'12km',
	'sea',
	'orbit',
	're-entry',
	'space-center',
	'hangar'
] as const;
export type SceneId = (typeof SCENES)[number];

/** The scenes of `--quick`, for the owner to run on a device: the three that tell most. */
export const QUICK_SCENES: readonly SceneId[] = ['pad', 'orbit', 'space-center'];

export type Backend = 'webgpu' | 'webgl';

/** What one scene run, on one backend and governor setting, measured. */
export interface SceneRun {
	scene: SceneId;
	backend: Backend;
	governor: 'off' | 'on';
	/** Frames sampled and the seconds they cover. */
	frames: number;
	seconds: number;
	/** Frame interval percentiles, ms. */
	p50: number;
	p95: number;
	/** Frames over twice the target interval, per minute. */
	longPerMinute: number;
	/** Pipelines compiled while sampling (after the load). */
	compilesInPlay: number;
	/** The JS heap over the run, MB. */
	heapMin: number;
	heapMax: number;
}

/** The limits of one scene. A field left out is not held. */
export interface SceneBudget {
	/** Frame interval p95, ms: the tier's interval; the margin lies over it. */
	p95Ms?: number;
	/** Frames over twice the interval, per minute. */
	longPerMinute?: number;
	/** Pipelines compiled in play. */
	compilesInPlay?: number;
	/** Heap max less heap min, MB. */
	heapRangeMb?: number;
}

/** The limits of a soak (plan 418, ADR 0375): stability over minutes, not the frame interval of seconds. */
export interface SoakBudget {
	/** Growth of the heap's floor (the lowest heap of the last quarter less that of the first quarter), MB. */
	heapGrowthMb?: number;
	/** Allocation rate, MB per second. */
	allocMbPerS?: number;
	/** Major (mark-compact) garbage collections a minute. */
	majorGcPerMinute?: number;
	/** Frames over twice the target interval, per minute. */
	longPerMinute?: number;
}

export interface Budgets {
	/** `target`: derived from the tier's frame interval (ADR 0330); `measured`: frozen from a run with `--freeze`. */
	basis: 'target' | 'measured';
	/** Allowed excess over a time or heap budget before the gate fails, as a share (0.1 = 10 %). */
	margin: number;
	tiers: Partial<
		Record<
			TierId,
			{
				default: SceneBudget;
				scenes?: Partial<Record<SceneId, SceneBudget>>;
				/** The soak limits; `default` holds for a soak scene without its own. */
				soak?: { default: SoakBudget; scenes?: Partial<Record<SoakSceneId, SoakBudget>> };
			}
		>
	>;
}

/** The nearest-rank percentile (0..1) of `values`; 0 for none. */
export function percentile(values: readonly number[], p: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.max(0, Math.ceil(Math.min(Math.max(p, 0), 1) * sorted.length) - 1)]!;
}

/** The summary of `intervals` (ms between frames) sampled over `seconds` for a display held to `targetHz`. */
export function summarizeFrames(
	intervals: readonly number[],
	seconds: number,
	targetHz: number
): Pick<SceneRun, 'frames' | 'seconds' | 'p50' | 'p95' | 'longPerMinute'> {
	const long = (2 * 1000) / targetHz;
	const over = intervals.filter((x) => x > long).length;
	return {
		frames: intervals.length,
		seconds,
		p50: percentile(intervals, 0.5),
		p95: percentile(intervals, 0.95),
		longPerMinute: seconds > 0 ? (over * 60) / seconds : 0
	};
}

/** The budget of `scene` on `tier`: the tier's default with the scene's own limits over it. */
export function budgetFor(budgets: Budgets, tier: TierId, scene: SceneId): SceneBudget {
	const t = budgets.tiers[tier];
	return { ...(t?.default ?? {}), ...(t?.scenes?.[scene] ?? {}) };
}

/** Why `run` is over its budget, one line each; empty when it passes. */
export function failures(run: SceneRun, budget: SceneBudget, margin: number): string[] {
	const out: string[] = [];
	const slack = 1 + margin;
	if (budget.p95Ms !== undefined && run.p95 > budget.p95Ms * slack)
		out.push(`p95 ${run.p95.toFixed(1)} ms is over ${(budget.p95Ms * slack).toFixed(1)} ms`);
	if (budget.longPerMinute !== undefined && run.longPerMinute > budget.longPerMinute)
		out.push(
			`${run.longPerMinute.toFixed(1)} long frames a minute, budget ${budget.longPerMinute}`
		);
	if (budget.compilesInPlay !== undefined && run.compilesInPlay > budget.compilesInPlay)
		out.push(`${run.compilesInPlay} pipelines compiled in play, budget ${budget.compilesInPlay}`);
	if (budget.heapRangeMb !== undefined && run.heapMax - run.heapMin > budget.heapRangeMb * slack)
		out.push(
			`heap range ${(run.heapMax - run.heapMin).toFixed(0)} MB is over ${(budget.heapRangeMb * slack).toFixed(0)} MB`
		);
	return out;
}

/** The budgets a run freezes: what it measured, with the tier's interval as a floor so a lucky scene is not held to its luck. */
export function freeze(runs: readonly SceneRun[], tier: TierId, margin: number): Budgets {
	const targetMs = 1000 / TIERS[tier].targetHz;
	const scenes: Partial<Record<SceneId, SceneBudget>> = {};
	for (const r of runs) {
		const old = scenes[r.scene];
		const p95Ms = Math.max(old?.p95Ms ?? 0, r.p95, targetMs);
		scenes[r.scene] = {
			p95Ms: Math.round(p95Ms * 10) / 10,
			longPerMinute: Math.max(old?.longPerMinute ?? 0, Math.ceil(r.longPerMinute)),
			compilesInPlay: Math.max(old?.compilesInPlay ?? 0, r.compilesInPlay),
			heapRangeMb: Math.max(old?.heapRangeMb ?? 0, Math.ceil(r.heapMax - r.heapMin))
		};
	}
	return { basis: 'measured', margin, tiers: { [tier]: { default: {}, scenes } } };
}

/** The table the gate prints (and `--quick` for the owner to paste back). */
export function formatTable(
	runs: readonly SceneRun[],
	check: (run: SceneRun) => string[] = () => []
): string {
	const head = [
		'scene',
		'backend',
		'governor',
		'frames',
		'p50 ms',
		'p95 ms',
		'long/min',
		'compiles',
		'heap MB',
		'result'
	];
	const rows = runs.map((r) => {
		const bad = check(r);
		return [
			r.scene,
			r.backend,
			r.governor,
			String(r.frames),
			r.p50.toFixed(1),
			r.p95.toFixed(1),
			r.longPerMinute.toFixed(1),
			String(r.compilesInPlay),
			`${r.heapMin.toFixed(0)}-${r.heapMax.toFixed(0)}`,
			bad.length === 0 ? 'ok' : `FAIL: ${bad.join('; ')}`
		];
	});
	const width = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]!.length)));
	const line = (cells: string[]) => cells.map((c, i) => c.padEnd(width[i]!)).join(' | ');
	return [line(head), width.map((w) => '-'.repeat(w)).join('-|-'), ...rows.map(line)].join('\n');
}

// ---- the soak (plan 418)

/** The scenes of `--soak`: about three minutes each at the pad, in orbit, on an ascent, and at the Space Center. */
export const SOAK_SCENES = ['pad', 'orbit', 'ascent', 'space-center'] as const;
export type SoakSceneId = (typeof SOAK_SCENES)[number];

/** One garbage collection from the browser's trace: the heap before and after, MB. */
export interface GcEvent {
	major: boolean;
	beforeMb: number;
	afterMb: number;
}

/** What one soak run measured. */
export interface SoakRun {
	scene: SoakSceneId;
	backend: Backend;
	governor: 'off' | 'on';
	seconds: number;
	frames: number;
	meanMs: number;
	/** Share of frames over the target interval, 0..1. */
	overIntervalShare: number;
	heapGrowthMb: number;
	allocMbPerS: number;
	majorGcs: number;
	minorGcs: number;
	majorGcPerMinute: number;
	longPerMinute: number;
	/** The longest frame interval, ms. */
	maxMs: number;
}

/** The lowest value of `values`; 0 for none. */
function lowest(values: readonly number[]): number {
	let low = Infinity;
	for (const v of values) if (v < low) low = v;
	return low === Infinity ? 0 : low;
}

/**
 * The soak summary. `heapMb` is the heap sampled at a fixed step; `gcs` are the collections of the
 * run, when the trace gave them. The allocation rate is what the heap rose by between collections:
 * from the collections themselves when there are some (the heap before one less the heap after the
 * last), else from the rises of the samples (a floor: a collection inside one sample hides its rise).
 */
export function summarizeSoak(input: {
	scene: SoakSceneId;
	backend: Backend;
	governor: 'off' | 'on';
	intervals: readonly number[];
	heapMb: readonly number[];
	seconds: number;
	targetHz: number;
	gcs?: readonly GcEvent[];
}): SoakRun {
	const { intervals, heapMb, seconds, targetHz } = input;
	const gcs = input.gcs ?? [];
	const frame = 1000 / targetHz;
	const quarter = Math.max(1, Math.floor(heapMb.length / 4));
	const growth =
		heapMb.length < 8 ? 0 : lowest(heapMb.slice(-quarter)) - lowest(heapMb.slice(0, quarter));
	let allocated = 0;
	if (gcs.length > 0) {
		let floor = heapMb[0] ?? gcs[0]!.beforeMb;
		for (const g of gcs) {
			allocated += Math.max(0, g.beforeMb - floor);
			floor = g.afterMb;
		}
		allocated += Math.max(0, (heapMb.at(-1) ?? floor) - floor);
	} else {
		for (let i = 1; i < heapMb.length; i++) allocated += Math.max(0, heapMb[i]! - heapMb[i - 1]!);
	}
	const major = gcs.filter((g) => g.major).length;
	const minutes = seconds / 60;
	let sum = 0;
	let max = 0;
	let long = 0;
	let over = 0;
	for (const x of intervals) {
		sum += x;
		if (x > max) max = x;
		if (x > 2 * frame) long++;
		// a frame a vsync late reads a little over the interval
		if (x > frame * 1.1) over++;
	}
	return {
		scene: input.scene,
		backend: input.backend,
		governor: input.governor,
		seconds,
		frames: intervals.length,
		meanMs: intervals.length === 0 ? 0 : sum / intervals.length,
		overIntervalShare: intervals.length === 0 ? 0 : over / intervals.length,
		heapGrowthMb: growth,
		allocMbPerS: seconds > 0 ? allocated / seconds : 0,
		majorGcs: major,
		minorGcs: gcs.length - major,
		majorGcPerMinute: minutes > 0 ? major / minutes : 0,
		longPerMinute: minutes > 0 ? long / minutes : 0,
		maxMs: max
	};
}

/** The soak budget of `scene` on `tier`: the tier's soak default with the scene's own limits over it. */
export function soakBudgetFor(budgets: Budgets, tier: TierId, scene: SoakSceneId): SoakBudget {
	const t = budgets.tiers[tier]?.soak;
	return { ...(t?.default ?? {}), ...(t?.scenes?.[scene] ?? {}) };
}

/** Why a soak run is over its budget, one line each; empty when it passes. The margin lies over the heap and the rate, not the counts. */
export function soakFailures(run: SoakRun, budget: SoakBudget, margin: number): string[] {
	const out: string[] = [];
	const slack = 1 + margin;
	if (budget.heapGrowthMb !== undefined && run.heapGrowthMb > budget.heapGrowthMb * slack)
		out.push(
			`heap floor grew ${run.heapGrowthMb.toFixed(1)} MB, budget ${(budget.heapGrowthMb * slack).toFixed(1)} MB`
		);
	if (budget.allocMbPerS !== undefined && run.allocMbPerS > budget.allocMbPerS * slack)
		out.push(
			`allocation ${run.allocMbPerS.toFixed(1)} MB/s is over ${(budget.allocMbPerS * slack).toFixed(1)} MB/s`
		);
	if (budget.majorGcPerMinute !== undefined && run.majorGcPerMinute > budget.majorGcPerMinute)
		out.push(
			`${run.majorGcPerMinute.toFixed(1)} major GCs a minute, budget ${budget.majorGcPerMinute}`
		);
	if (budget.longPerMinute !== undefined && run.longPerMinute > budget.longPerMinute)
		out.push(
			`${run.longPerMinute.toFixed(1)} long frames a minute, budget ${budget.longPerMinute}`
		);
	return out;
}

/** The soak budgets a set of runs freezes: what they measured, rounded up. */
export function freezeSoak(runs: readonly SoakRun[]): Partial<Record<SoakSceneId, SoakBudget>> {
	const scenes: Partial<Record<SoakSceneId, SoakBudget>> = {};
	for (const r of runs) {
		const old = scenes[r.scene];
		scenes[r.scene] = {
			heapGrowthMb: Math.max(old?.heapGrowthMb ?? 0, Math.ceil(Math.max(0, r.heapGrowthMb))),
			allocMbPerS: Math.max(old?.allocMbPerS ?? 0, Math.ceil(r.allocMbPerS)),
			majorGcPerMinute: Math.max(old?.majorGcPerMinute ?? 0, Math.ceil(r.majorGcPerMinute)),
			longPerMinute: Math.max(old?.longPerMinute ?? 0, Math.ceil(r.longPerMinute))
		};
	}
	return scenes;
}

/** The table the soak prints. */
export function formatSoakTable(
	runs: readonly SoakRun[],
	check: (run: SoakRun) => string[] = () => []
): string {
	const head = [
		'scene',
		'backend',
		'governor',
		's',
		'mean ms',
		'over interval',
		'max ms',
		'heap growth MB',
		'alloc MB/s',
		'major GC',
		'minor GC',
		'long/min',
		'result'
	];
	const rows = runs.map((r) => {
		const bad = check(r);
		return [
			r.scene,
			r.backend,
			r.governor,
			r.seconds.toFixed(0),
			r.meanMs.toFixed(2),
			`${(r.overIntervalShare * 100).toFixed(1)} %`,
			r.maxMs.toFixed(0),
			r.heapGrowthMb.toFixed(1),
			r.allocMbPerS.toFixed(1),
			String(r.majorGcs),
			String(r.minorGcs),
			r.longPerMinute.toFixed(1),
			bad.length === 0 ? 'ok' : `FAIL: ${bad.join('; ')}`
		];
	});
	const width = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]!.length)));
	const line = (cells: string[]) => cells.map((c, i) => c.padEnd(width[i]!)).join(' | ');
	return [line(head), width.map((w) => '-'.repeat(w)).join('-|-'), ...rows.map(line)].join('\n');
}
