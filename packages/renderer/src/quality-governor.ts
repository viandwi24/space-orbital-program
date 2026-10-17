/**
 * Automatic quality governor (plan 039, ADR 0053): keeps the flight view near 60 fps on machines
 * slower than the ones the presets were tuned on. Pure state machine; the host feeds it the time
 * between frames and applies the level it returns (`Renderer.setPreset`, `Renderer.setRenderScale`).
 *
 * The browser gives no GPU time, only the frame interval, and a vsync-locked interval cannot show
 * headroom. So it steps down when the smoothed interval stays over budget, and steps back up by
 * trial: after a calm spell it tries the next level up, and if that falls over budget again within
 * the probe window the calm spell required for the next trial doubles (up to a cap).
 */
import { HALF_PLANET_SCALE } from './half-res.ts';
import { GRAPHICS_PRESETS, type GraphicsPreset } from './presets.ts';

/**
 * One rung of the ladder: a preset, the fraction of the drawing buffer's side it renders at, and the
 * side of the planet pass relative to that (1, or `HALF_PLANET_SCALE`; plan 050, ADR 0061).
 */
export interface GovernorLevel {
	preset: GraphicsPreset;
	scale: number;
	planetScale: number;
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
 * The rungs from the player's preset down: resolution first (cheap, no recompile), then the next
 * preset at full resolution. The player's choice is the ceiling; the governor never goes above it.
 * `halfPlanet: false` (no float render targets) leaves out the rungs that need the half-resolution pass.
 */
export function governorLadder(ceiling: GraphicsPreset, halfPlanet = true): GovernorLevel[] {
	const from = GRAPHICS_PRESETS.indexOf(ceiling);
	const presets = GRAPHICS_PRESETS.slice(0, from + 1).reverse();
	const out: GovernorLevel[] = [];
	presets.forEach((preset, i) => {
		const last = i === presets.length - 1;
		for (const step of last ? GOVERNOR_FLOOR_STEPS : GOVERNOR_STEPS) {
			if (halfPlanet || step.planetScale === 1) out.push({ preset, ...step });
		}
	});
	return out;
}

export interface GovernorConfig {
	/** Smoothed frame interval above which the view counts as over budget, ms (55 fps). */
	budgetMs: number;
	/** Time constant of the smoothing, s. */
	smoothingSeconds: number;
	/** Over budget this long steps down, s. */
	overSeconds: number;
	/** Frames are ignored this long after a change (shader compiles, buffer reallocation), s. */
	settleSeconds: number;
	/** Calm this long (under budget) at a lowered level tries one level up, s. */
	probationSeconds: number;
	/** The probation doubles after each failed trial, up to this, s. */
	maxProbationSeconds: number;
	/** A step up that falls over budget within this long is a failed trial, s. */
	probeSeconds: number;
	/** Intervals longer than this (hidden tab, breakpoint, pause) are not frames, ms. */
	ignoreOverMs: number;
}

export const DEFAULT_GOVERNOR: GovernorConfig = {
	budgetMs: 1000 / 55,
	smoothingSeconds: 0.5,
	overSeconds: 3,
	settleSeconds: 2,
	probationSeconds: 20,
	maxProbationSeconds: 160,
	probeSeconds: 8,
	ignoreOverMs: 250
};

export class QualityGovernor {
	private ladder: GovernorLevel[];
	private index = 0;
	private enabled = true;
	private smoothed: number;
	private over = 0;
	private calm = 0;
	private settle: number;
	private probation: number;
	/** Seconds since the last step up while it is still on trial, else null. */
	private trial: number | null = null;

	constructor(
		ceiling: GraphicsPreset,
		private readonly config: GovernorConfig = DEFAULT_GOVERNOR,
		private readonly halfPlanet = true
	) {
		this.ladder = governorLadder(ceiling, halfPlanet);
		this.smoothed = config.budgetMs * 0.5;
		this.settle = config.settleSeconds;
		this.probation = config.probationSeconds;
	}

	/** The level the host should be drawing at. */
	get level(): GovernorLevel {
		return this.ladder[this.index]!;
	}

	/** The seconds of calm the next trial step up waits for (grows after failed trials). */
	get nextProbationSeconds(): number {
		return this.probation;
	}

	get isEnabled(): boolean {
		return this.enabled;
	}

	/** The player picked a preset: it is the new ceiling and the governor starts again from it. Returns the level to draw. */
	setCeiling(ceiling: GraphicsPreset): GovernorLevel {
		this.ladder = governorLadder(ceiling, this.halfPlanet);
		this.restart();
		return this.level;
	}

	/** Off: always the ceiling at full resolution. On: starts again from the ceiling. Returns the level to draw. */
	setEnabled(enabled: boolean): GovernorLevel {
		this.enabled = enabled;
		this.restart();
		return this.level;
	}

	private restart(): void {
		this.index = 0;
		this.over = 0;
		this.calm = 0;
		this.trial = null;
		this.probation = this.config.probationSeconds;
		this.settle = this.config.settleSeconds;
		this.smoothed = this.config.budgetMs * 0.5;
	}

	/** One frame took `intervalMs` since the previous one. Returns the new level when it changed, else null. */
	frame(intervalMs: number): GovernorLevel | null {
		if (!this.enabled || !Number.isFinite(intervalMs) || intervalMs <= 0) return null;
		if (intervalMs > this.config.ignoreOverMs) {
			// not a frame (hidden tab, a pause): wait for the interval to settle again
			this.settle = Math.max(this.settle, this.config.settleSeconds);
			return null;
		}
		const dt = intervalMs / 1000;
		if (this.settle > 0) {
			this.settle -= dt;
			return null;
		}
		const alpha = 1 - Math.exp(-dt / this.config.smoothingSeconds);
		this.smoothed += (intervalMs - this.smoothed) * alpha;
		if (this.trial !== null) {
			this.trial += dt;
			if (this.trial >= this.config.probeSeconds) {
				// the step up held: the next trial waits the base time again
				this.trial = null;
				this.probation = this.config.probationSeconds;
			}
		}
		if (this.smoothed > this.config.budgetMs) {
			this.calm = 0;
			this.over += dt;
			if (this.over >= this.config.overSeconds) return this.stepDown();
		} else {
			this.over = 0;
			if (this.index > 0) {
				this.calm += dt;
				if (this.calm >= this.probation) return this.stepUp();
			}
		}
		return null;
	}

	private stepDown(): GovernorLevel | null {
		if (this.trial !== null) {
			// the trial failed: wait twice as long before the next one
			this.probation = Math.min(this.probation * 2, this.config.maxProbationSeconds);
			this.trial = null;
		}
		this.over = 0;
		this.calm = 0;
		if (this.index >= this.ladder.length - 1) return null;
		this.index += 1;
		return this.changed();
	}

	private stepUp(): GovernorLevel {
		this.calm = 0;
		this.index -= 1;
		this.trial = 0;
		return this.changed();
	}

	private changed(): GovernorLevel {
		this.settle = this.config.settleSeconds;
		this.smoothed = this.config.budgetMs * 0.5;
		return this.level;
	}
}
