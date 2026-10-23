/**
 * Device tiers (plan 392, ADR 0330): the machine classes the frame-rate targets are set for, from
 * what the browser tells about the GPU (the WebGPU adapter's info or WebGL's renderer string) and
 * the display's refresh rate. A tier gives the lock to aim for (395's governor) and the preset to
 * start on. Pure: the host reads the adapter and the refresh rate, this decides.
 */

export type DeviceTierId =
	/** Apple silicon from the M3, and the Pro, Max and Ultra of the M1 and M2: a locked 120. */
	| 'm5'
	/**
	 * Apple silicon whose model the browser does not say (Chrome gives WebGPU's adapter only `apple`
	 * and `metal-3`): the lock follows the display, 120 on a ProMotion screen, else 60.
	 */
	| 'apple'
	/** The base M1 and M2: a locked 60 at the selected preset. */
	| 'm2'
	/** A recent discrete GPU (RTX 3060 and up, RX 6600 and up): a locked 120 where the display has it. */
	| 'discrete-high'
	/** A GTX 1650 / RTX 3050 class card: a locked 60. */
	| 'discrete-mid'
	/** Intel Iris Xe, Arc, AMD Radeon 680M and later integrated: a locked 60. */
	| 'integrated'
	/** Older integrated GPUs, software rasterisers, phones: 30. */
	| 'low'
	| 'unknown';

export interface DeviceTier {
	id: DeviceTierId;
	/** The most the tier is asked to lock at, Hz. */
	maxHz: 120 | 60 | 30;
	/** Where a start on this tier begins (the player's choice wins). */
	preset: 'high' | 'medium' | 'low';
}

/** What the host reads: one string from either API, plus the display and a few hints. */
export interface TierInput {
	/** WebGPU `adapter.info.description` or `vendor architecture device`, or WebGL's unmasked renderer; any case. */
	gpu: string;
	/** The display's refresh rate, Hz, measured from rAF periods; absent: assume 60. */
	refreshHz?: number;
	mobile?: boolean;
}

const TIERS: Readonly<Record<DeviceTierId, DeviceTier>> = {
	m5: { id: 'm5', maxHz: 120, preset: 'high' },
	m2: { id: 'm2', maxHz: 60, preset: 'low' },
	apple: { id: 'apple', maxHz: 120, preset: 'medium' },
	'discrete-high': { id: 'discrete-high', maxHz: 120, preset: 'high' },
	'discrete-mid': { id: 'discrete-mid', maxHz: 60, preset: 'medium' },
	integrated: { id: 'integrated', maxHz: 60, preset: 'low' },
	low: { id: 'low', maxHz: 30, preset: 'low' },
	unknown: { id: 'unknown', maxHz: 60, preset: 'medium' }
};

/** The tier of a GPU description. */
export function tierOf(gpu: string, mobile = false): DeviceTier {
	const g = gpu.toLowerCase();
	if (mobile) return TIERS.low;
	if (/swiftshader|llvmpipe|software|basic render/.test(g)) return TIERS.low;
	const apple = /apple m(\d+)\s*(pro|max|ultra)?/.exec(g);
	if (apple) {
		const gen = Number(apple[1]);
		return gen >= 3 || apple[2] ? TIERS.m5 : TIERS.m2;
	}
	// Chrome hides the model: `apple metal-3`, or `Apple GPU`; the display's rate tells the rest
	if (/\bapple\b/.test(g)) return TIERS.apple;
	const rtx = /rtx\s*(\d)(\d)(\d{2})?/.exec(g) ?? /geforce rtx\s*(\d{4})/.exec(g);
	if (/rtx/.test(g)) {
		const n = /rtx\s*(\d{4})/.exec(g);
		const model = n ? Number(n[1]) : 0;
		// 20-series and the 3050 are mid; 3060 and up (and the 40 and 50 series) are high
		if (model >= 3060 || model >= 4000) return TIERS['discrete-high'];
		if (rtx) return TIERS['discrete-mid'];
	}
	if (/gtx\s*(1650|1660|1050|1060)/.test(g)) return TIERS['discrete-mid'];
	if (/gtx\s*(16|10|9|7)\d{2}/.test(g)) return TIERS['discrete-mid'];
	const rx = /radeon rx\s*(\d{3,4})/.exec(g);
	if (rx) return Number(rx[1]) >= 6600 ? TIERS['discrete-high'] : TIERS['discrete-mid'];
	if (/radeon\s*(rx\s*)?(680m|780m|660m|740m|760m|880m|890m)/.test(g)) return TIERS.integrated;
	if (/iris.*xe|arc\b|intel.*(xe|arc)/.test(g)) return TIERS.integrated;
	if (/intel|uhd graphics|hd graphics|radeon\s*(vega|graphics)/.test(g)) return TIERS.low;
	return TIERS.unknown;
}

/** The refresh rate a display runs at, snapped to the rates that matter (30, 60, 120), from rAF periods in ms. */
export function refreshOf(periodsMs: readonly number[]): 30 | 60 | 120 {
	if (periodsMs.length === 0) return 60;
	const sorted = [...periodsMs].sort((a, b) => a - b);
	// the median period is the display's, whatever a few dropped frames did
	const mid = sorted[Math.floor(sorted.length / 2)]!;
	const hz = 1000 / mid;
	return hz >= 90 ? 120 : hz >= 45 ? 60 : 30;
}

/** What to lock at: the tier's ceiling or the display's rate, whichever is lower. */
export function targetHz(tier: DeviceTier, refreshHz = 60): 120 | 60 | 30 {
	const display = refreshHz >= 90 ? 120 : refreshHz >= 45 ? 60 : 30;
	return Math.min(tier.maxHz, display) as 120 | 60 | 30;
}

/** The frame budget of a lock, ms: 8.33, 16.67 or 33.33. */
export const budgetOf = (hz: number): number => 1000 / hz;

export function deviceTier(input: TierInput): DeviceTier & { hz: 120 | 60 | 30; budgetMs: number } {
	const tier = tierOf(input.gpu, input.mobile === true);
	const hz = targetHz(tier, input.refreshHz);
	return { ...tier, hz, budgetMs: budgetOf(hz) };
}
