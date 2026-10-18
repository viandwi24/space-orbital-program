/**
 * zod schemas for data crossing a boundary into core (world data, registry definitions). Kept in
 * one file so the SDK can re-export them. zod v4 API (see docs/research/zod.md).
 */
import * as z from 'zod';
import { ACTION_KINDS } from './action-groups.ts';
import { categoryRefSchema } from './categories.ts';
import { DEFINITION_ID_PATTERN, PLUGIN_ID_PATTERN } from './ids.ts';
import { assetPathSchema } from './mod-assets.ts';
import { siteSchema } from './sites.ts';

export const definitionIdSchema = z
	.string()
	.regex(DEFINITION_ID_PATTERN, 'expected "<plugin>.<name>" in lower-case kebab-case');
export const pluginIdSchema = z
	.string()
	.regex(PLUGIN_ID_PATTERN, 'expected lower-case kebab-case segments joined by "."');

const entityIndex = z.int().nonnegative();

export const worldDataSchema = z.object({
	formatVersion: z.literal(1),
	nextEntity: entityIndex,
	entities: z.array(entityIndex),
	components: z.record(z.string(), z.record(z.string(), z.unknown()))
});

/**
 * The world fields of a run (plan 077, ADRs 0094, 0095, 0110). `gravityModel` names `n-body` so
 * the refusal can say why: no build accepts it until draft 125 ships.
 */
export const worldInfoSchema = z.object({
	id: z.string().min(1),
	seed: z.number().refine(Number.isFinite, 'expected a finite number'),
	systemId: z.string().min(1),
	systemVersion: z.string(),
	variant: z.string().min(1),
	gravityModel: z
		.enum(['patched', 'n-body'])
		.refine((g) => g === 'patched', 'n-body worlds are not available yet'),
	epoch: z.object({
		day: z.int(),
		fraction: z.number().min(0).lt(1)
	}),
	rules: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
	sites: z.array(siteSchema),
	/** Plan 078 (ADR 0111): additive in format 5, so a save without them reads with the defaults. */
	preset: z.string().min(1).default('stock.sandbox'),
	changelog: z
		.array(
			z.object({
				time: z.number().refine(Number.isFinite, 'expected a finite number'),
				rule: z.string().min(1),
				from: z.union([z.boolean(), z.number(), z.string()]),
				to: z.union([z.boolean(), z.number(), z.string()])
			})
		)
		.default([])
});

export const resourceDefinitionSchema = z.object({
	id: definitionIdSchema,
	density: z.number().positive(),
	flowMode: z.enum(['stack', 'vessel', 'none']),
	unit: z.string().min(1),
	/** Funds per unit (plan 095, ADR 0113); absent = 0. */
	price: z.number().nonnegative().optional()
});

/**
 * The shape of a body's ground, by data (ADR 0067): `hills` is the home planet's ridged terrain
 * (launch site at latitude 0, longitude 0), `craters` is the stock moon's cratered regolith with its
 * landing plain at the same place; `seed` gives another craters body its own field, and another hills
 * body its own continents (plan 071, ADR 0121; without it a later hills body mixes the world's seed
 * with its id). A body without
 * `terrain` is a smooth sphere. A kind is implemented in `@orbital/core` and drawn by the renderer's
 * own pass, so a mod picks a kind and a seed rather than supplying a function.
 */
export const bodyTerrainSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('hills'), seed: z.int().min(0).max(2_147_483_647).optional() }),
	z.object({ kind: z.literal('craters'), seed: z.int().min(0).max(999).optional() })
]);

/** A region id: lower-case words joined by `-` (it is part of a subject id). */
export const regionIdSchema = z.string().regex(/^[a-z][a-z0-9-]*$/, 'region id');

export const bodyDefinitionSchema = z.object({
	id: definitionIdSchema,
	mass: z.number().positive(),
	radius: z.number().positive(),
	rotationPeriod: z.number().positive(),
	/**
	 * Orientation as pole times spin (plan 085, ADR 0145): `q_pole · Ry(W(t))`, `W = w0 + wDot t` plus
	 * periodic terms. Absent: pole +Y and `W = 2 pi t / rotationPeriod`, exactly as before.
	 */
	rotation: z
		.object({
			/** The north pole: a direction in the system frame (rad), or the pole quaternion itself. */
			pole: z
				.union([
					z.object({
						ra: z.number(),
						dec: z
							.number()
							.min(-Math.PI / 2)
							.max(Math.PI / 2)
					}),
					z.object({ x: z.number(), y: z.number(), z: z.number(), w: z.number() })
				])
				.optional(),
			/** Spin angle at t = 0, rad. */
			w0: z.number().optional(),
			/** Spin rate, rad/s; default `2 pi / rotationPeriod`. Negative spins retrograde. */
			wDot: z
				.number()
				.refine((v) => Number.isFinite(v) && v !== 0, 'expected a non-zero spin rate')
				.optional(),
			/**
			 * The time `w0` and the periodic phases are measured at (plan 124, ADR 0184 point 3): the
			 * world's start (default) or J2000 TDB, which the sim shifts by the world's epoch.
			 */
			epoch: z.enum(['world', 'j2000']).optional(),
			/** Small periodic terms added to W: `amplitude sin(rate t + phase)` (rad, rad/s, rad). */
			periodic: z
				.array(z.object({ amplitude: z.number(), rate: z.number(), phase: z.number() }))
				.optional()
		})
		.optional(),
	atmosphere: z
		.object({
			scaleHeight: z.number().positive(),
			surfacePressure: z.number().nonnegative(),
			height: z.number().positive(),
			/** Whether the night sky shows an aurora around the magnetic pole (plan 061, ADR 0093); on unless `false`. */
			aurora: z.boolean().optional()
		})
		.optional(),
	/** Science thresholds and multiplier (plan 103, ADR 0178 point 2); defaults from the atmosphere and radius. */
	science: z
		.object({
			flyingHigh: z.number().nonnegative().optional(),
			spaceHigh: z.number().positive().optional(),
			multiplier: z.number().positive().optional()
		})
		.optional(),
	/** Science regions (plan 104, ADR 0180 point 1); absent = one `global` region. */
	regions: z
		.discriminatedUnion('kind', [
			z.object({
				kind: z.literal('biomes'),
				regions: z
					.array(
						z.object({
							id: z.enum(['ocean', 'beach', 'grass', 'forest', 'desert', 'rock', 'snow']),
							label: z.string().min(1).optional(),
							multiplier: z.number().positive().optional()
						})
					)
					.optional()
			}),
			z.object({
				kind: z.literal('cells'),
				seed: z.int().nonnegative(),
				cells: z.int().positive().optional(),
				regions: z
					.array(
						z.object({
							id: regionIdSchema,
							label: z.string().min(1),
							multiplier: z.number().positive().optional()
						})
					)
					.min(1)
			}),
			z.object({
				kind: z.literal('bands'),
				bands: z
					.array(
						z.object({
							id: regionIdSchema,
							label: z.string().min(1),
							from: z
								.number()
								.min(-Math.PI / 2)
								.max(Math.PI / 2),
							to: z
								.number()
								.min(-Math.PI / 2)
								.max(Math.PI / 2),
							multiplier: z.number().positive().optional()
						})
					)
					.min(1)
			})
		])
		.optional(),
	parent: definitionIdSchema.optional(),
	/** A star (plan 122, ADR 0119): no surface; the renderer draws it emissive and lights the system from it. */
	star: z.boolean().optional(),
	/** The system's calendar, read on the root body only (plan 081, ADR 0141); absent = fictional from the root. */
	calendar: z
		.discriminatedUnion('kind', [
			z.object({ kind: z.literal('gregorian-utc') }),
			z.object({ kind: z.literal('fictional'), home: definitionIdSchema })
		])
		.optional(),
	terrain: bodyTerrainSchema.optional(),
	orbit: z
		.object({
			a: z.number().positive(),
			e: z.number().nonnegative().lt(1),
			i: z.number(),
			raan: z.number(),
			argp: z.number(),
			m0: z.number(),
			epoch: z.number(),
			/**
			 * Path model (plan 123, ADR 0183): `kepler` (default, a fixed conic on the world's time),
			 * `kepler-rates` (elements at `epoch` s from J2000 with `rates`) or `series` (`series`).
			 */
			model: z.enum(['kepler', 'kepler-rates', 'series']).optional(),
			rates: z
				.object({
					a: z.number().optional(),
					e: z.number().optional(),
					i: z.number().optional(),
					raan: z.number().optional(),
					argp: z.number().optional(),
					meanMotion: z.number()
				})
				.optional(),
			series: z
				.object({
					longitude: z.object({
						base: z.tuple([z.number(), z.number()]),
						terms: z.array(z.tuple([z.number(), z.number(), z.number()]))
					}),
					latitude: z.object({ terms: z.array(z.tuple([z.number(), z.number(), z.number()])) }),
					parallax: z.object({
						base: z.number().positive(),
						terms: z.array(z.tuple([z.number(), z.number(), z.number()]))
					}),
					parentRadius: z.number().positive()
				})
				.optional()
		})
		.refine((o) => o.model !== 'kepler-rates' || o.rates !== undefined, 'kepler-rates needs rates')
		.refine((o) => o.model !== 'series' || o.series !== undefined, 'series needs series')
		.optional()
});

const vec3Tuple = z.tuple([z.number(), z.number(), z.number()]);

/**
 * Placeholder geometry for a part, metres, centred on the part origin. A cylinder's axis is the
 * local Y axis (the same axis the attach nodes use). Mirrors the renderer's `PartShape` (ADR 0012)
 * so hosts map it 1:1; plan 007 derives the physics body shape from it (ADR 0014).
 */
export const partShapeSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('box'),
		size: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()])
	}),
	z.object({
		kind: z.literal('cylinder'),
		radius: z.number().positive(),
		height: z.number().positive()
	})
]);

const hexColour = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected "#rrggbb"');

/**
 * What a part looks like (ADR 0028). `kind` names a renderer generator; `params` are read (and
 * clamped) by that generator. `plume` and `deploy` name the module whose snapshot drives the
 * effect: `plume` reads `ignited`, `throttle` and `flameout`; `deploy` reads the boolean `flag`.
 * Lengths in metres, pressure in Pa, in the part frame (thrust along local +Y).
 */
export const partVisualSchema = z.object({
	/** Generator name; with `asset`, the generator that draws the part when the model cannot load. */
	kind: z.string().min(1),
	/**
	 * A model the mod's package ships (ADR 0076): the path of a `.glb` in the package's assets. The
	 * model is authored in the part frame (origin at the part's centre, +Y up, metres), fits the
	 * part's `shape`, and may contain a node named `moving` that the `articulation` turns.
	 */
	asset: assetPathSchema.optional(),
	palette: z
		.object({
			primary: hexColour.optional(),
			secondary: hexColour.optional(),
			accent: hexColour.optional()
		})
		.optional(),
	params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
	plume: z
		.object({
			module: definitionIdSchema,
			nozzle: vec3Tuple,
			/**
			 * The exit centre of each bell of a multi-nozzle engine (2 to 9; ADR 0081). Each draws its
			 * own plume of `exitRadius`; `nozzle` stays the thrust centre the ground effects (dust,
			 * ground light, trail) use.
			 */
			nozzles: z.array(vec3Tuple).min(2).max(9).optional(),
			exitRadius: z.number().positive(),
			length: z.number().positive(),
			exitPressure: z.number().positive().optional(),
			color: hexColour.optional()
		})
		.optional(),
	deploy: z
		.object({
			module: definitionIdSchema,
			flag: z.string().min(1),
			seconds: z.number().positive().optional()
		})
		.optional(),
	/**
	 * A moving piece of the model driven by a number in a module's snapshot (ADR 0045): `gimbal`
	 * reads `[towardX, towardZ]` thrust tilt angles in rad, `hinge` one angle about the part's X axis.
	 */
	articulation: z
		.object({
			module: definitionIdSchema,
			field: z.string().min(1),
			mode: z.enum(['gimbal', 'hinge'])
		})
		.optional()
});

export const partDefinitionSchema = z.object({
	id: definitionIdSchema,
	title: z.string().min(1),
	mass: z.number().nonnegative(),
	/** Funds for the dry part (plan 095, ADR 0113); contents are priced by their resource. */
	cost: z.number().nonnegative().optional(),
	mesh: z.string().optional(),
	shape: partShapeSchema.optional(),
	/** Look of the part (ADR 0028). Optional: parts without one render as their `shape`. */
	visual: partVisualSchema.optional(),
	/** Resources may flow through this part (default true); engines and decouplers set false. */
	crossfeed: z.boolean().optional(),
	/**
	 * Ground impact speed (m/s, closing speed along the ground normal) above which the part breaks
	 * off; above twice this it is destroyed (ADR 0019). The sim assumes 6 when absent.
	 */
	impactTolerance: z.number().positive().optional(),
	/** Seats for crew (plan 106, ADR 0176 point 3); absent: none. */
	crewCapacity: z.int().min(0).max(32).optional(),
	/** The vessel can walk on the ground at up to `speed` m/s (plan 109, ADR 0120 point 3: the EVA suit). */
	walk: z.object({ speed: z.number().positive() }).optional(),
	/**
	 * Skin temperature in kelvin above which the part is lost to overheating (ADR 0023); the sim
	 * assumes 1000 when absent.
	 */
	maxTemperature: z.number().positive().optional(),
	/**
	 * Drag coefficient of the part, replacing the default 0.3 (a nose cone has less). The name
	 * `surface` is reserved for radial attachment (ADR 0034) and cannot be a node.
	 */
	dragCoefficient: z.number().positive().optional(),
	/**
	 * The part is a connector (ADR 0071): it hangs on one part like any other and its design entry
	 * names a second part its far end lands on. `feeds` makes it a fuel line: resources of the
	 * part it hangs on are available to the part it ends on.
	 */
	connector: z.object({ feeds: z.boolean().optional() }).optional(),
	attach: z
		.record(z.string(), z.object({ pos: vec3Tuple, dir: vec3Tuple }))
		.refine((a) => !('surface' in a), 'the node name "surface" is reserved for radial attachment')
		.optional(),
	// Entries are [moduleId, config]; the config is validated against the module's schema by the
	// loader (plan 005), which is the only place both registries are visible.
	modules: z.array(z.tuple([definitionIdSchema, z.unknown()])).optional(),
	stagingIcon: z.string().optional(),
	/** The tech node that unlocks this part (plan 105, ADR 0154 point 1). */
	techNode: definitionIdSchema.optional(),
	/**
	 * Where the part sits in the editor's catalogue (ADR 0082). `category` overrides the one the
	 * part's modules imply (`ModuleInfo.category`, an engine, a separator, ...); `order` sorts the
	 * part within its category, ascending, default 0, ties in registration order.
	 */
	catalog: z
		.object({
			category: categoryRefSchema.optional(),
			order: z.number().finite().optional()
		})
		.optional()
});

/** Editor catalogue categories a module may name (`ModuleInfo.category`); engines, separators and lifting plates imply theirs. */
export const MODULE_CATEGORIES = [
	'command',
	'propulsion',
	'tanks',
	'structural',
	'aero',
	'control',
	'landing',
	'thermal'
] as const;
export type ModuleCategory = (typeof MODULE_CATEGORIES)[number];

// ---- part actions and action groups (plan 110, ADR 0174) ----

const finiteNumber = z.number().refine(Number.isFinite, 'must be finite');

export const partActionDescriptorSchema = z
	.object({
		id: z.string().min(1),
		label: z.string().min(1),
		kind: z.enum(ACTION_KINDS),
		value: z.union([z.boolean(), finiteNumber, z.string()]).optional(),
		min: finiteNumber.optional(),
		max: finiteNumber.optional(),
		step: finiteNumber.refine((s) => s > 0, 'step must be positive').optional(),
		unit: z.string().optional(),
		options: z
			.array(z.object({ value: z.string().min(1), label: z.string().min(1) }))
			.min(1)
			.optional(),
		enabled: z.boolean(),
		reason: z.string().optional(),
		group: definitionIdSchema.optional(),
		icon: z.string().optional()
	})
	.superRefine((d, ctx) => {
		const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
		if (d.kind === 'toggle' && typeof d.value !== 'boolean')
			issue('a toggle needs a boolean value');
		if (
			d.kind === 'value' &&
			(typeof d.value !== 'number' || d.min === undefined || d.max === undefined)
		) {
			issue('a value needs a number value, min and max');
		}
		if (
			d.kind === 'mode' &&
			(typeof d.value !== 'string' || !d.options?.some((o) => o.value === d.value))
		) {
			issue('a mode needs options and a value that is one of them');
		}
		if (d.kind === 'trigger' && d.value !== undefined) issue('a trigger has no value');
	});

export const actionGroupDefinitionSchema = z.object({
	id: definitionIdSchema,
	label: z.string().min(1),
	icon: z.string().optional(),
	order: finiteNumber.optional()
});

/**
 * What a module tells tools about itself (ADR 0033): the result of `ModuleDefinition.describe`.
 * Plain data, validated when a tool reads it. Pressure in Pa, thrust in N, flow in kg/s.
 */
export const moduleInfoSchema = z.object({
	/** Controls the module offers (plan 110, ADR 0174). */
	actions: z.array(partActionDescriptorSchema).optional(),
	/** The module is a science experiment (plan 103, ADR 0178 point 5): its id and state. */
	experiment: z
		.object({
			id: z.string().min(1),
			state: z.enum(['READY', 'RUNNING', 'PAUSED', 'INVALID']),
			reason: z.string().optional(),
			progress: z.number().min(0).max(1)
		})
		.optional(),
	/** The module is an engine. */
	engine: z
		.object({
			/** Propellant mass flow at full throttle, kg/s. Does not change with ambient pressure. */
			massFlow: z.number().positive(),
			/**
			 * Thrust at full throttle over ambient pressure: piecewise linear, ascending pressure, first
			 * point at 0 Pa (vacuum), clamped beyond the ends.
			 */
			thrust: z
				.array(z.object({ pressure: z.number().nonnegative(), thrust: z.number().positive() }))
				.min(1)
				.refine((c) => c[0]?.pressure === 0, 'the first thrust point must be at 0 Pa (vacuum)')
				.refine(
					(c) => c.every((p, i) => i === 0 || p.pressure > c[i - 1]!.pressure),
					'thrust points must have strictly ascending pressure'
				),
			/** Consumed resources; `ratio` is relative volume (units), as in the draw rule of ADR 0015. */
			propellants: z
				.array(z.object({ resource: definitionIdSchema, ratio: z.number().positive() }))
				.min(1),
			/**
			 * Thrust direction in the part frame (a unit vector), default +Y (ADR 0071): a tilted
			 * engine's useful thrust along the flight direction is its component along the vessel axis.
			 */
			axis: z.tuple([z.number(), z.number(), z.number()]).optional(),
			/** Burning now (or, for a design, false). */
			ignited: z.boolean(),
			/** Shut down because propellant ran short. */
			flameout: z.boolean(),
			/** Commanded throttle now, 0..1, for the HUD gauge; absent for a design (plan 023). */
			throttle: z.number().min(0).max(1).optional()
		})
		.optional(),
	/**
	 * The module is a lifting plate (a fin): its planform area, lift-curve slope per radian, normal
	 * force coefficient broadside to the flow and centre of pressure in the part frame (m). The
	 * stability read-out of the editor evaluates the same normal-force law as the sim (plan 023).
	 */
	lift: z
		.object({
			area: z.number().positive(),
			liftSlope: z.number().positive(),
			crossflow: z.number().positive(),
			centre: z.tuple([z.number(), z.number(), z.number()])
		})
		.optional(),
	/** Where the part appears in the editor's catalogue; the first module that names one decides (plan 023). */
	category: z.union([z.enum(MODULE_CATEGORIES), definitionIdSchema]).optional(),
	/** The module severs an attachment when its stage fires. */
	separator: z
		.object({
			/** The attach node of this part the module passes to `vessel.detach`. */
			node: z.string().min(1),
			/** Already fired. */
			done: z.boolean()
		})
		.optional()
});
