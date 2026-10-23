/**
 * The crew content the renderer draws (plan 375, ADR 0313 point 3): outfits, looks, expressions,
 * animations and portraits as the loaded plugins registered them. The web app fills it once per
 * page from the registries (`setCrewContent(crewContentOf(...))`); until then a neutral grey suit
 * stands in, so nothing throws. No three import: the portraits and the web pages read it too.
 */
import {
	bytesToBase64,
	crewPoseAt,
	lastMatching,
	REST_CREW_POSE,
	type CrewAnimationDefinition,
	type CrewAnimationRole,
	type CrewExpressionDefinition,
	type CrewLookDefinition,
	type CrewOutfitDefinition,
	type CrewOutfitUse,
	type CrewPortraitDefinition,
	type CrewPose,
	type ReadonlyRegistry
} from '@orbital/core';

export interface CrewPortraitImage {
	def: CrewPortraitDefinition;
	/** A data URL of the image asset. */
	url: string;
}

export interface CrewContent {
	outfits: readonly CrewOutfitDefinition[];
	looks: readonly CrewLookDefinition[];
	expressions: readonly CrewExpressionDefinition[];
	animations: readonly CrewAnimationDefinition[];
	portraits: readonly CrewPortraitImage[];
	/** Which plugin registered each item, by item id. */
	by: ReadonlyMap<string, string>;
	/** Portraits whose image could not be found, for the loader log. */
	missing: ReadonlyArray<{ id: string; by: string; image: string }>;
}

/** Shown before any content is set, or for an outfit id nobody registered. */
export const FALLBACK_OUTFIT: CrewOutfitDefinition = Object.freeze<CrewOutfitDefinition>({
	id: 'crew.fallback',
	title: 'Plain suit',
	body: 'suit',
	suit: 0x9aa0aa,
	trim: 0x7d838d,
	accent: 0x5b6270,
	legs: 0x9aa0aa,
	boots: 0x3a3d44,
	gloves: 0x3a3d44,
	headwear: 'none',
	headwearColour: 0,
	eyewear: 'none',
	prop: 'none',
	pack: 'none',
	harness: false
});

export const FALLBACK_EXPRESSION: CrewExpressionDefinition = Object.freeze<CrewExpressionDefinition>({
	id: 'crew.neutral',
	title: 'Neutral',
	eyes: { left: 'open', right: 'open' },
	mouth: 'smile'
});

const EMPTY: CrewContent = {
	outfits: [],
	looks: [],
	expressions: [],
	animations: [],
	portraits: [],
	by: new Map(),
	missing: []
};

let current: CrewContent = EMPTY;
let version = 0;

export function setCrewContent(content: CrewContent): void {
	current = content;
	version++;
}
export const crewContent = (): CrewContent => current;
/** Bumps on every `setCrewContent`: caches keyed by it drop stale portraits. */
export const crewContentVersion = (): number => version;

type Registries = {
	crewOutfits: Pick<ReadonlyRegistry<CrewOutfitDefinition>, 'entries'>;
	crewLooks: Pick<ReadonlyRegistry<CrewLookDefinition>, 'entries'>;
	crewExpressions: Pick<ReadonlyRegistry<CrewExpressionDefinition>, 'entries'>;
	crewAnimations: Pick<ReadonlyRegistry<CrewAnimationDefinition>, 'entries'>;
	crewPortraits: Pick<ReadonlyRegistry<CrewPortraitDefinition>, 'entries'>;
};

const MIME: Record<string, string> = { png: 'image/png', webp: 'image/webp' };

/**
 * The content of loaded registries. `image(mod, path)` gives the bytes of a mod's image asset
 * (portraits); a portrait whose image it cannot find is left out and listed in `missing`.
 */
export function crewContentOf(
	registries: Registries,
	image: (mod: string, path: string) => Uint8Array | undefined = () => undefined
): CrewContent {
	const by = new Map<string, string>();
	const list = <T extends { id: string }>(r: Pick<ReadonlyRegistry<T>, 'entries'>): T[] =>
		r.entries().map((e) => {
			by.set(e.def.id, e.by);
			return e.def;
		});
	const portraits: CrewPortraitImage[] = [];
	const missing: Array<{ id: string; by: string; image: string }> = [];
	for (const { def, by: mod } of registries.crewPortraits.entries()) {
		by.set(def.id, mod);
		const bytes = image(mod, def.image);
		const ext = def.image.split('.').pop() ?? '';
		if (!bytes || !MIME[ext]) {
			missing.push({ id: def.id, by: mod, image: def.image });
			continue;
		}
		portraits.push({ def, url: `data:${MIME[ext]};base64,${bytesToBase64(bytes)}` });
	}
	return {
		outfits: list(registries.crewOutfits),
		looks: list(registries.crewLooks),
		expressions: list(registries.crewExpressions),
		animations: list(registries.crewAnimations),
		portraits,
		by,
		missing
	};
}

// --- lookups ---------------------------------------------------------------------------------------

/** An outfit by id; the plain suit when nobody registered it. */
export function outfitOf(id: string): CrewOutfitDefinition {
	return current.outfits.find((o) => o.id === id) ?? FALLBACK_OUTFIT;
}

/** Every outfit the game may use for `use`, in registration order (at least the plain suit). */
export function outfitsFor(use: CrewOutfitUse): CrewOutfitDefinition[] {
	const out = current.outfits.filter((o) => o.uses?.includes(use));
	return out.length > 0 ? out : [FALLBACK_OUTFIT];
}

/** The one outfit for `use` (pod, eva): the last registered, so a mod's replaces stock's. */
export function outfitFor(use: CrewOutfitUse): CrewOutfitDefinition {
	return lastMatching(current.outfits, (o) => o.uses?.includes(use) === true) ?? FALLBACK_OUTFIT;
}

/** What a member of `profession` wears at the Space Center and in portraits; the pod outfit otherwise. */
export function outfitForProfession(profession: string): CrewOutfitDefinition {
	return (
		lastMatching(current.outfits, (o) => o.professions?.includes(profession) === true) ??
		outfitFor('pod')
	);
}

/** An expression by id, else the last one registered for that mood, else a neutral face. */
export function expressionOf(idOrMood: string | undefined): CrewExpressionDefinition {
	const want = idOrMood ?? 'happy';
	return (
		current.expressions.find((e) => e.id === want) ??
		lastMatching(current.expressions, (e) => e.mood === want) ??
		lastMatching(current.expressions, (e) => e.mood === 'happy') ??
		FALLBACK_EXPRESSION
	);
}

/** The animation the game plays for `role`: the last registered (ADR 0313 point 1). */
export function animationFor(role: CrewAnimationRole): CrewAnimationDefinition | undefined {
	return lastMatching(current.animations, (a) => a.role === role);
}

/** Length of one stride of the short legs, m: a keyframed walk spans one stride. */
export const STRIDE = 0.84;

/** The pose for `role` at `t` s, `walked` m along, for a figure offset by `seed`. */
export function poseFor(
	role: CrewAnimationRole,
	t: number,
	walked = 0,
	seed = 0,
	animation: CrewAnimationDefinition | undefined = animationFor(role)
): CrewPose {
	if (!animation) return { ...REST_CREW_POSE };
	// a keyframed walk follows the distance walked: one cycle per stride
	if (role === 'walk' && !animation.pose && animation.keys) {
		const duration = animation.duration ?? animation.keys[animation.keys.length - 1]!.t;
		return crewPoseAt(animation, (walked / STRIDE) * duration, { walked, seed: 0 });
	}
	return crewPoseAt(animation, t, { walked, seed });
}

/** A mod's portrait image for a member (by crew id) or an outfit; the crew match wins. */
export function portraitImageOf(crewId: string | undefined, outfit: string): string | undefined {
	const byCrew = crewId
		? lastMatching(current.portraits, (p) => p.def.crew === crewId)
		: undefined;
	return (byCrew ?? lastMatching(current.portraits, (p) => p.def.outfit === outfit))?.url;
}
