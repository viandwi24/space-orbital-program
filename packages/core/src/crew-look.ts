/**
 * The crew content API (plan 375, ADR 0313): how crew members look and move, registered by plugins.
 * The registries:
 * - outfits;
 * - looks (skin, hair colour, hair style, eye colour);
 * - expressions (faces as data);
 * - animations (poses by role);
 * - portraits (image assets).
 * Stock registers the character of ADR 0291 through them. The renderer draws from them; it owns the
 * geometry and the painter. Plain data and pure functions.
 */
import * as z from 'zod';
import { imageAssetPathSchema } from './mod-assets.ts';
import { DEFINITION_ID_PATTERN } from './ids.ts';

const idSchema = z
	.string()
	.regex(DEFINITION_ID_PATTERN, 'expected "<plugin>.<name>" in lower-case kebab-case');
const colour = z.number().int().min(0).max(0xffffff);

// --- outfits -------------------------------------------------------------------------------------------

export const CREW_BODIES = ['suit', 'coat', 'shirt'] as const;
export const CREW_HEADWEAR = [
	'none',
	'helmet',
	'hard-hat',
	'cap',
	'headset',
	'goggles',
	'pilot-goggles'
] as const;
export const CREW_EYEWEAR = ['none', 'glasses', 'sunglasses'] as const;
export const CREW_PROPS = ['none', 'wrench', 'tablet', 'clipboard', 'camera'] as const;
export const CREW_PACKS = ['none', 'small', 'eva'] as const;
/**
 * Where the game dresses people in an outfit:
 * - `pod`: crew in a vessel, portraits of assigned crew;
 * - `eva`: the EVA suit;
 * - `hangar`: the Hangar's walkers;
 * - `space-center`: the Space Center's people;
 * - `lineup`: the developer line-up only.
 */
export const CREW_OUTFIT_USES = ['pod', 'eva', 'hangar', 'space-center', 'lineup'] as const;
export type CrewOutfitUse = (typeof CREW_OUTFIT_USES)[number];

export interface CrewOutfitDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	title: string;
	body: (typeof CREW_BODIES)[number];
	/** Main cloth, trim (cuffs, collar, side panels), accent (patches, stripes), sRGB hex. */
	suit: number;
	trim: number;
	accent: number;
	/** Trousers under a coat or a shirt; the suit colour otherwise. */
	legs: number;
	boots: number;
	/** A colour, or `skin`: bare hands in the wearer's skin colour. */
	gloves: number | 'skin';
	headwear: (typeof CREW_HEADWEAR)[number];
	headwearColour: number;
	eyewear: (typeof CREW_EYEWEAR)[number];
	prop: (typeof CREW_PROPS)[number];
	pack: (typeof CREW_PACKS)[number];
	/** Harness straps and a belt over the chest. */
	harness: boolean;
	stethoscope?: boolean;
	/** A tie under a coat, its colour. */
	tie?: number;
	/** Where the game may dress people in it; absent: the line-up only. */
	uses?: readonly CrewOutfitUse[];
	/** Crew professions that wear it at the Space Center and in their portraits (`engineer`, …). */
	professions?: readonly string[];
}

export const crewOutfitDefinitionSchema = z.object({
	id: idSchema,
	title: z.string().min(1),
	body: z.enum(CREW_BODIES),
	suit: colour,
	trim: colour,
	accent: colour,
	legs: colour,
	boots: colour,
	gloves: z.union([colour, z.literal('skin')]),
	headwear: z.enum(CREW_HEADWEAR),
	headwearColour: colour,
	eyewear: z.enum(CREW_EYEWEAR),
	prop: z.enum(CREW_PROPS),
	pack: z.enum(CREW_PACKS),
	harness: z.boolean(),
	stethoscope: z.boolean().optional(),
	tie: colour.optional(),
	uses: z.array(z.enum(CREW_OUTFIT_USES)).optional(),
	professions: z.array(z.string().min(1)).optional()
});

// --- looks ---------------------------------------------------------------------------------------------

export const CREW_LOOK_KINDS = ['skin', 'hair-colour', 'hair-style', 'eye-colour'] as const;
export type CrewLookKind = (typeof CREW_LOOK_KINDS)[number];
/** The hair shapes the renderer can draw. */
export const CREW_HAIR_STYLES = ['tousled', 'swept', 'short'] as const;
export type CrewHairStyle = (typeof CREW_HAIR_STYLES)[number];

export interface CrewLookDefinition {
	id: string;
	title: string;
	kind: CrewLookKind;
	/** sRGB hex; for `hair-style` unused (0). */
	colour: number;
	/** For `hair-style`: which shape. */
	style?: CrewHairStyle;
	/** How often a crew id's hash picks it among its kind; default 1. */
	weight?: number;
}

export const crewLookDefinitionSchema = z
	.object({
		id: idSchema,
		title: z.string().min(1),
		kind: z.enum(CREW_LOOK_KINDS),
		colour,
		style: z.enum(CREW_HAIR_STYLES).optional(),
		weight: z.number().int().min(1).max(100).optional()
	})
	.refine((d) => d.kind !== 'hair-style' || d.style !== undefined, {
		message: 'a hair-style look names its style'
	});

/** Hash bits each kind draws from, so adding a skin keeps everyone's hair. */
const LOOK_SHIFT: Record<CrewLookKind, number> = {
	skin: 0,
	'hair-style': 8,
	'hair-colour': 12,
	'eye-colour': 20
};

/** FNV-1a over the id's UTF-16 code units: a stable 32-bit hash. */
export function hashCrewId(id: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < id.length; i++) {
		h ^= id.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/** The look of `kind` a crew id gets: weighted by the hash bits of that kind; undefined without any. */
export function pickLook(
	looks: readonly CrewLookDefinition[],
	kind: CrewLookKind,
	hash: number
): CrewLookDefinition | undefined {
	const mine = looks.filter((l) => l.kind === kind);
	const total = mine.reduce((n, l) => n + (l.weight ?? 1), 0);
	if (total === 0) return undefined;
	// eye colour came later (ADR 0313): a remixed hash, since FNV's bit 20 hardly varies for short
	// ids; the other kinds keep the bits ADR 0291 used, so existing crew keep their looks
	const bits =
		kind === 'eye-colour'
			? Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d) >>> LOOK_SHIFT[kind]
			: hash >>> LOOK_SHIFT[kind];
	let at = (bits >>> 0) % total;
	for (const l of mine) {
		at -= l.weight ?? 1;
		if (at < 0) return l;
	}
	return mine[mine.length - 1];
}

// --- expressions ---------------------------------------------------------------------------------------

/**
 * Eye shapes the face can draw:
 * - `open`, `big` and `wide`: round eyes, wider for each;
 * - `closed-up`: a smiling squint (∩);
 * - `closed-down`: asleep (∪).
 */
export const CREW_EYES = ['open', 'big', 'wide', 'closed-up', 'closed-down'] as const;
export const CREW_MOUTHS = ['smile', 'grin', 'o', 'small-o', 'tilt', 'frown'] as const;
/** What the game asks a face for; an expression may serve one. */
export const CREW_MOODS = [
	'happy',
	'surprised',
	'wink',
	'excited',
	'confused',
	'sad',
	'angry',
	'sleepy'
] as const;
export type CrewMood = (typeof CREW_MOODS)[number];

export interface CrewExpressionDefinition {
	id: string;
	title: string;
	/** The game's request it answers (the last registered for a mood wins). */
	mood?: CrewMood;
	/** The figure's left and right eye. */
	eyes: { left: (typeof CREW_EYES)[number]; right: (typeof CREW_EYES)[number] };
	brows?: {
		/** Tilt of the left and right brow, rad; a positive tilt lifts the outer end. */
		tilt?: readonly [number, number];
		/** Height offset, m on the 1.7 m figure (about ±0.03). */
		lift?: number;
		/** Raises one brow more, m: [left, right]. */
		raise?: readonly [number, number];
	};
	mouth: (typeof CREW_MOUTHS)[number];
}

const eye = z.enum(CREW_EYES);
export const crewExpressionDefinitionSchema = z.object({
	id: idSchema,
	title: z.string().min(1),
	mood: z.enum(CREW_MOODS).optional(),
	eyes: z.object({ left: eye, right: eye }),
	brows: z
		.object({
			tilt: z.tuple([z.number().min(-1).max(1), z.number().min(-1).max(1)]).optional(),
			lift: z.number().min(-0.05).max(0.05).optional(),
			raise: z.tuple([z.number().min(0).max(0.05), z.number().min(0).max(0.05)]).optional()
		})
		.optional(),
	mouth: z.enum(CREW_MOUTHS)
});

// --- animations ----------------------------------------------------------------------------------------

/** The eleven channels of a pose (ADR 0291): metres for `bob`, radians for the rest. */
export const CREW_POSE_CHANNELS = [
	'bob',
	'lean',
	'headPitch',
	'headYaw',
	'headRoll',
	'armLPitch',
	'armLRaise',
	'armRPitch',
	'armRRaise',
	'legLPitch',
	'legRPitch'
] as const;
export type CrewPoseChannel = (typeof CREW_POSE_CHANNELS)[number];
export type CrewPose = Record<CrewPoseChannel, number>;

export const REST_CREW_POSE: CrewPose = Object.freeze(
	Object.fromEntries(CREW_POSE_CHANNELS.map((c) => [c, 0])) as CrewPose
);

/** What the game asks an animation for. `eva` is shown in the line-up only (ADR 0313 point 1). */
export const CREW_ANIMATION_ROLES = ['idle', 'walk', 'wave', 'work', 'eva'] as const;
export type CrewAnimationRole = (typeof CREW_ANIMATION_ROLES)[number];

export interface CrewPoseContext {
	/** Metres walked (the walk cycle follows it, so feet do not slide). */
	walked: number;
	/** Offsets idle motions so a group does not move in step. */
	seed: number;
}

export interface CrewAnimationDefinition {
	id: string;
	title: string;
	role: CrewAnimationRole;
	/** Keyframes: times in seconds, each a partial pose (missing channels are 0). */
	keys?: ReadonlyArray<{ t: number; pose: Partial<CrewPose> }>;
	/** Seconds of the keyframed cycle; default the last key's time. */
	duration?: number;
	/** The keyframes repeat (default true); otherwise the last pose holds. */
	loop?: boolean;
	/** A pure pose of time instead of keyframes. */
	pose?: (t: number, ctx: CrewPoseContext) => Partial<CrewPose>;
}

const poseSchema = z.partialRecord(z.enum(CREW_POSE_CHANNELS), z.number());
export const crewAnimationDefinitionSchema = z
	.object({
		id: idSchema,
		title: z.string().min(1),
		role: z.enum(CREW_ANIMATION_ROLES),
		keys: z
			.array(z.object({ t: z.number().min(0), pose: poseSchema }))
			.min(1)
			.optional(),
		duration: z.number().positive().optional(),
		loop: z.boolean().optional(),
		pose: z.custom<CrewAnimationDefinition['pose']>((v) => typeof v === 'function').optional()
	})
	.refine((d) => (d.keys === undefined) !== (d.pose === undefined), {
		message: 'an animation has either keys or a pose function'
	});

const full = (p: Partial<CrewPose>): CrewPose => ({ ...REST_CREW_POSE, ...p });
const smooth = (u: number): number => u * u * (3 - 2 * u);

/** The pose of `animation` at `t` seconds: its function, or its keyframes eased between. */
export function crewPoseAt(
	animation: Pick<CrewAnimationDefinition, 'keys' | 'duration' | 'loop' | 'pose'>,
	t: number,
	ctx: CrewPoseContext = { walked: 0, seed: 0 }
): CrewPose {
	if (animation.pose) return full(animation.pose(t, ctx));
	const keys = [...(animation.keys ?? [])].sort((a, b) => a.t - b.t);
	if (keys.length === 0) return { ...REST_CREW_POSE };
	if (keys.length === 1) return full(keys[0]!.pose);
	const last = keys[keys.length - 1]!;
	const duration = animation.duration ?? last.t;
	const loop = animation.loop !== false && duration > 0;
	const time = loop ? (((t + ctx.seed * 0.37) % duration) + duration) % duration : Math.min(t, last.t);
	let a = keys[0]!;
	let b = keys[1]!;
	let span = b.t - a.t;
	let u: number;
	if (time < keys[0]!.t) {
		// before the first key on a loop: from the last key round to the first
		a = last;
		b = keys[0]!;
		span = duration - last.t + keys[0]!.t;
		u = span > 0 ? (time + duration - last.t) / span : 1;
	} else if (time >= last.t) {
		if (!loop) return full(last.pose);
		a = last;
		b = keys[0]!;
		span = duration - last.t + keys[0]!.t;
		u = span > 0 ? (time - last.t) / span : 1;
	} else {
		let i = 0;
		while (keys[i + 1]!.t <= time) i++;
		a = keys[i]!;
		b = keys[i + 1]!;
		span = b.t - a.t;
		u = span > 0 ? (time - a.t) / span : 1;
	}
	const k = smooth(Math.min(1, Math.max(0, u)));
	const pa = full(a.pose);
	const pb = full(b.pose);
	const out = { ...REST_CREW_POSE };
	for (const c of CREW_POSE_CHANNELS) out[c] = pa[c] + (pb[c] - pa[c]) * k;
	return out;
}

// --- portraits -----------------------------------------------------------------------------------------

export interface CrewPortraitDefinition {
	id: string;
	title: string;
	/** An image asset of the registering mod's package (`.png` or `.webp`, format 3). */
	image: string;
	/** Every portrait in this outfit (an outfit id). */
	outfit?: string;
	/** One crew member, by their crew id. Wins over `outfit`. */
	crew?: string;
}

export const crewPortraitDefinitionSchema = z
	.object({
		id: idSchema,
		title: z.string().min(1),
		image: imageAssetPathSchema,
		outfit: idSchema.optional(),
		crew: z.string().min(1).optional()
	})
	.refine((d) => d.outfit !== undefined || d.crew !== undefined, {
		message: 'a portrait matches an outfit or a crew id'
	});

// --- choosing ------------------------------------------------------------------------------------------

/** The last definition in `list` (registration order) that `match` accepts: later plugins override. */
export function lastMatching<T>(list: readonly T[], match: (d: T) => boolean): T | undefined {
	for (let i = list.length - 1; i >= 0; i--) if (match(list[i]!)) return list[i];
	return undefined;
}
