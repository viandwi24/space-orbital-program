/**
 * Engine plume templates (plan 400, ADR 0335): what an engine's plume looks like as data. A template
 * is a propellant base (colours, how bright the core is at sea level, how visible the shock
 * diamonds, the base length and width) with the engine's own scales on it. Controllers turn the
 * state of the engine and the air into the numbers the plume shader reads: the throttle, the air
 * density to the power 0.5128 (Waterfall's default), the ignition ramp, and curves that remap a
 * controller's value. An engine with no template gets `DEFAULT_TEMPLATE`, which changes nothing of
 * the plume as it was. Pure.
 */
import type { PlumeTemplateData } from '@orbital/core';
import { clamp, lerp } from '../vec.ts';
import type { Rgb } from './look.ts';
import type { PlumeShape } from './plume.ts';

/** The air density controller's default exponent: the plume's fade with the air (Waterfall). */
export const DENSITY_EXPONENT = 0.5128;

/** `(density / reference)^exponent`, 0 at no air, 1 at the reference density (sea level). */
export function densityController(
	pressure: number,
	surfacePressure: number,
	exponent = DENSITY_EXPONENT
): number {
	if (!(pressure > 0) || !(surfacePressure > 0)) return 0;
	return clamp(Math.pow(pressure / surfacePressure, exponent), 0, 1);
}

/** A controller's remap curve: `[x, y]` points, ascending in x, linear between and held beyond the ends. */
export type RemapCurve = ReadonlyArray<readonly [number, number]>;

export function remap(curve: RemapCurve, x: number): number {
	if (curve.length === 0) return x;
	const first = curve[0]!;
	if (x <= first[0]) return first[1];
	for (let i = 1; i < curve.length; i++) {
		const b = curve[i]!;
		if (x <= b[0]) {
			const a = curve[i - 1]!;
			return b[0] === a[0] ? b[1] : lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0]));
		}
	}
	return curve[curve.length - 1]![1];
}

/** The ignition controller: 0 at the start, 1 after `seconds`. */
export const ignition = (since: number, seconds: number): number =>
	seconds > 0 ? clamp(since / seconds, 0, 1) : since >= 0 ? 1 : 0;

/** A propellant base: the look a propellant gives before the engine's own scales. */
export interface PropellantBase {
	id: PlumeTemplateData['propellant'];
	/** Outer flame, inner flame, core and the nozzle glow, linear RGB. */
	outer: Rgb;
	inner: Rgb;
	core: Rgb;
	glow: Rgb;
	/** How much of the core shows at sea level (hydrolox is near invisible there); full in vacuum. */
	coreSea: number;
	/** Scales on the base length, width, emission and the shock diamonds. */
	length: number;
	width: number;
	brightness: number;
	diamonds: number;
	/** Whether the exhaust leaves a smoke trail (solids do; ADR 0080). */
	smoke: boolean;
}

export const PROPELLANT_BASES: Readonly<Record<PlumeTemplateData['propellant'], PropellantBase>> = {
	// orange-yellow and bright; the sooty dark core is the inner flame kept narrow and warm
	kerolox: {
		id: 'kerolox',
		outer: [1, 0.5, 0.12],
		inner: [1, 0.82, 0.45],
		core: [1, 0.94, 0.75],
		glow: [1, 0.68, 0.3],
		coreSea: 1,
		length: 1,
		width: 1,
		brightness: 1,
		diamonds: 1,
		smoke: false
	},
	// faint blue-white, near invisible at sea level, with the diamonds the one thing that shows
	hydrolox: {
		id: 'hydrolox',
		outer: [0.55, 0.7, 1],
		inner: [0.78, 0.88, 1],
		core: [0.9, 0.95, 1],
		glow: [0.7, 0.82, 1],
		coreSea: 0.18,
		length: 0.9,
		width: 0.9,
		brightness: 0.55,
		diamonds: 1.5,
		smoke: false
	},
	// blue to purple, clean
	methalox: {
		id: 'methalox',
		outer: [0.42, 0.42, 1],
		inner: [0.62, 0.6, 1],
		core: [0.85, 0.85, 1],
		glow: [0.6, 0.55, 1],
		coreSea: 0.8,
		length: 1,
		width: 1,
		brightness: 0.85,
		diamonds: 1.1,
		smoke: false
	},
	// orange-red and translucent
	hypergolic: {
		id: 'hypergolic',
		outer: [1, 0.3, 0.1],
		inner: [1, 0.55, 0.3],
		core: [1, 0.8, 0.6],
		glow: [1, 0.45, 0.2],
		coreSea: 0.9,
		length: 0.85,
		width: 0.9,
		brightness: 0.7,
		diamonds: 0.4,
		smoke: false
	},
	// very bright white-yellow, with a long smoke trail
	solid: {
		id: 'solid',
		outer: [1, 0.78, 0.38],
		inner: [1, 0.93, 0.72],
		core: [1, 1, 0.92],
		glow: [1, 0.85, 0.5],
		coreSea: 1,
		length: 1.15,
		width: 1,
		brightness: 1.4,
		diamonds: 0.3,
		smoke: true
	},
	// a faint blue thread
	ion: {
		id: 'ion',
		outer: [0.3, 0.5, 1],
		inner: [0.55, 0.72, 1],
		core: [0.8, 0.9, 1],
		glow: [0.45, 0.65, 1],
		coreSea: 1,
		length: 0.7,
		width: 0.25,
		brightness: 0.5,
		diamonds: 0,
		smoke: false
	}
};

/** A template with its base resolved and its defaults filled in. */
export interface ResolvedTemplate {
	base: PropellantBase | null;
	lengthScale: number;
	widthScale: number;
	brightness: number;
	diamonds: number;
	/** Chamber pressure, bar. */
	chamberPressure: number;
	colours: { outer: Rgb; inner: Rgb; core: Rgb; glow: Rgb };
}

/** The chamber pressure the base lengths are for, bar. */
export const REFERENCE_CHAMBER_BAR = 60;

/** Today's plume: orange outer flame, yellow inner, nothing scaled (the colour override still applies). */
export const DEFAULT_COLOURS = {
	outer: [1, 0.54, 0.165] as Rgb,
	inner: [1, 0.78, 0.4] as Rgb,
	core: [1, 0.98, 0.9] as Rgb,
	glow: [1, 0.72, 0.38] as Rgb
};

const hexRgb = (hex: string): Rgb => {
	const n = parseInt(hex.slice(1), 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/**
 * The template an engine draws with. `legacyColor` is the old `plume.color` (the outer flame); a
 * template's own colours win over it.
 */
export function resolveTemplate(
	data: PlumeTemplateData | undefined,
	legacyColor?: string
): ResolvedTemplate {
	if (!data) {
		return {
			base: null,
			lengthScale: 1,
			widthScale: 1,
			brightness: 1,
			diamonds: 1,
			chamberPressure: REFERENCE_CHAMBER_BAR,
			colours: {
				...DEFAULT_COLOURS,
				outer: legacyColor ? hexRgb(legacyColor) : DEFAULT_COLOURS.outer
			}
		};
	}
	const base = PROPELLANT_BASES[data.propellant];
	return {
		base,
		lengthScale: data.lengthScale ?? 1,
		widthScale: data.widthScale ?? 1,
		brightness: data.brightness ?? 1,
		diamonds: data.diamonds ?? 1,
		chamberPressure: data.chamberPressure ?? REFERENCE_CHAMBER_BAR,
		colours: {
			outer: data.color ? hexRgb(data.color) : legacyColor ? hexRgb(legacyColor) : base.outer,
			inner: base.inner,
			core: data.core ? hexRgb(data.core) : base.core,
			glow: base.glow
		}
	};
}

/** The chamber pressure's effect on the plume: a higher one is longer and a little narrower. */
export const chamberLength = (bar: number): number =>
	Math.pow(clamp(bar, 5, 500) / REFERENCE_CHAMBER_BAR, 0.25);
export const chamberWidth = (bar: number): number =>
	Math.pow(clamp(bar, 5, 500) / REFERENCE_CHAMBER_BAR, -0.12);

/** What the shader is driven with, after the template has its say over the pressure-based shape. */
export interface TemplateLook {
	length: number;
	maxRadius: number;
	/** Gain on the outer and inner flames, and the core's share of the inner at this pressure. */
	brightness: number;
	core: number;
	diamonds: number;
}

/**
 * The shape from the pressure (`plumeShape`) with the template's scales: the base's and the
 * engine's length and width, the chamber pressure, the emission, and the core's visibility, which
 * rises from the base's sea-level share to 1 as the air thins (`vacuum`, 0 to 1).
 */
export function templateLook(shape: PlumeShape, t: ResolvedTemplate): TemplateLook {
	const b = t.base;
	const bar = t.chamberPressure;
	return {
		length: shape.length * (b?.length ?? 1) * t.lengthScale * chamberLength(bar),
		maxRadius: shape.maxRadius * (b?.width ?? 1) * t.widthScale * chamberWidth(bar),
		brightness: shape.brightness * (b?.brightness ?? 1) * t.brightness,
		core: b ? lerp(b.coreSea, 1, shape.vacuum) : 1,
		diamonds: clamp(shape.diamonds * (b?.diamonds ?? 1) * t.diamonds, 0, 1)
	};
}

/** The level engine plumes are drawn at (plan 400): set from the preset by the scene, read by every plume. */
export const plumeQuality: { level: 'low' | 'medium' | 'high' } = { level: 'high' };
