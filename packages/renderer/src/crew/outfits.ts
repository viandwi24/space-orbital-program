/**
 * The crew character's types and a stable look per crew id (plan 341, ADR 0291). Since plan 375
 * (ADR 0313) the data itself is registered by plugins: stock's outfits, skins, hair and faces live
 * in `mods/stock/src/crew-look.ts`, and `content.ts` holds what the loaded plugins registered.
 * Plain data and pure functions, no three.
 */
import {
	hashCrewId,
	pickLook,
	type CrewExpressionDefinition,
	type CrewHairStyle,
	type CrewOutfitDefinition
} from '@orbital/core';
import { crewContent } from './content.ts';

export {
	FALLBACK_OUTFIT,
	crewContent,
	crewContentOf,
	crewContentVersion,
	expressionOf,
	outfitFor,
	outfitForProfession,
	outfitOf,
	outfitsFor,
	portraitImageOf,
	setCrewContent,
	type CrewContent
} from './content.ts';

/** Every person's height in world metres, feet to the top of the hair (helmets and hats add a little). */
export const CREW_HEIGHT = 1.7;

export type Outfit = CrewOutfitDefinition;
export type Expression = CrewExpressionDefinition;
export type HairStyle = CrewHairStyle;
export type Headwear = Outfit['headwear'];
export type Eyewear = Outfit['eyewear'];
export type Prop = Outfit['prop'];
export type Body = Outfit['body'];

/** How a person looks apart from the outfit: colours already resolved from the looks. */
export interface Appearance {
	/** The skin look's id (`stock.skin-sky-blue`), for the line-up's picker. */
	skinId: string;
	skin: number;
	hairStyle: HairStyle;
	hairColour: number;
	eyeColour: number;
	/** A seed for the hair tufts' small differences. */
	seed: number;
}

export const DEFAULT_APPEARANCE: Appearance = {
	skinId: 'stock.skin-sky-blue',
	skin: 0x8ec5f2,
	hairStyle: 'tousled',
	hairColour: 0x7a4a26,
	eyeColour: 0x2a1a14,
	seed: 1
};

/** FNV-1a over the id's UTF-16 code units: a stable 32-bit hash. */
export const hashId = hashCrewId;

/**
 * A crew member's look from their id: the same id gives the same skin, hair style, hair colour and
 * eye colour on every page and in every session, drawn by weight from the registered looks.
 */
export function appearanceOf(id: string): Appearance {
	const h = hashCrewId(id);
	const looks = crewContent().looks;
	const skin = pickLook(looks, 'skin', h);
	return {
		skinId: skin?.id ?? DEFAULT_APPEARANCE.skinId,
		skin: skin?.colour ?? DEFAULT_APPEARANCE.skin,
		hairStyle: pickLook(looks, 'hair-style', h)?.style ?? DEFAULT_APPEARANCE.hairStyle,
		hairColour: pickLook(looks, 'hair-colour', h)?.colour ?? DEFAULT_APPEARANCE.hairColour,
		eyeColour: pickLook(looks, 'eye-colour', h)?.colour ?? DEFAULT_APPEARANCE.eyeColour,
		seed: (h >>> 16) + 1
	};
}

/** The same person with another skin look (the line-up's picker). */
export function withSkin(look: Appearance, skinId: string): Appearance {
	const skin = crewContent().looks.find((l) => l.kind === 'skin' && l.id === skinId);
	return skin ? { ...look, skinId, skin: skin.colour } : look;
}

export interface CharacterSpec {
	/** An outfit id (`stock.flight`); an unknown id draws the plain suit. */
	outfit: string;
	appearance?: Appearance;
	/** An expression id (`stock.sad`) or a mood (`sad`); default happy. */
	expression?: string;
	/** Overrides the outfit's hand prop. */
	prop?: Prop;
	/** Leaves the helmet off an EVA outfit (the EVA part draws its helmet as a separate piece). */
	noHelmet?: boolean;
}
