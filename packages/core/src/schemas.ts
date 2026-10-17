/**
 * zod schemas for data crossing a boundary into core (world data, registry definitions). Kept in
 * one file so the SDK can re-export them. zod v4 API (see docs/research/zod.md).
 */
import * as z from 'zod';
import { DEFINITION_ID_PATTERN, PLUGIN_ID_PATTERN } from './ids.ts';
import { assetPathSchema } from './mod-assets.ts';

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

export const resourceDefinitionSchema = z.object({
	id: definitionIdSchema,
	density: z.number().positive(),
	flowMode: z.enum(['stack', 'vessel', 'none']),
	unit: z.string().min(1)
});

/**
 * The shape of a body's ground, by data (ADR 0067): `hills` is the home planet's ridged terrain
 * (launch site at latitude 0, longitude 0), `craters` is the stock moon's cratered regolith with its
 * landing plain at the same place; `seed` gives another craters body its own field. A body without
 * `terrain` is a smooth sphere. A kind is implemented in `@orbital/core` and drawn by the renderer's
 * own pass, so a mod picks a kind and a seed rather than supplying a function.
 */
export const bodyTerrainSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('hills') }),
	z.object({ kind: z.literal('craters'), seed: z.int().min(0).max(999).optional() })
]);

export const bodyDefinitionSchema = z.object({
	id: definitionIdSchema,
	mass: z.number().positive(),
	radius: z.number().positive(),
	rotationPeriod: z.number().positive(),
	atmosphere: z
		.object({
			scaleHeight: z.number().positive(),
			surfacePressure: z.number().nonnegative(),
			height: z.number().positive()
		})
		.optional(),
	parent: definitionIdSchema.optional(),
	terrain: bodyTerrainSchema.optional(),
	orbit: z
		.object({
			a: z.number().positive(),
			e: z.number().nonnegative().lt(1),
			i: z.number(),
			raan: z.number(),
			argp: z.number(),
			m0: z.number(),
			epoch: z.number()
		})
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
	/**
	 * Where the part sits in the editor's catalogue (ADR 0082). `category` overrides the one the
	 * part's modules imply (`ModuleInfo.category`, an engine, a separator, ...); `order` sorts the
	 * part within its category, ascending, default 0, ties in registration order.
	 */
	catalog: z
		.object({
			category: z
				.enum([
					'command',
					'propulsion',
					'tanks',
					'structural',
					'aero',
					'control',
					'landing',
					'thermal',
					'other'
				])
				.optional(),
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

/**
 * What a module tells tools about itself (ADR 0033): the result of `ModuleDefinition.describe`.
 * Plain data, validated when a tool reads it. Pressure in Pa, thrust in N, flow in kg/s.
 */
export const moduleInfoSchema = z.object({
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
	category: z.enum(MODULE_CATEGORIES).optional(),
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
