/**
 * Re-entry plasma colour (plan 399, ADR 0330 point 3): a palette per body and atmosphere in the data
 * model of KSP's Firefly (a glow, a hot glow, three trail colours, a streak, a wrap and a bow shock,
 * each an RGB scaled by 2^intensity so it can exceed 1), and the function that turns the heating, the
 * speed and the layer into the colour drawn. Pure. Mods supply palettes as data in plan 405; the
 * stock ones are picked here by the body and its gas.
 */
import type { PlasmaPaletteData } from '@orbital/core';
import { clamp, lerp, smoothstep } from '../vec.ts';
import { ionisationColour, type Rgb } from './look.ts';

/** A colour as Firefly stores it: `rgb` (0..1 each) times 2^`intensity`. */
export interface PaletteColour {
	rgb: Rgb;
	intensity: number;
}

/** The linear HDR colour of a palette entry: rgb × 2^intensity. */
export const hdr = (c: PaletteColour): Rgb => {
	const k = 2 ** c.intensity;
	return [c.rgb[0] * k, c.rgb[1] * k, c.rgb[2] * k];
};

/** One stop of the heating gradient: `at` is the heating 0..1 where the colour is reached. */
export interface GradientStop {
	at: number;
	rgb: Rgb;
}

/** Scales on the look, 1 for the stock ones. */
export interface PaletteMultipliers {
	strength: number;
	length: number;
	opacity: number;
	glow: number;
	wrapOpacity: number;
	wrapFresnel: number;
	streakProbability: number;
	streakThreshold: number;
}

export interface PlasmaPalette {
	id: string;
	/** The skin glow at low heating, and at the top. */
	glow: PaletteColour;
	glowHot: PaletteColour;
	/** The trail's colours from the nose to the tail. */
	trail: readonly [PaletteColour, PaletteColour, PaletteColour];
	streak: PaletteColour;
	wrap: PaletteColour;
	shock: PaletteColour;
	/** Red → orange → pink or violet → blue-white by heating: at least four stops, ascending. */
	gradient: readonly GradientStop[];
	multipliers: PaletteMultipliers;
}

const NEUTRAL: PaletteMultipliers = {
	strength: 1,
	length: 1,
	opacity: 1,
	glow: 1,
	wrapOpacity: 1,
	wrapFresnel: 1,
	streakProbability: 1,
	streakThreshold: 1
};

const colour = (r: number, g: number, b: number, intensity = 0): PaletteColour => ({
	rgb: [r, g, b],
	intensity
});

/** Home's nitrogen and oxygen: deep red, orange, pink and magenta, blue-white (reference image 01). */
export const AIR_PALETTE: PlasmaPalette = {
	id: 'air',
	glow: colour(1, 0.32, 0.08, 0.3),
	glowHot: colour(0.75, 0.82, 1, 0.8),
	trail: [colour(1, 0.45, 0.2, 0.4), colour(0.95, 0.25, 0.55, 0.2), colour(0.5, 0.2, 0.7, -0.4)],
	streak: colour(1, 0.7, 0.9, 0.6),
	wrap: colour(0.9, 0.35, 0.75, 0.2),
	shock: colour(0.55, 0.7, 1, 0.5),
	gradient: [
		{ at: 0, rgb: [0.85, 0.07, 0.03] },
		{ at: 0.3, rgb: [1, 0.42, 0.08] },
		{ at: 0.6, rgb: [1, 0.3, 0.72] },
		{ at: 1, rgb: [0.62, 0.8, 1] }
	],
	multipliers: NEUTRAL
};

/** A carbon dioxide atmosphere: amber and lime-yellow with a violet, ice-blue peak. */
export const CO2_PALETTE: PlasmaPalette = {
	id: 'co2',
	glow: colour(1, 0.45, 0.08, 0.2),
	glowHot: colour(0.7, 0.65, 1, 0.7),
	trail: [colour(1, 0.6, 0.15, 0.3), colour(0.8, 0.85, 0.3, 0), colour(0.55, 0.4, 0.8, -0.5)],
	streak: colour(1, 0.9, 0.5, 0.5),
	wrap: colour(0.75, 0.6, 0.2, 0.1),
	shock: colour(0.6, 0.55, 1, 0.4),
	gradient: [
		{ at: 0, rgb: [0.8, 0.18, 0.04] },
		{ at: 0.3, rgb: [1, 0.62, 0.12] },
		{ at: 0.6, rgb: [0.86, 0.9, 0.38] },
		{ at: 1, rgb: [0.68, 0.6, 1] }
	],
	multipliers: NEUTRAL
};

/** A nitrogen atmosphere: warm orange into a cool violet. */
export const NITROGEN_PALETTE: PlasmaPalette = {
	id: 'nitrogen',
	glow: colour(1, 0.4, 0.1, 0.2),
	glowHot: colour(0.7, 0.6, 1, 0.7),
	trail: [colour(1, 0.5, 0.2, 0.3), colour(0.8, 0.35, 0.7, 0), colour(0.4, 0.25, 0.8, -0.5)],
	streak: colour(0.9, 0.7, 1, 0.5),
	wrap: colour(0.7, 0.35, 0.85, 0.1),
	shock: colour(0.5, 0.55, 1, 0.4),
	gradient: [
		{ at: 0, rgb: [0.8, 0.12, 0.05] },
		{ at: 0.3, rgb: [1, 0.5, 0.15] },
		{ at: 0.6, rgb: [0.82, 0.38, 0.9] },
		{ at: 1, rgb: [0.5, 0.58, 1] }
	],
	multipliers: NEUTRAL
};

/** A hydrogen and helium atmosphere: the red and pink of hydrogen-alpha into blue-violet. */
export const HYDROGEN_PALETTE: PlasmaPalette = {
	id: 'hydrogen',
	glow: colour(1, 0.2, 0.3, 0.2),
	glowHot: colour(0.6, 0.6, 1, 0.7),
	trail: [colour(1, 0.3, 0.4, 0.3), colour(0.85, 0.3, 0.75, 0), colour(0.4, 0.35, 0.9, -0.4)],
	streak: colour(1, 0.6, 0.85, 0.5),
	wrap: colour(0.9, 0.3, 0.6, 0.1),
	shock: colour(0.5, 0.5, 1, 0.4),
	gradient: [
		{ at: 0, rgb: [0.9, 0.08, 0.16] },
		{ at: 0.3, rgb: [1, 0.25, 0.4] },
		{ at: 0.6, rgb: [0.85, 0.35, 0.95] },
		{ at: 1, rgb: [0.5, 0.52, 1] }
	],
	multipliers: NEUTRAL
};

/** Palettes by body id (stock and Sol). A body not listed is picked by its gas. */
const BY_BODY: Readonly<Record<string, PlasmaPalette>> = {
	'stock.home': AIR_PALETTE,
	'stock.vesper': CO2_PALETTE,
	'stock.ochre': CO2_PALETTE,
	'stock.tempest': HYDROGEN_PALETTE
};

/** The gas of an atmosphere by its specific gas constant, J/(kg·K); undefined is air. */
export function gasOf(gasConstant: number | undefined): 'air' | 'co2' | 'nitrogen' | 'hydrogen' {
	if (gasConstant === undefined) return 'air';
	if (gasConstant > 1_000) return 'hydrogen';
	if (Math.abs(gasConstant - 188.9) < 40) return 'co2';
	if (Math.abs(gasConstant - 296.8) < 2) return 'nitrogen';
	return 'air';
}

const BY_GAS = {
	air: AIR_PALETTE,
	co2: CO2_PALETTE,
	nitrogen: NITROGEN_PALETTE,
	hydrogen: HYDROGEN_PALETTE
} as const;

/** The palette a mod's data makes (plan 405, ADR 0345): the data's colours, the neutral scales where it names none. */
export function paletteFromData(id: string, data: PlasmaPaletteData): PlasmaPalette {
	const c = (p: { rgb: readonly [number, number, number]; intensity: number }): PaletteColour => ({
		rgb: [p.rgb[0], p.rgb[1], p.rgb[2]],
		intensity: p.intensity
	});
	return {
		id,
		glow: c(data.glow),
		glowHot: c(data.glowHot),
		trail: [c(data.trail[0]), c(data.trail[1]), c(data.trail[2])],
		streak: c(data.streak),
		wrap: c(data.wrap),
		shock: c(data.shock),
		gradient: data.gradient.map((g) => ({ at: g.at, rgb: [g.rgb[0], g.rgb[1], g.rgb[2]] as Rgb })),
		multipliers: { ...NEUTRAL, ...data.multipliers }
	};
}

/** The palette for a body: the mod's data when it has one, else by its id, else by its atmosphere's gas. */
export function paletteFor(
	bodyId: string,
	atmosphere: { gasConstant?: number | undefined } | undefined,
	data?: PlasmaPaletteData
): PlasmaPalette {
	if (data) return paletteFromData(bodyId, data);
	return BY_BODY[bodyId] ?? BY_GAS[gasOf(atmosphere?.gasConstant)];
}

/** The stagnation flux at the top of the gradient, W/m² (a steep return from beyond orbital speed). */
export const HEATING_PEAK_FLUX = 2.5e6;

/**
 * The heating 0..1 the gradient is read at, from the stagnation flux. Square-rooted so a normal
 * orbital return (about 1e5 to 5.5e5 W/m², ADR 0078) reads red-orange to pink and only a steep one
 * reaches the blue-white end.
 */
export const heatingOf = (flux: number, strength = 1): number =>
	clamp(Math.sqrt(Math.max(0, flux) / HEATING_PEAK_FLUX) * strength, 0, 1);

/** The three layers drawn: the skin glow, the shock layer ahead of it, and the trail behind. */
export type PlasmaLayer = 'skin' | 'shock' | 'trail';

/** How far along the gradient each layer reads from the heating: the skin lags, the shock leads. */
export const LAYER_OFFSET: Readonly<Record<PlasmaLayer, number>> = {
	skin: -0.14,
	shock: 0.16,
	trail: -0.3
};

/** The quality of the look: Low has a two-stop gradient, Medium and High the full one. */
export type PlasmaQuality = 'low' | 'medium' | 'high';

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
	lerp(a[0], b[0], t),
	lerp(a[1], b[1], t),
	lerp(a[2], b[2], t)
];

/** The gradient's colour at `t` 0..1 (stops ascending). */
export function gradientAt(stops: readonly GradientStop[], t: number): Rgb {
	const x = clamp(t, 0, 1);
	const first = stops[0]!;
	if (x <= first.at) return first.rgb;
	for (let i = 1; i < stops.length; i++) {
		const b = stops[i]!;
		if (x <= b.at) {
			const a = stops[i - 1]!;
			return mix(a.rgb, b.rgb, (x - a.at) / (b.at - a.at));
		}
	}
	return stops[stops.length - 1]!.rgb;
}

/**
 * The colour of `layer` (linear RGB, about 1) at `heating` 0..1 (`heatingOf`) and airspeed
 * `speed` m/s on `palette`. The layers read the gradient at different offsets, so the skin, the
 * shock and the trail stay apart on screen; speed past 8 km/s pushes the trail toward the hot
 * end; `along` 0..1 cools the trail from the nose to the tail. At Low quality the gradient is two
 * stops (the orange and the pink-white).
 */
export function plasmaColour(
	layer: PlasmaLayer,
	heating: number,
	speed: number,
	palette: PlasmaPalette,
	quality: PlasmaQuality = 'high',
	along = 0
): Rgb {
	let t = heating + LAYER_OFFSET[layer];
	if (layer === 'trail') {
		t += 0.12 * smoothstep(8_000, 11_000, speed) - 0.2 * clamp(along, 0, 1);
	}
	const stops = palette.gradient;
	if (quality === 'low') {
		const a = stops[1]!;
		const b = stops[stops.length - 2]!;
		return mix(a.rgb, b.rgb, smoothstep(0.1, 0.9, clamp(t, 0, 1)));
	}
	return gradientAt(stops, t);
}

/**
 * The speed ramp of before plan 399, kept as the colour of a body without a palette: the shock
 * layer's tint by speed (`ionisationColour`).
 */
export const rampColour = (speed: number): Rgb => ionisationColour(speed);

/** Mach range the condensation shows in (plan 399): nothing below `start`, full from `full` to `fade`. */
export const CONDENSATION_MACH = { start: 0.8, full: 0.9, fade: 1.15, end: 1.25 } as const;
/** Air density where condensation reaches half its strength and where it is full, kg/m³. */
export const CONDENSATION_DENSITY = { low: 0.08, full: 0.6 } as const;

/**
 * The opacity 0..1 of the cold end of the shell, the condensation cloud and the vapour cone: 0
 * below Mach 0.8 and above 1.25, full between about 0.9 and 1.15, and fading to 0 as the air
 * thins (a thin air holds no vapour).
 */
export function condensationOpacity(mach: number, density: number): number {
	const m = CONDENSATION_MACH;
	if (!(mach > m.start) || !(mach < m.end) || !(density > 0)) return 0;
	const gate = smoothstep(m.start, m.full, mach) * (1 - smoothstep(m.fade, m.end, mach));
	return gate * smoothstep(CONDENSATION_DENSITY.low, CONDENSATION_DENSITY.full, density);
}
