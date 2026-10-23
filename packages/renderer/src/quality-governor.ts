/**
 * Automatic quality governor (plan 039, ADR 0053; rules of plan 253, ADR 0233; 120 Hz: plan 395, ADR
 * 0338): keeps the flight view on a locked 120 fps where the tier and the display have it, else 60
 * (30 where 60 is out of reach). Pure state machine; the host feeds it the
 * rAF interval (`tick`) and applies the level it returns (`Renderer.setPreset`,
 * `Renderer.setRenderScale`).
 *
 * WebGL gives no GPU time, only the frame interval, and a vsync-locked interval cannot show
 * headroom. So it steps down fast (a second of mostly missed vsyncs), and steps back up only on
 * evidence: a measured work time with room to spare, or a scene that changed since the rung above
 * was left, one trial per scene. A failed trial bans that rung for that scene, so there is no
 * repeating stutter of timed retries.
 */
import { HALF_PLANET_SCALE } from './half-res.ts';
import { GRAPHICS_PRESETS, PRESETS, type GraphicsPreset } from './presets.ts';

/**
 * One rung of the ladder: a preset, the fraction of the drawing buffer's side it renders at, and the
 * side of the planet pass relative to that (1, or `HALF_PLANET_SCALE`; plan 050, ADR 0061).
 */
export interface GovernorLevel {
	preset: GraphicsPreset;
	scale: number;
	planetScale: number;
	/**
	 * The TAAU input scale this rung draws the 3D image at (plan 395): 0 is native, none follows the
	 * preset. Changing it builds no pipeline.
	 */
	taau?: number;
}

/**
 * The steps tried inside each preset before the next preset down (the last preset goes lower): the
 * whole frame at full size, at 0.85, then the planet pass at half size (measured on the M5 at the pad:
 * about as cheap as drawing everything at 0.7, with the vessel and the HUD still sharp), then that at 0.7.
 */
export const GOVERNOR_STEPS: readonly { scale: number; planetScale: number }[] = [
	{ scale: 1, planetScale: 1 },
	{ scale: 0.85, planetScale: 1 },
	{ scale: 1, planetScale: HALF_PLANET_SCALE },
	{ scale: 0.7, planetScale: HALF_PLANET_SCALE }
];
export const GOVERNOR_FLOOR_STEPS: readonly { scale: number; planetScale: number }[] = [
	...GOVERNOR_STEPS,
	{ scale: 0.55, planetScale: HALF_PLANET_SCALE }
];

/**
 * The lowest render scale a preset above the last one is drawn at (plan 362, ADR 0304): below it the
 * next preset down comes first. A preset's costs that do not follow the pixels (the shadow map, part
 * detail, the march steps, the vegetation) stay at any scale, so `high` at 55 % could read 25 fps where
 * `medium` at full size read 100 (the owner's M5 in orbit).
 */
export const PRESET_FLOOR_SCALE = 0.85;

/**
 * The TAAU input scales the 120 Hz ladder walks inside a preset, from native down (plan 395, ADR 0338),
 * the lowest inside a preset above the last and the lowest of the last. Measured on the M5 (plan 393),
 * `high` gains little under 0.6 (its cost is not the pixels), so the next preset comes first there.
 */
export const TAAU_SCALES: readonly number[] = [0, 0.75, 0.6, 0.5];
export const TAAU_PRESET_FLOOR = 0.6;
export const TAAU_FLOOR = 0.5;

/** The rungs of one preset on the TAAU axis, best first; a preset without the post pipeline has none. */
export function taauRungs(preset: GraphicsPreset, last: boolean): number[] {
	if (!PRESETS[preset].post) return [];
	const own = PRESETS[preset].taau;
	const res = (t: number): number => (t > 0 ? t : 1);
	const floor = last ? TAAU_FLOOR : TAAU_PRESET_FLOOR;
	const out = TAAU_SCALES.filter((t) => res(t) <= res(own) + 1e-6 && res(t) >= floor - 1e-6);
	return out.length > 0 ? out : [own];
}

/** The size of the 3D image relative to the drawing buffer's side at a rung. */
export const rungResolution = (level: Pick<GovernorLevel, 'scale' | 'taau'>): number =>
	level.scale * (level.taau !== undefined && level.taau > 0 ? level.taau : 1);

/**
 * The rungs from the player's preset down: resolution first down to `PRESET_FLOOR_SCALE` (cheap, no
 * recompile), then the next preset at full resolution; only the last preset goes lower. The player's
 * choice is the ceiling; the governor never goes above it. `halfPlanet: false` (no float render
 * targets) leaves out the rungs that need the half-resolution pass.
 */
export function governorLadder(
	ceiling: GraphicsPreset,
	halfPlanet = true,
	budgetedPlanet = 1,
	/**
	 * false: resolution only, never a lower preset (plan 261's WebGPU, before its presets were warmed
	 * at load; plan 362 turned preset steps back on there). Kept for tests and a backend that cannot warm.
	 */
	presetSteps = true,
	/** true: WebGPU's TAAU scale is the fast axis inside each preset that has the post pipeline (plan 395) */
	taau = false
): GovernorLevel[] {
	// plan 253: when the pixel budget already draws the planet pass near half size (a Retina screen,
	// plan 252), the half rung would save almost nothing: the steps are resolution only
	if (budgetedPlanet <= BUDGETED_NEAR_HALF) halfPlanet = false;
	const from = GRAPHICS_PRESETS.indexOf(ceiling);
	const presets = presetSteps ? GRAPHICS_PRESETS.slice(0, from + 1).reverse() : [ceiling];
	const out: GovernorLevel[] = [];
	presets.forEach((preset, i) => {
		const last = i === presets.length - 1;
		const rungs = taau ? taauRungs(preset, last) : [];
		if (rungs.length > 0) {
			for (const t of rungs) out.push({ preset, scale: 1, planetScale: 1, taau: t });
			return;
		}
		for (const step of last ? GOVERNOR_FLOOR_STEPS : GOVERNOR_STEPS) {
			if (!last && step.scale < PRESET_FLOOR_SCALE) continue;
			if (halfPlanet || step.planetScale === 1) out.push({ preset, ...step });
		}
	});
	return out;
}

/** At or under this planet scale the pixel budget has the pass about as small as its half rung. */
export const BUDGETED_NEAR_HALF = HALF_PLANET_SCALE * 1.25;

/** The display rates the cadence estimate snaps to, Hz. */
const DISPLAY_RATES = [30, 60, 90, 120, 144] as const;

/** A coarse relative cost of drawing a level, by pixels (resolution squared, the planet pass half the work). */
const PRESET_COST: Record<GraphicsPreset, number> = { high: 1, medium: 0.7, low: 0.5 };
export function levelCost(level: GovernorLevel): number {
	const own = level.taau ?? 0;
	const r = own > 0 ? own : 1;
	return (
		PRESET_COST[level.preset] *
		level.scale *
		level.scale *
		r *
		r *
		(0.3 + 0.7 * level.planetScale * level.planetScale)
	);
}

/**
 * The scene the governor judges a rung in (plan 253): a rung that failed a trial is not tried again
 * until this changes. Body, altitude band (ground, air, upper air, space) and map or flight view.
 */
export function sceneKeyOf(input: {
	body: string;
	altitude: number;
	atmosphereTop?: number;
	map?: boolean;
}): string {
	const top = input.atmosphereTop ?? 25_000;
	const band =
		input.altitude < 2_000
			? 'ground'
			: input.altitude < top * 0.3
				? 'air'
				: input.altitude < top
					? 'upper'
					: 'space';
	return `${input.body}:${band}:${input.map ? 'map' : 'flight'}`;
}

export interface GovernorConfig {
	/** A frame is over when its interval exceeds the budget by this factor (a missed vsync). */
	overFactor: number;
	/** Half the frames of this long over drops a rung, s. */
	dropWindowSeconds: number;
	/** The share of frames in the drop window that must be over. */
	dropShare: number;
	/**
	 * A steady judder drops one rung too (plan 362): this share of frames over budget across
	 * `sustainedSeconds`. One frame in ten missing vsync is a visible stutter (54 fps), which the
	 * half-of-a-second rule never saw (the M2 sat at `high` drawing 50 to 54 fps where `medium` held 60).
	 */
	sustainedShare: number;
	/** The same at a 120 Hz lock, where the wave target is p95 within one slot (5 % over), plan 395. */
	sustainedShare120: number;
	sustainedSeconds: number;
	/** A p95 interval above this many budgets drops two rungs. */
	heavyFactor: number;
	/** Frames are ignored this long after a rung change inside a preset (buffer reallocation), s. */
	settleSeconds: number;
	/** And after a preset change or at the start (shader compiles), s. */
	presetSettleSeconds: number;
	/** Stepping up needs this many clean seconds, s. */
	headroomSeconds: number;
	/** No step up sooner than this after any change, s. */
	minUpGapSeconds: number;
	/** A step up that falls over budget within this long is a failed trial, s. */
	probeSeconds: number;
	/** Measured work times must stay under this share of the budget at the rung above (preset change: `presetUpFraction`). */
	upFraction: number;
	presetUpFraction: number;
	/** Intervals longer than this (hidden tab, breakpoint, pause) are not frames, ms. */
	ignoreOverMs: number;
	/** A preset change waits at least this long after the last one, either way, s (plan 201). */
	presetDwellSeconds: number;
	/** At the floor and still slow this long locks the target to 30, s. */
	lockSeconds: number;
	/** Locked to 60 from a 120 target: no look at 120 again sooner than this, s (plan 395). */
	unlockSeconds: number;
	/** The display rate is estimated over this many seconds of rAF intervals. */
	cadenceSeconds: number;
}

export const DEFAULT_GOVERNOR: GovernorConfig = {
	overFactor: 1.15,
	dropWindowSeconds: 1,
	dropShare: 0.5,
	sustainedShare: 0.1,
	sustainedShare120: 0.06,
	sustainedSeconds: 5,
	heavyFactor: 2,
	settleSeconds: 1,
	presetSettleSeconds: 2,
	headroomSeconds: 8,
	minUpGapSeconds: 30,
	probeSeconds: 6,
	upFraction: 0.8,
	presetUpFraction: 0.6,
	ignoreOverMs: 250,
	presetDwellSeconds: 30,
	lockSeconds: 5,
	cadenceSeconds: 5,
	unlockSeconds: 60
};

/** One change the governor made, for Debug (plan 253). */
export interface GovernorChange {
	/** Seconds of judged play since the governor started. */
	at: number;
	level: GovernorLevel;
	reason: string;
}

/** What one rAF asks of the page. */
export interface GovernorTick {
	/** Draw this frame (false: skip it, pacing a faster display down to the target). */
	render: boolean;
	/** The new level when it changed, else null. */
	level: GovernorLevel | null;
}

interface Sample {
	/** Seconds the sample covers (its interval). */
	dt: number;
	ms: number;
	work: number | null;
}

const quantile = (values: number[], q: number): number => {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
};

export class QualityGovernor {
	private ladder: GovernorLevel[];
	private index = 0;
	private enabled = true;
	private samples: Sample[] = [];
	private settle: number;
	private clock = 0;
	private lastChangeAt = Infinity;
	private sincePreset = Infinity;
	private scene = '';
	/** The scene a rung was left in, by ladder index: the rung above is retried only when it differs. */
	private leftIn = new Map<number, string>();
	/** Rungs that failed a trial, with the scene they failed in. */
	private bans = new Map<number, string>();
	/** The rung a step up is on trial at, and when it began (s). */
	private trial: { rung: number; since: number } | null = null;
	private locked30 = false;
	/** 120 was out of reach at the lowest rung: the target is 60 until evidence says otherwise (plan 395). */
	private locked60 = false;
	private lock60At = 0;
	private lock60Scene = '';
	/** A step back to 120 on trial, and the scene a failed one is banned in. */
	private trial120: { since: number; scene: string } | null = null;
	private ban120: string | null = null;
	private slowAtFloor = 0;
	private displayRaf: number[] = [];
	private measuredHz = 60;
	/**
	 * The highest display rate the cadence estimate ever showed, 100 or more (plan 395): frames that take
	 * longer than a slot of a 120 Hz screen stretch the rAF intervals, and a 12 ms frame on that screen
	 * reads as a 60 Hz one, and a 60 lock drawing every second rAF reads it the same. The peak holds for the
	 * session (a display found to run at 30 Hz resets it).
	 */
	private displayPeak = 0;
	private get displayHz(): number {
		return this.throttled30 ? this.measuredHz : Math.max(this.measuredHz, this.displayPeak);
	}
	/** The display was found to run at 30 Hz (a throttle): the target follows it and quality stays. */
	private throttled30 = false;
	/** Consecutive drops that left the interval at about 33 ms: four, across a preset, say the display is the limit. */
	private ceiling: GraphicsPreset;
	private noEffect: { from: number; drops: number } | null = null;
	private sinceRender = 0;
	private changes: GovernorChange[] = [];

	constructor(
		ceiling: GraphicsPreset,
		private readonly config: GovernorConfig = DEFAULT_GOVERNOR,
		private readonly halfPlanet = true,
		/** false: the governor changes resolution only, never the preset (`governorLadder`). */
		private readonly presetSteps = true,
		/**
		 * `taau`: the TAAU scale is the fast axis (WebGPU; only worth it where the tier locks at 120).
		 * `maxHz`: the most the device tier and the browser are asked to lock at (Safari: 60).
		 */
		private readonly options: { taau?: boolean; maxHz?: 120 | 60 | 30 } = {}
	) {
		this.ceiling = ceiling;
		this.ladder = governorLadder(ceiling, halfPlanet, 1, presetSteps, options.taau === true);
		this.settle = config.presetSettleSeconds;
	}

	private budgetedPlanet = 1;

	/**
	 * What the planet pass draws at full quality (plan 252's pixel budget on this screen): near half
	 * size, the half rungs are left out. Applies while the governor is still at the top.
	 */
	setBudgetedPlanetScale(scale: number): void {
		const near = scale <= BUDGETED_NEAR_HALF;
		if (near === this.budgetedPlanet <= BUDGETED_NEAR_HALF) {
			this.budgetedPlanet = scale;
			return;
		}
		this.budgetedPlanet = scale;
		if (this.index !== 0) return;
		this.ladder = governorLadder(
			this.ceiling,
			this.halfPlanet,
			scale,
			this.presetSteps,
			this.options.taau === true
		);
	}

	/** How many rungs the ladder has (tests, Debug). */
	get ladderLength(): number {
		return this.ladder.length;
	}

	/** The level the host should be drawing at. */
	get level(): GovernorLevel {
		return this.ladder[this.index]!;
	}

	get isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * The highest drawing rate (plan 362, ADR 0304): null draws at the display's rate (as with the
	 * governor off), 60 or 30 pace the drawing down to it. The quality target stays 60, or the cap below it.
	 */
	private cap: number | null = 60;

	/** The player's frame-rate limit: null (the display's rate), 60 or 30. */
	setFrameCap(fps: number | null): void {
		this.cap = fps !== null && Number.isFinite(fps) && fps > 0 ? fps : null;
	}

	get frameCap(): number | null {
		return this.cap;
	}

	/** What the tier and the display allow before the player's cap: 120 on a 120 Hz screen of a 120 tier, else 60. */
	private get baseHz(): 120 | 60 {
		return (this.options.maxHz ?? 60) >= 120 && !this.locked60 && this.displayHz >= 100 ? 120 : 60;
	}

	/** The frame rate held: 120 or 60 (or the cap below it), or 30 when locked. */
	get targetFps(): number {
		if (this.locked30 || this.throttled30) return 30;
		const base = this.baseHz;
		return this.cap !== null && this.cap < base ? this.cap : base;
	}

	/** The rate frames are drawn at: the cap (the display's rate when none), or the target when locked below it. */
	get paceFps(): number {
		const target = this.targetFps;
		if (target < 60) return target;
		if (this.locked60) return Math.min(60, this.cap ?? 60);
		return Math.min(this.cap ?? this.displayHz, this.displayHz);
	}

	/** 120 was out of reach and the target fell to 60 (plan 395). */
	get isLockedTo60(): boolean {
		return this.locked60;
	}

	/** The estimated display rate, Hz. */
	get displayRate(): number {
		return this.displayHz;
	}

	/** The budget of one frame, ms. */
	get budgetMs(): number {
		return 1000 / this.targetFps;
	}

	/** Draw every Nth rAF: 2 on a 120 Hz display at 60, or on a 60 Hz display locked to 30. */
	get renderEvery(): number {
		return Math.max(1, Math.round(this.displayHz / this.paceFps));
	}

	get isLockedTo30(): boolean {
		return this.locked30;
	}

	/** The changes so far, oldest first (at most 50), each with its reason. */
	get history(): readonly GovernorChange[] {
		return this.changes;
	}

	/** The player picked a preset: it is the new ceiling and the governor starts again from it. Returns the level to draw. */
	setCeiling(ceiling: GraphicsPreset): GovernorLevel {
		this.ceiling = ceiling;
		this.ladder = governorLadder(
			ceiling,
			this.halfPlanet,
			this.budgetedPlanet,
			this.presetSteps,
			this.options.taau === true
		);
		this.restart();
		return this.level;
	}

	/** Off: always the ceiling at full resolution. On: starts again from the ceiling. Returns the level to draw. */
	setEnabled(enabled: boolean): GovernorLevel {
		this.enabled = enabled;
		this.restart();
		return this.level;
	}

	/**
	 * Start at the highest rung of `level`'s preset at or under its scale (plan 362): the level this
	 * device settled at last time, so a session does not begin with drops. Above it, the rungs are
	 * tried again only with evidence, as after any drop. Returns the level to draw.
	 */
	startAt(level: Pick<GovernorLevel, 'preset' | 'scale' | 'taau'>): GovernorLevel {
		if (!this.enabled) return this.level;
		const want = rungResolution({ scale: level.scale, taau: level.taau });
		const at = this.ladder.findIndex(
			(l) => l.preset === level.preset && rungResolution(l) <= want + 1e-6
		);
		if (at <= 0) return this.level;
		for (let i = 0; i < at; i++) this.leftIn.set(i, this.scene);
		this.index = at;
		return this.level;
	}

	/**
	 * The display's refresh rate as the host measured it at load (`refreshOf`, plan 392), before the
	 * game loaded the machine: a screen of 100 Hz or more is not forgotten when slow frames stretch the
	 * rAF intervals (plan 395).
	 */
	setDisplayHint(hz: number): void {
		if (Number.isFinite(hz) && hz >= 100) this.displayPeak = Math.max(this.displayPeak, hz);
	}

	/** The scene changed or not (altitude band, view, body): see `sceneKeyOf`. */
	setScene(key: string): void {
		this.scene = key;
	}

	private restart(): void {
		this.index = 0;
		this.samples = [];
		this.settle = this.config.presetSettleSeconds;
		this.lastChangeAt = Infinity;
		this.sincePreset = Infinity;
		this.leftIn.clear();
		this.bans.clear();
		this.trial = null;
		this.locked30 = false;
		this.locked60 = false;
		this.trial120 = null;
		this.ban120 = null;
		this.throttled30 = false;
		this.noEffect = null;
		this.slowAtFloor = 0;
		this.sinceRender = 0;
		this.workScale = 1;
		this.judder = null;
		this.judderFutile = null;
	}

	/** The display rate from the fastest quarter of the rAF intervals of the last seconds. */
	private estimateCadence(rafMs: number): void {
		this.displayRaf.push(rafMs);
		let total = 0;
		for (let i = this.displayRaf.length - 1; i >= 0; i--) {
			total += this.displayRaf[i]! / 1000;
			if (total > this.config.cadenceSeconds) {
				this.displayRaf = this.displayRaf.slice(i);
				break;
			}
		}
		if (this.displayRaf.length < 30) return;
		const fast = quantile(this.displayRaf, 0.1);
		const hz = 1000 / fast;
		// the nearest known rate from 60 up by ratio: a slow machine's intervals only ever raise `fast`,
		// and a display that really runs at 30 Hz is told apart by `drop` (quality changes nothing)
		let best: number = DISPLAY_RATES[1];
		for (const rate of DISPLAY_RATES) {
			if (rate < 60) continue;
			if (Math.abs(Math.log(hz / rate)) < Math.abs(Math.log(hz / best))) best = rate;
		}
		this.measuredHz = this.throttled30 ? 30 : best;
		if (best >= 100) this.displayPeak = Math.max(this.displayPeak, best);
	}

	/**
	 * One rAF, `rafMs` after the previous one. Says whether to draw it; a drawn frame is judged by the
	 * time since the previous drawn one. The page calls this on every rAF while the governor is on;
	 * `workMs` is the GPU time per frame where the renderer measures it (WebGPU, plan 261), else omitted.
	 */
	tick(rafMs: number, workMs?: number): GovernorTick {
		if (!Number.isFinite(rafMs) || rafMs <= 0) return { render: true, level: null };
		if (rafMs <= this.config.ignoreOverMs) this.estimateCadence(rafMs);
		this.sinceRender += rafMs;
		// the frame-rate limit paces the drawing with the governor off as well (plan 362)
		const period = 1000 / this.paceFps;
		if (this.sinceRender < 0.9 * period && this.sinceRender <= this.config.ignoreOverMs) {
			return { render: false, level: null };
		}
		const interval = this.sinceRender;
		this.sinceRender = 0;
		return {
			render: true,
			level: this.enabled && !this.held ? this.frame(interval, workMs) : null
		};
	}

	private held = false;

	/**
	 * Held: the drawing is paced but no level changes (plan 373, ADR 0310), while the renderer still
	 * warms the presets the governor can reach. A move before that built the preset's half path and
	 * shadow pipelines in flight (0.6 s at the next sunrise on the M2). Released, it starts judging
	 * afresh after the preset settle time.
	 */
	setHeld(held: boolean): void {
		if (this.held && !held) {
			this.samples = [];
			this.settle = this.config.presetSettleSeconds;
		}
		this.held = held;
	}

	get isHeld(): boolean {
		return this.held;
	}

	/**
	 * A drawn frame took `intervalMs` since the previous drawn one; `workMs` is its own work time when the
	 * page measured it (evidence for stepping up). Returns the new level when it changed, else null.
	 */
	frame(intervalMs: number, workMs?: number): GovernorLevel | null {
		if (!this.enabled || !Number.isFinite(intervalMs) || intervalMs <= 0) return null;
		if (intervalMs > this.config.ignoreOverMs) {
			// not a frame (hidden tab, a pause): wait for the interval to settle again
			this.settle = Math.max(this.settle, this.config.presetSettleSeconds);
			this.samples = [];
			return null;
		}
		const dt = intervalMs / 1000;
		this.clock += dt;
		this.sincePreset += dt;
		this.lastChangeAt += dt;
		if (this.settle > 0) {
			this.settle -= dt;
			return null;
		}
		this.samples.push({ dt, ms: intervalMs, work: workMs ?? null });
		this.trim();
		const budget = this.budgetMs;
		const overMs = budget * this.config.overFactor;
		if (this.trial) {
			// a failed trial bans its rung for this scene (below, in `drop`); a held one is over
			if (this.clock - this.trial.since >= this.config.probeSeconds) this.trial = null;
		}
		if (this.trial120 && this.clock - this.trial120.since >= this.config.probeSeconds * 2)
			this.trial120 = null;
		const recent = this.window(this.config.dropWindowSeconds);
		if (recent.span >= this.config.dropWindowSeconds * 0.9) {
			const over = recent.samples.filter((x) => x.ms > overMs);
			const share = over.length / recent.samples.length;
			if (share >= this.config.dropShare) {
				const p95 = quantile(
					recent.samples.map((x) => x.ms),
					0.95
				);
				const heavy = p95 > budget * this.config.heavyFactor;
				const text = `${Math.round(share * 100)}% of frames over ${overMs.toFixed(1)} ms`;
				return this.drop(heavy ? 2 : 1, heavy ? `p95 ${p95.toFixed(0)} ms, ${text}` : text);
			}
		}
		const steady = this.window(this.config.sustainedSeconds);
		if (steady.span >= this.config.sustainedSeconds * 0.9 && this.judderFutile !== this.scene) {
			const share = steady.samples.filter((x) => x.ms > overMs).length / steady.samples.length;
			const needed =
				this.targetFps >= 120 ? this.config.sustainedShare120 : this.config.sustainedShare;
			if (share >= needed) {
				const text = `${Math.round(share * 100)}% of frames over ${overMs.toFixed(1)} ms for ${this.config.sustainedSeconds} s`;
				// the last judder drop did not cut the missed frames by a quarter (plan 362): after a
				// resolution step, the preset's own costs are the suspects, so the next preset comes
				// next; after a preset step, the stutter is not the graphics' (another process, the
				// browser), and the governor stops lowering for it in this scene
				const last = this.judder;
				if (last && last.scene === this.scene && share >= last.share * 0.75) {
					const next = this.ladder.findIndex(
						(l, i) => i > this.index && l.preset !== this.level.preset
					);
					if (last.samePreset && next > 0) {
						const level = this.jump(next, `${text}; the resolution did not help`);
						if (level) {
							this.judder = { share, scene: this.scene, samePreset: false };
							return level;
						}
						return null;
					}
					this.judderFutile = this.scene;
					this.judder = null;
					this.record(
						this.level,
						`${Math.round(share * 100)}% of frames still over after the last drop: not the graphics, holding`
					);
					return null;
				}
				const from = this.level.preset;
				const level = this.drop(1, text);
				if (level) this.judder = { share, scene: this.scene, samePreset: level.preset === from };
				return level;
			}
		}
		return this.consider(budget);
	}

	/** The samples of the last `seconds` and the time they cover. */
	private window(seconds: number): { samples: Sample[]; span: number } {
		let span = 0;
		let from = this.samples.length;
		while (from > 0 && span < seconds) {
			from--;
			span += this.samples[from]!.dt;
		}
		return { samples: this.samples.slice(from), span };
	}

	private trim(): void {
		const keep =
			Math.max(
				this.config.headroomSeconds,
				this.config.dropWindowSeconds,
				this.config.sustainedSeconds
			) + 1;
		let span = 0;
		let from = this.samples.length;
		while (from > 0 && span < keep) {
			from--;
			span += this.samples[from]!.dt;
		}
		if (from > 0) this.samples = this.samples.slice(from);
	}

	/** Evidence for a step up, or the reason there is none yet. */
	private consider(budget: number): GovernorLevel | null {
		if (this.locked60) {
			const back = this.considerUnlock120();
			if (back) return back;
		}
		if (this.index === 0) {
			this.slowAtFloor = 0;
			return null;
		}
		const up = this.index - 1;
		if (this.lastChangeAt < this.config.minUpGapSeconds) return null;
		const crossing = this.ladder[up]!.preset !== this.level.preset;
		if (crossing && this.sincePreset < this.config.presetDwellSeconds) return null;
		const clean = this.window(this.config.headroomSeconds);
		if (clean.span < this.config.headroomSeconds * 0.95) return null;
		const overMs = budget * this.config.overFactor;
		if (clean.samples.some((x) => x.ms > overMs)) return null;
		const scene = this.scene;
		// a rung that failed in this scene stays banned whatever the work time says: WebGPU's timestamps
		// on Apple GPUs leave out the frame's end (an M2 at Retina: 11 ms measured, 30 fps drawn; plan 261)
		if (this.bans.get(up) === scene) return null;
		// the work-time evidence: room to spare at the rung above
		const works = clean.samples.map((x) => x.work);
		if (works.every((w): w is number => w !== null)) {
			const ratio = levelCost(this.ladder[up]!) / levelCost(this.level);
			const fraction = crossing ? this.config.presetUpFraction : this.config.upFraction;
			if (quantile(works, 0.95) * this.workScale * ratio <= fraction * budget) {
				return this.raise(up, 'measured headroom');
			}
			// not enough by the (calibrated) work time: the scene-change trial below still applies, so a
			// calibration learned in a heavy scene does not hold the level down everywhere (plan 362)
		}
		// no work time: one trial per rung and scene, once the scene is not the one it was left in
		const left = this.leftIn.get(up);
		if (left === undefined || left === scene) return null;
		return this.raise(up, 'scene changed, one trial up');
	}

	/**
	 * Back to a 120 target (plan 395): from the 60 lock, after the dwell, on evidence only. The measured
	 * work at the lowest rung, scaled by what the timestamps under-read, fits the 120 slot's headroom;
	 * or the scene changed since the lock (one look per scene, as for any rung). The step is to the
	 * lowest rung, where 120 is likeliest, and from there the usual evidence climbs; a trial that
	 * misses goes straight back to 60 and is banned in this scene.
	 */
	private considerUnlock120(): GovernorLevel | null {
		if ((this.options.maxHz ?? 60) < 120 || this.displayHz < 100) return null;
		if (this.locked30 || this.throttled30) return null;
		if (this.clock - this.lock60At < this.config.unlockSeconds) return null;
		if (this.ban120 === this.scene) return null;
		const clean = this.window(this.config.headroomSeconds);
		if (clean.span < this.config.headroomSeconds * 0.95) return null;
		const overMs = 1.15 * this.budgetMs;
		if (clean.samples.some((x) => x.ms > overMs)) return null;
		const floor = this.ladder.length - 1;
		const works = clean.samples.map((x) => x.work);
		let evidence = this.scene !== this.lock60Scene;
		if (works.every((w): w is number => w !== null)) {
			const ratio = levelCost(this.ladder[floor]!) / levelCost(this.level);
			evidence ||=
				quantile(works, 0.95) * this.workScale * ratio <= this.config.upFraction * (1000 / 120);
		}
		if (!evidence) return null;
		const from = this.level.preset;
		this.locked60 = false;
		this.trial120 = { since: this.clock, scene: this.scene };
		this.index = floor;
		this.trial = null;
		return this.changed(from, 'headroom for 120 again: one trial at the lowest rung');
	}

	/**
	 * Four drops in a row, across a preset change, that left the interval at about 33 ms did nothing: the
	 * display is running at 30 Hz (iOS Low Power Mode), not the machine. Quality goes back where it was
	 * and 30 is the target.
	 */
	private throttleCheck(): GovernorLevel | null {
		const recent = this.window(this.config.dropWindowSeconds);
		const median = quantile(
			recent.samples.map((x) => x.ms),
			0.5
		);
		if (median < 29 || median > 37) {
			this.noEffect = null;
			return null;
		}
		this.noEffect = {
			from: this.noEffect?.from ?? this.index,
			drops: (this.noEffect?.drops ?? 0) + 1
		};
		// a whole preset of rungs and the next one's first, none of it helping: a CPU-bound machine
		// whose next preset is cheaper is not mistaken for a throttled display
		const crossed = this.ladder[this.noEffect.from]!.preset !== this.level.preset;
		if (this.noEffect.drops < 4 || !crossed) return null;
		const from = this.level.preset;
		this.throttled30 = true;
		this.measuredHz = 30;
		this.displayPeak = 0;
		this.index = this.noEffect.from;
		this.noEffect = null;
		this.trial = null;
		this.leftIn.clear();
		return this.changed(from, 'the display runs at 30 Hz: quality stays, 30 is the target');
	}

	/**
	 * How much the measured work time under-reads the frame (plan 362): the drawn interval over the
	 * work time when frames ran over budget, at least 1. Apple GPUs' timestamps leave out the frame's end
	 * (the M2 in orbit: 9 ms measured, 33 ms drawn), and an uncorrected reading raised the level straight
	 * back into the stall after every drop.
	 */
	private workScale = 1;

	/** The missed-frame share of the last judder drop, its scene and whether it kept the preset (plan 362). */
	private judder: { share: number; scene: string; samePreset: boolean } | null = null;
	/** The scene in which judder drops stopped helping: none until the scene changes. */
	private judderFutile: string | null = null;

	/** Learns `workScale` from the slow frames that caused a drop. */
	private calibrateWork(): void {
		const recent = this.window(this.config.dropWindowSeconds).samples;
		const works = recent.map((x) => x.work).filter((w): w is number => w !== null && w > 0);
		if (works.length < recent.length / 2 || works.length === 0) return;
		const ratio =
			quantile(
				recent.map((x) => x.ms),
				0.5
			) / quantile(works, 0.5);
		if (Number.isFinite(ratio)) this.workScale = Math.max(this.workScale, ratio, 1);
	}

	private drop(rungs: number, reason: string): GovernorLevel | null {
		this.calibrateWork();
		if (this.trial120) {
			// the step back to 120 missed: 60 again, and no new look in this scene
			this.ban120 = this.trial120.scene;
			this.trial120 = null;
			return this.lockTo60(`the trial at 120 missed (${reason}): back to 60`);
		}
		if (!this.throttled30 && !this.locked30 && this.index < this.ladder.length - 1) {
			const restored = this.throttleCheck();
			if (restored) return restored;
		}
		if (this.trial) {
			// the trial failed: ban its rung until the scene changes, and go back exactly one rung
			this.bans.set(this.trial.rung, this.scene);
			this.trial = null;
			rungs = 1;
			reason = `trial failed (${reason}): back one rung, banned in this scene`;
		}
		if (this.index >= this.ladder.length - 1) {
			// the floor: still slow for a while locks the target to 30 where the display can
			this.slowAtFloor += this.config.dropWindowSeconds;
			if (this.baseHz === 120 && this.slowAtFloor >= this.config.lockSeconds) {
				return this.lockTo60('locked to 60 fps: 120 is out of reach at the lowest rung');
			}
			if (!this.locked30 && this.slowAtFloor >= this.config.lockSeconds && this.displayHz >= 60) {
				this.locked30 = true;
				this.samples = [];
				this.settle = this.config.settleSeconds;
				this.leftIn.clear();
				this.bans.clear();
				// a new budget is a new scene: the rungs may be tried again
				for (let i = 0; i < this.ladder.length - 1; i++) this.leftIn.set(i, `${this.scene}|60`);
				this.scene = `${this.scene}|30`;
				this.record(this.level, 'locked to 30 fps: 60 is out of reach at the lowest rung');
				return this.level;
			}
			this.samples = [];
			this.settle = this.config.settleSeconds;
			return null;
		}
		let moved = 0;
		const from = this.level.preset;
		for (let i = 0; i < rungs && this.index < this.ladder.length - 1; i++) {
			const next = this.ladder[this.index + 1]!;
			if (next.preset !== this.level.preset && this.sincePreset < this.config.presetDwellSeconds)
				break;
			this.leftIn.set(this.index, this.scene);
			this.index += 1;
			moved += 1;
		}
		if (moved === 0) {
			// over budget a while longer, then again (the preset dwell)
			this.samples = [];
			this.settle = this.config.settleSeconds / 2;
			return null;
		}
		return this.changed(from, moved === 2 && rungs === 2 ? `${reason}: dropped two rungs` : reason);
	}

	/** The target falls from 120 to 60 at the rung it is on; the rungs above are tried again on evidence. */
	private lockTo60(reason: string): GovernorLevel {
		this.locked60 = true;
		this.lock60At = this.clock;
		this.lock60Scene = this.scene;
		this.samples = [];
		this.settle = this.config.settleSeconds;
		this.slowAtFloor = 0;
		this.leftIn.clear();
		this.bans.clear();
		this.trial = null;
		this.judder = null;
		for (let i = 0; i < this.index; i++) this.leftIn.set(i, `${this.scene}|120`);
		this.record(this.level, reason);
		return this.level;
	}

	/** Down to rung `to` at once (another preset), within the preset dwell; null when the dwell holds it. */
	private jump(to: number, reason: string): GovernorLevel | null {
		if (this.sincePreset < this.config.presetDwellSeconds) return null;
		const from = this.level.preset;
		for (let i = this.index; i < to; i++) this.leftIn.set(i, this.scene);
		this.index = to;
		this.trial = null;
		return this.changed(from, reason);
	}

	private raise(up: number, reason: string): GovernorLevel {
		const from = this.level.preset;
		this.index = up;
		this.trial = { rung: up, since: this.clock };
		return this.changed(from, reason);
	}

	private changed(from: GraphicsPreset, reason: string): GovernorLevel {
		const preset = from !== this.level.preset;
		if (preset) this.sincePreset = 0;
		this.lastChangeAt = 0;
		this.settle = preset ? this.config.presetSettleSeconds : this.config.settleSeconds;
		this.samples = [];
		this.slowAtFloor = 0;
		this.judder = null;
		this.record(this.level, reason);
		return this.level;
	}

	private record(level: GovernorLevel, reason: string): void {
		this.changes.push({ at: this.clock, level, reason });
		if (this.changes.length > 50) this.changes.shift();
	}
}
