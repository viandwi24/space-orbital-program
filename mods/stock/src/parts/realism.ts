/**
 * Realistic part stats by rule (plan 380, ADR 0317). One set of numbers in every system: the
 * system sets the difficulty, not per-system patches. The reference hardware behind every band is
 * in `docs/research/realistic-part-stats.md`.
 *
 * - An engine has a kind (`ENGINE_KINDS`): bands for vacuum and sea-level Isp and for thrust-to-weight
 *   (vacuum thrust over dry mass × g0), and a target inside the band that sets its dry mass.
 * - A tank's dry mass is a fraction of tank plus propellant by its size class (`tankDryFraction`).
 * - A solid motor's casing is a fraction of the motor by its size (`solidDryFraction`).
 * - A part that carries its own propellant and an engine (a lander stage, the orbiter's aft section)
 *   is a stage: at least as heavy as a bare tank of its propellant plus its engine.
 *
 * `realismIssues` checks a part list against these rules; `test/realism.test.ts` runs it on stock.
 */

/** Standard gravity, m/s² (thrust-to-weight is against it, as the references quote it). */
export const G0 = 9.80665;

export type EngineKind =
	| 'kerolox-early'
	| 'kerolox-sl'
	| 'kerolox-vac'
	| 'hydrolox-sl'
	| 'hydrolox-vac'
	| 'hypergolic-early'
	| 'hypergolic'
	| 'solid-early'
	| 'solid'
	| 'solid-escape';

export interface Band {
	min: number;
	max: number;
}

export interface EngineKindRule {
	label: string;
	/** Vacuum Isp, s. */
	ispVacuum: Band;
	/** Sea-level Isp, s (a vacuum engine's is low, so its band starts at zero). */
	ispSeaLevel: Band;
	/** Thrust-to-weight band and the target a stock engine of this kind is built to (liquids only). */
	twr?: Band & { target: number };
	/** Cost factor on the thrust rule (`engineCost`); solids cost by mass. */
	costFactor: number;
	/** The real engines behind the bands. */
	references: string;
}

export const ENGINE_KINDS: Record<EngineKind, EngineKindRule> = {
	// the first tech tiers (ADR 0317 point 2): realistic, but of the 1940s and 50s
	'kerolox-early': {
		label: 'early kerosene or alcohol/oxygen',
		ispVacuum: { min: 230, max: 310 },
		ispSeaLevel: { min: 195, max: 260 },
		twr: { min: 20, max: 100, target: 80 },
		costFactor: 1,
		references:
			'V-2 about 270 kN, 203 s at sea level, TWR about 30; LR-79 (Thor) 600 kN, 247/282 s; RD-107 (1957) 250/306 s'
	},
	'kerolox-sl': {
		label: 'kerosene/oxygen, sea level',
		ispVacuum: { min: 289, max: 340 },
		ispSeaLevel: { min: 250, max: 312 },
		// the Merlin 1D's 184 is a real outlier; stock caps at 120
		twr: { min: 60, max: 120, target: 85 },
		costFactor: 1,
		references:
			'F-1 304/263 s, TWR 94; RD-180 338/311 s, 78; RD-107A 320/263 s, 87; Merlin 1D 311/282 s, 184; H-1 289/255 s'
	},
	'kerolox-vac': {
		label: 'kerosene/oxygen, vacuum',
		ispVacuum: { min: 320, max: 360 },
		ispSeaLevel: { min: 0, max: 300 },
		twr: { min: 40, max: 120, target: 70 },
		costFactor: 1,
		references: 'Merlin 1D Vacuum 348 s; RD-0124 359 s'
	},
	'hydrolox-sl': {
		label: 'hydrogen/oxygen, sea level',
		ispVacuum: { min: 405, max: 460 },
		ispSeaLevel: { min: 350, max: 395 },
		twr: { min: 45, max: 80, target: 70 },
		costFactor: 1.2,
		references: 'RS-25 452/366 s, TWR 73; RS-68A 411/362 s'
	},
	'hydrolox-vac': {
		label: 'hydrogen/oxygen, vacuum',
		ispVacuum: { min: 420, max: 470 },
		ispSeaLevel: { min: 0, max: 300 },
		twr: { min: 35, max: 75, target: 58 },
		costFactor: 1.2,
		references: 'J-2 421/200 s, 1 033 kN, 1 788 kg (TWR 59); RL10A-4-2 451 s (59); RL10B-2 465 s (37)'
	},
	'hypergolic-early': {
		label: 'early storable (nitric acid / UDMH)',
		ispVacuum: { min: 260, max: 300 },
		ispSeaLevel: { min: 0, max: 260 },
		twr: { min: 12, max: 40, target: 20 },
		costFactor: 1.3,
		references: 'AJ10-37 (Vanguard) and AJ10-104 (Able, Thor-Able), 270–280 s'
	},
	hypergolic: {
		label: 'storable hypergolic',
		ispVacuum: { min: 300, max: 330 },
		ispSeaLevel: { min: 0, max: 290 },
		twr: { min: 15, max: 40, target: 28 },
		costFactor: 1.3,
		references:
			'AJ10-137 (Apollo SPS) 314 s, 91 kN; AJ10-118K 319 s; LM descent 311 s, 47 kN, 179 kg (27); LM ascent 311 s, 16 kN, 95 kg (17)'
	},
	'solid-early': {
		label: 'early solid motor',
		ispVacuum: { min: 200, max: 255 },
		ispSeaLevel: { min: 180, max: 235 },
		costFactor: 0,
		references: 'Sergeant and Castor 1 class, 220–250 s'
	},
	solid: {
		label: 'solid motor',
		ispVacuum: { min: 240, max: 290 },
		ispSeaLevel: { min: 215, max: 270 },
		costFactor: 0,
		references: 'Shuttle SRB 268/242 s, 91 of 590 t dry (15 %); Castor 4A 266 s; GEM-40 274 s'
	},
	'solid-escape': {
		label: 'escape solid motor',
		ispVacuum: { min: 150, max: 250 },
		ispSeaLevel: { min: 140, max: 240 },
		costFactor: 0,
		references: 'Apollo launch escape motor: about 650 kN for 3 s'
	}
};

/** RCS Isp bands by propellant, s (vacuum). */
export const RCS_ISP: Record<string, Band & { references: string }> = {
	'stock.monopropellant': { min: 200, max: 240, references: 'hydrazine thrusters 220–235 s' },
	'stock.cold-gas': { min: 50, max: 80, references: 'nitrogen cold gas 65–75 s' }
};

/**
 * Tank dry fraction (dry / (dry + propellant)) by diameter, m. Real stages with their engines: S-IC
 * 6.2 %, S-II 7.5 %, S-IVB 11 %, Centaur III 9.7 %, Falcon 9 first stage 5.1 %; the Shuttle's external
 * tank 3.5 %. A bare tank is lighter than its stage, and a small tank is heavier per kilogram.
 */
export const TANK_DRY_FRACTION: ReadonlyArray<readonly [number, number]> = [
	[0.625, 0.12],
	[1.25, 0.09],
	[1.875, 0.075],
	[2.5, 0.065],
	[3.75, 0.055],
	[5, 0.05],
	[7.5, 0.045]
];
/** A tank passes within this factor of its size class's fraction (both ways). */
export const TANK_TOLERANCE = 1.3;

/**
 * Tank eras (ADR 0317 point 2): the tech tree carries the progression. Early tanks are welded steel
 * and aluminium, about 21 % dry at 1.25 m (the V-2's whole rocket was 30 % dry, Redstone's about
 * 19 %): a start-of-career rocket needs two stages to orbit even in stock. Modern ones aluminium-lithium
 * and composite (Falcon 9's stages 4–5 % with their engines). Mid is the size class's fraction.
 */
export type Era = 'early' | 'mid' | 'modern';
export const ERA_TANK_FACTOR: Record<Era, number> = { early: 2.3, mid: 1, modern: 0.85 };
/** Stock tanks by era; the rest are mid. */
export const STOCK_TANK_ERA: Record<string, Era> = {
	'stock.tank-small': 'early',
	'stock.tank-medium': 'early',
	'stock.tank-0625': 'early',
	'stock.tank-3750-short': 'modern',
	'stock.tank-3750': 'modern',
	'stock.tank-3750-long': 'modern',
	'stock.tank-5000-short': 'modern',
	'stock.tank-5000': 'modern',
	'stock.tank-5000-long': 'modern',
	'stock.tank-7500': 'modern',
	'stock.tank-7500-long': 'modern',
	'stock.external-tank': 'modern'
};

/** Solid motor casing fraction by diameter, m; any motor passes within `SOLID_BAND`. */
export const SOLID_DRY_FRACTION: ReadonlyArray<readonly [number, number]> = [
	[0.8, 0.16],
	[1.25, 0.14],
	[1.875, 0.12]
];
export const SOLID_BAND: Band = { min: 0.08, max: 0.2 };

/** Monopropellant tanks: pressurised, so heavier (8–30 %). */
export const MONOPROP_TANK_BAND: Band = { min: 0.08, max: 0.3 };

/** A cluster plate carries a thrust structure: its engines' mass times this. */
export const CLUSTER_STRUCTURE = 1.15;

/** Piecewise-linear lookup in a (diameter, value) table, clamped at both ends. */
function lookup(table: ReadonlyArray<readonly [number, number]>, d: number): number {
	const first = table[0]!;
	const last = table[table.length - 1]!;
	if (d <= first[0]) return first[1];
	if (d >= last[0]) return last[1];
	for (let i = 1; i < table.length; i++) {
		const [d1, v1] = table[i]!;
		const [d0, v0] = table[i - 1]!;
		if (d <= d1) return v0 + ((v1 - v0) * (d - d0)) / (d1 - d0);
	}
	return last[1];
}

export const tankDryFraction = (diameter: number, era: Era = 'mid'): number =>
	Math.min(0.25, lookup(TANK_DRY_FRACTION, diameter) * ERA_TANK_FACTOR[era]);
export const solidDryFraction = (diameter: number): number => lookup(SOLID_DRY_FRACTION, diameter);

/** Dry mass of a tank of `propellantKg` and diameter `diameter`, kg, to 5 kg. */
export function tankDryMass(propellantKg: number, diameter: number, era: Era = 'mid'): number {
	const f = tankDryFraction(diameter, era);
	return Math.max(5, Math.round((propellantKg * f) / (1 - f) / 5) * 5);
}

/** Dry mass of a solid motor's casing for `propellantKg`, kg, to 5 kg. */
export function solidDryMass(propellantKg: number, diameter: number): number {
	const f = solidDryFraction(diameter);
	return Math.round((propellantKg * f) / (1 - f) / 5) * 5;
}

/** Dry mass of a liquid engine of `thrust` N (vacuum), kg, to 5 kg; `bells` > 1 adds the thrust structure. */
export function engineMass(kind: EngineKind, thrust: number, bells = 1): number {
	const twr = ENGINE_KINDS[kind].twr;
	if (!twr) throw new Error(`engineMass: ${kind} has no thrust-to-weight rule`);
	const m = (thrust / (G0 * twr.target)) * (bells > 1 ? CLUSTER_STRUCTURE : 1);
	return Math.round(m / 5) * 5;
}

/**
 * A liquid engine's cost (ADR 0317 point 4): by thrust, not mass, since realistic engines are light.
 * The LV-T30 (215 kN) keeps its 7 500; bigger engines cost less per kilonewton.
 */
export function engineCost(kind: EngineKind, thrust: number): number {
	return Math.round(7_500 * (thrust / 215_000) ** 0.7 * ENGINE_KINDS[kind].costFactor);
}

/**
 * A tank's cost (ADR 0317 point 4): by what it holds, not its dry mass, so a size class's lighter or
 * heavier structure does not move its price. The rate keeps stock's 1.25 m tanks at their old prices.
 */
export const TANK_COST_PER_KG = 375 / 4_450;
export const tankCost = (propellantKg: number): number => Math.round(propellantKg * TANK_COST_PER_KG);

/** Propellant of a 0.9 : 1.1 fuel/oxidizer load of `fuel` units, kg (5 kg per unit each). */
export const lfoxKg = (fuel: number): number => (fuel + Math.round((fuel * 11) / 9)) * 5;

/**
 * Every stock part with an engine, by id: its kind, its real counterpart, and for a part that carries
 * its own propellant (`stage`), so the check takes it as a stage. A mod's own engines need no entry
 * here; `realismIssues` takes any kind map.
 */
export interface PartRealism {
	kind: EngineKind;
	counterpart: string;
	/** The part is a whole stage (tank, structure, maybe a cabin) with its engine. */
	stage?: true;
	/** Bells on one plate (the thrust structure). */
	bells?: number;
}

export const STOCK_ENGINE_REALISM: Record<string, PartRealism> = {
	'stock.engine-lv': { kind: 'kerolox-early', counterpart: 'the V-2 and Redstone class (Basics)' },
	'stock.engine-cluster': {
		kind: 'kerolox-early',
		counterpart: 'RD-107 of 1957 (four chambers on one turbopump)',
		bells: 4
	},
	'stock.engine-wide': { kind: 'kerolox-sl', counterpart: 'Merlin 1D' },
	'stock.engine-vacuum': { kind: 'hypergolic-early', counterpart: 'AJ10-104 (Able upper stage)' },
	'stock.engine-vacuum-xl': { kind: 'hydrolox-vac', counterpart: 'J-2 (S-II, S-IVB)' },
	'stock.engine-plate-5': {
		kind: 'kerolox-sl',
		counterpart: 'five F-1-class kerolox engines (S-IC)',
		bells: 5
	},
	'stock.engine-plate-f1': {
		kind: 'kerolox-sl',
		counterpart: 'the S-IC: five F-1 at their real thrust',
		bells: 5
	},
	'stock.engine-plate-j2': {
		kind: 'hydrolox-vac',
		counterpart: 'the S-II: five J-2',
		bells: 5
	},
	'stock.engine-plate-9': {
		kind: 'kerolox-sl',
		counterpart: 'nine Merlin 1D on an octaweb (Falcon 9)',
		bells: 9
	},
	'stock.engine-plate-8': {
		kind: 'hydrolox-sl',
		counterpart: 'a hydrolox cluster: RS-25 class (Shuttle, Energia core)',
		bells: 8
	},
	'stock.booster-liquid': {
		kind: 'kerolox-early',
		counterpart: 'a strap-on kerolox booster (Soyuz block B, scaled)',
		stage: true
	},
	'stock.booster': { kind: 'solid-early', counterpart: 'a Castor 1 class strap-on' },
	'stock.srb-small': { kind: 'solid-early', counterpart: 'a Baby Sergeant class kick motor' },
	'stock.srb-large': { kind: 'solid-early', counterpart: 'a Castor 1 / Algol class motor' },
	'stock.srb-xl': { kind: 'solid', counterpart: 'Shuttle SRB (half length)' },
	'stock.escape-tower': { kind: 'solid-escape', counterpart: 'Apollo launch escape system' },
	'stock.lander-descent': {
		kind: 'hypergolic',
		counterpart: 'Apollo LM descent stage (LMDE)',
		stage: true
	},
	'stock.lander-ascent': {
		kind: 'hypergolic',
		counterpart: 'Apollo LM ascent stage (APS)',
		stage: true
	},
	'stock.orbiter-aft': {
		kind: 'hydrolox-sl',
		counterpart: 'the Shuttle orbiter aft fuselage (RS-25)',
		stage: true
	}
};

// --- the check ------------------------------------------------------------------------------------------

/** What `realismIssues` reads of a part: the registry's shape. */
export interface RealismPart {
	id: string;
	mass: number;
	shape?: { kind?: string; radius?: number };
	modules?: ReadonlyArray<readonly [string, unknown]>;
}

const ENGINE = 'stock.engine';
const RCS = 'stock.rcs';
const CONTAINER = 'stock.resource-container';
const LIQUID = ['stock.liquid-fuel', 'stock.oxidizer'];
const SOLID = 'stock.solid-fuel';
const MONOPROP = 'stock.monopropellant';
/** Modules that make a part more than a tank (a pod or probe with a little propellant). */
const NOT_A_TANK = new Set(['stock.command', 'stock.probe']);

const pct = (x: number): string => `${(x * 100).toFixed(1)} %`;
const inBand = (x: number, b: Band): boolean => x >= b.min - 1e-9 && x <= b.max + 1e-9;

interface EngineConfig {
	thrust: number;
	ispVacuum?: number;
	ispSeaLevel?: number;
	solid?: boolean;
}

/**
 * Every rule `part` breaks, as messages naming the part, the value and the band (empty when it
 * passes). `kinds` gives each engine part's kind (`STOCK_ENGINE_REALISM` for stock); an engine
 * missing from it is an issue. `density` gives kg per unit of a resource.
 */
export function realismIssues(
	part: RealismPart,
	kinds: Readonly<Record<string, PartRealism>>,
	density: (resource: string) => number,
	/** A tank's era (`STOCK_TANK_ERA` for stock); mid when absent. */
	eras: Readonly<Record<string, Era>> = {}
): string[] {
	const out: string[] = [];
	const modules = new Map(part.modules?.map(([id, c]) => [id, c]) ?? []);
	const diameter = part.shape?.kind === 'cylinder' ? (part.shape.radius ?? 0) * 2 : 0;
	const contents =
		(modules.get(CONTAINER) as { contents?: Record<string, { capacity: number }> } | undefined)
			?.contents ?? {};
	const kgOf = (ids: string[]): number =>
		ids.reduce((s, id) => s + (contents[id]?.capacity ?? 0) * density(id), 0);
	const liquid = kgOf(LIQUID);
	const solid = kgOf([SOLID]);
	const engine = modules.get(ENGINE) as EngineConfig | undefined;

	if (engine) {
		const r = kinds[part.id];
		if (!r) {
			out.push(
				`${part.id} has an engine but no realism kind: give it one (parts/realism.ts, STOCK_ENGINE_REALISM)`
			);
			return out;
		}
		const rule = ENGINE_KINDS[r.kind];
		const isp = (label: string, v: number | undefined, b: Band): void => {
			if (v === undefined || !inBand(v, b))
				out.push(
					`${part.id} (${r.kind}, like ${r.counterpart}): ${label} Isp ${v} s is outside ${b.min}–${b.max} s (${rule.references})`
				);
		};
		isp('vacuum', engine.ispVacuum, rule.ispVacuum);
		isp('sea-level', engine.ispSeaLevel, rule.ispSeaLevel);
		if (r.kind === 'solid' || r.kind === 'solid-early') {
			const f = part.mass / (part.mass + solid);
			if (!inBand(f, SOLID_BAND))
				out.push(
					`${part.id} (solid, like ${r.counterpart}): casing ${pct(f)} of the motor is outside ${pct(SOLID_BAND.min)}–${pct(SOLID_BAND.max)} (${rule.references})`
				);
		} else if (rule.twr) {
			if (r.stage) {
				// a stage is at least a bare tank of its propellant and its engine
				const floor =
					tankDryMass(liquid, diameter, eras[part.id]) + engineMass(r.kind, engine.thrust, r.bells);
				if (part.mass < floor * 0.95)
					out.push(
						`${part.id} (stage, like ${r.counterpart}): ${part.mass} kg dry is lighter than a bare tank of its ${Math.round(liquid)} kg of propellant plus its engine (${floor} kg)`
					);
			} else {
				const twr = engine.thrust / (part.mass * G0);
				const band = r.bells && r.bells > 1 ? { min: rule.twr.min / CLUSTER_STRUCTURE, max: rule.twr.max } : rule.twr;
				if (!inBand(twr, band))
					out.push(
						`${part.id} (${r.kind}, like ${r.counterpart}): thrust-to-weight ${twr.toFixed(1)} is outside ${band.min.toFixed(0)}–${band.max} (${rule.references})`
					);
			}
		}
		return out;
	}

	if (modules.has(RCS)) {
		const c = modules.get(RCS) as { ispVacuum?: number; propellant?: string };
		const b = c.propellant ? RCS_ISP[c.propellant] : undefined;
		if (b && (c.ispVacuum === undefined || !inBand(c.ispVacuum, b)))
			out.push(
				`${part.id} (RCS on ${c.propellant}): vacuum Isp ${c.ispVacuum} s is outside ${b.min}–${b.max} s (${b.references})`
			);
	}

	if ([...modules.keys()].some((id) => NOT_A_TANK.has(id))) return out;
	if (liquid > 0) {
		const f = part.mass / (part.mass + liquid);
		const era = eras[part.id] ?? 'mid';
		const ref = tankDryFraction(diameter, era);
		const band = { min: ref / TANK_TOLERANCE, max: ref * TANK_TOLERANCE };
		if (!inBand(f, band))
			out.push(
				`${part.id} (${era} tank, ${diameter.toFixed(3)} m): dry fraction ${pct(f)} is outside ${pct(band.min)}–${pct(band.max)} for its size class (S-IC 6.2 %, S-IVB 11 %, Centaur III 9.7 %)`
			);
	} else {
		const mono = kgOf([MONOPROP]);
		if (mono > 0 && mono >= part.mass) {
			const f = part.mass / (part.mass + mono);
			if (!inBand(f, MONOPROP_TANK_BAND))
				out.push(
					`${part.id} (monopropellant tank): dry fraction ${pct(f)} is outside ${pct(MONOPROP_TANK_BAND.min)}–${pct(MONOPROP_TANK_BAND.max)}`
				);
		}
	}
	return out;
}
