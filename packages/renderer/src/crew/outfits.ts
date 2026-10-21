/**
 * The crew character's data (plan 341, ADR 0291): outfits, skins, hair and expressions of the
 * owner's character sheet ("NOVA", `refs/crew-character-nova.jpg`), and a stable look per crew id.
 * Plain data and pure functions, no three: the portraits and the web pages read it too.
 */

/** Every person's height in world metres, feet to the top of the hair (helmets and hats add a little). */
export const CREW_HEIGHT = 1.7;

export const EXPRESSIONS = [
	'happy',
	'surprised',
	'wink',
	'excited',
	'confused',
	'sad',
	'angry',
	'sleepy'
] as const;
export type Expression = (typeof EXPRESSIONS)[number];

/** Skin colours of the sheet's "Body Color Options"; sky blue is the default. */
export const SKINS = {
	'sky-blue': 0x8ec5f2,
	'pale-cyan': 0x9fe0ea,
	lavender: 0xb4b0f0,
	teal: 0x7fd6c4,
	'muted-blue': 0x9aaee0
} as const;
export type Skin = keyof typeof SKINS;
export const SKIN_NAMES = Object.keys(SKINS) as Skin[];

export const HAIR_COLOURS = [0x7a4a26, 0x5a341b, 0x9a6232, 0x3a2414, 0xb07a3a] as const;
export const HAIR_STYLES = ['tousled', 'swept', 'short'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

export type Headwear =
	'none' | 'helmet' | 'hard-hat' | 'cap' | 'headset' | 'goggles' | 'pilot-goggles';
export type Eyewear = 'none' | 'glasses' | 'sunglasses';
export type Prop = 'none' | 'wrench' | 'tablet' | 'clipboard' | 'camera';
export type Body = 'suit' | 'coat' | 'shirt';

export interface Outfit {
	id: OutfitId;
	title: string;
	body: Body;
	/** Main cloth, trim (cuffs, collar, side panels), accent (patches, stripes). */
	suit: number;
	trim: number;
	accent: number;
	/** Trousers under a coat or a shirt; the suit colour otherwise. */
	legs: number;
	/** Boots and gloves. */
	boots: number;
	gloves: number;
	headwear: Headwear;
	headwearColour: number;
	eyewear: Eyewear;
	prop: Prop;
	/** A backpack on the back: the EVA life support or a small flight pack. */
	pack: 'none' | 'small' | 'eva';
	/** Harness straps and a belt over the chest (flight and EVA suits). */
	harness: boolean;
	stethoscope?: boolean;
	tie?: number;
}

export const OUTFIT_IDS = [
	'flight',
	'iva',
	'eva',
	'engineer',
	'scientist',
	'flight-control',
	'researcher',
	'mechanic',
	'mission-specialist',
	'doctor',
	'field-worker',
	'tourist'
] as const;
export type OutfitId = (typeof OUTFIT_IDS)[number];

const ORANGE = 0xe8742a;
const NAVY = 0x23304f;
const CREAM = 0xefe9df;
const DARK = 0x2a2c31;

export const OUTFITS: Readonly<Record<OutfitId, Outfit>> = {
	flight: {
		id: 'flight',
		title: 'Flight / Pilot',
		body: 'suit',
		suit: ORANGE,
		trim: 0xd0621f,
		accent: NAVY,
		legs: ORANGE,
		boots: DARK,
		gloves: DARK,
		headwear: 'none',
		headwearColour: 0,
		eyewear: 'none',
		prop: 'none',
		pack: 'small',
		harness: true
	},
	iva: {
		id: 'iva',
		title: 'IVA (Internal)',
		body: 'suit',
		suit: 0xe9eaec,
		trim: 0xb9bdc4,
		accent: ORANGE,
		legs: 0xe9eaec,
		boots: 0x3a3d44,
		gloves: 0x3a3d44,
		headwear: 'none',
		headwearColour: 0,
		eyewear: 'none',
		prop: 'none',
		pack: 'small',
		harness: true
	},
	eva: {
		id: 'eva',
		title: 'EVA (External)',
		body: 'suit',
		suit: 0xf1f2f4,
		trim: 0xc9ccd2,
		accent: ORANGE,
		legs: 0xf1f2f4,
		boots: 0x9aa0aa,
		gloves: 0x9aa0aa,
		headwear: 'helmet',
		headwearColour: 0xf1f2f4,
		eyewear: 'none',
		prop: 'none',
		pack: 'eva',
		harness: false
	},
	engineer: {
		id: 'engineer',
		title: 'Engineer',
		body: 'suit',
		suit: ORANGE,
		trim: 0xc95f1e,
		accent: NAVY,
		legs: ORANGE,
		boots: DARK,
		gloves: DARK,
		headwear: 'hard-hat',
		headwearColour: 0xf07b22,
		eyewear: 'none',
		prop: 'wrench',
		pack: 'none',
		harness: true
	},
	scientist: {
		id: 'scientist',
		title: 'Scientist',
		body: 'coat',
		suit: 0xf4f4f2,
		trim: 0xdcdcd8,
		accent: 0x3a6fd0,
		legs: NAVY,
		boots: DARK,
		gloves: 0x8ec5f2,
		headwear: 'none',
		headwearColour: 0,
		eyewear: 'glasses',
		prop: 'tablet',
		pack: 'none',
		harness: false,
		tie: 0x2c4f8a
	},
	'flight-control': {
		id: 'flight-control',
		title: 'Pilot / Flight Control',
		body: 'suit',
		suit: NAVY,
		trim: 0x1a2440,
		accent: ORANGE,
		legs: NAVY,
		boots: DARK,
		gloves: DARK,
		headwear: 'headset',
		headwearColour: 0x24262b,
		eyewear: 'none',
		prop: 'none',
		pack: 'none',
		harness: false
	},
	researcher: {
		id: 'researcher',
		title: 'Researcher',
		body: 'coat',
		suit: 0xf4f4f2,
		trim: 0xdcdcd8,
		accent: 0x4c8a5a,
		legs: 0x4d5a3a,
		boots: 0x5a3a24,
		gloves: 0x8ec5f2,
		headwear: 'goggles',
		headwearColour: 0x6f8fa8,
		eyewear: 'none',
		prop: 'clipboard',
		pack: 'none',
		harness: false
	},
	mechanic: {
		id: 'mechanic',
		title: 'Mechanic',
		body: 'suit',
		suit: NAVY,
		trim: 0x1a2440,
		accent: 0xf2c200,
		legs: NAVY,
		boots: DARK,
		gloves: DARK,
		headwear: 'cap',
		headwearColour: NAVY,
		eyewear: 'none',
		prop: 'wrench',
		pack: 'none',
		harness: false
	},
	'mission-specialist': {
		id: 'mission-specialist',
		title: 'Mission Specialist',
		body: 'suit',
		suit: 0xf2c230,
		trim: DARK,
		accent: DARK,
		legs: 0xf2c230,
		boots: DARK,
		gloves: DARK,
		headwear: 'pilot-goggles',
		headwearColour: 0x6a4a2a,
		eyewear: 'none',
		prop: 'none',
		pack: 'small',
		harness: true
	},
	doctor: {
		id: 'doctor',
		title: 'Doctor',
		body: 'coat',
		suit: 0xf6f6f4,
		trim: 0xdcdcd8,
		accent: 0x2f9a8a,
		legs: 0x6fa8c8,
		boots: 0xe8e8e8,
		gloves: 0x8ec5f2,
		headwear: 'none',
		headwearColour: 0,
		eyewear: 'none',
		prop: 'clipboard',
		pack: 'none',
		harness: false,
		stethoscope: true
	},
	'field-worker': {
		id: 'field-worker',
		title: 'Field Worker',
		body: 'suit',
		suit: 0x6b7340,
		trim: 0x4e5530,
		accent: 0xb08a3a,
		legs: 0x6b7340,
		boots: 0x4a3322,
		gloves: 0x4a3322,
		headwear: 'cap',
		headwearColour: 0x4e5530,
		eyewear: 'none',
		prop: 'none',
		pack: 'small',
		harness: true
	},
	tourist: {
		id: 'tourist',
		title: 'Tourist',
		body: 'shirt',
		suit: 0x3fa7d6,
		trim: 0xf2c94c,
		accent: 0xf2c94c,
		legs: 0x5b7fa6,
		boots: 0x8a5a36,
		gloves: 0x8ec5f2,
		headwear: 'none',
		headwearColour: 0,
		eyewear: 'sunglasses',
		prop: 'camera',
		pack: 'small',
		harness: false
	}
};

/** How a person looks apart from the outfit. */
export interface Appearance {
	skin: Skin;
	hairStyle: HairStyle;
	hairColour: number;
	/** A seed for the hair tufts' small differences. */
	seed: number;
}

export const DEFAULT_APPEARANCE: Appearance = {
	skin: 'sky-blue',
	hairStyle: 'tousled',
	hairColour: HAIR_COLOURS[0],
	seed: 1
};

/** FNV-1a over the id's UTF-16 code units: a stable 32-bit hash. */
export function hashId(id: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < id.length; i++) {
		h ^= id.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/**
 * A crew member's look from their id: the same id gives the same skin, hair style and colour on
 * every page and in every session. Sky blue is the most common skin, as on the sheet.
 */
export function appearanceOf(id: string): Appearance {
	const h = hashId(id);
	const skins: readonly Skin[] = ['sky-blue', 'sky-blue', 'sky-blue', ...SKIN_NAMES.slice(1)];
	return {
		skin: skins[h % skins.length]!,
		hairStyle: HAIR_STYLES[(h >>> 8) % HAIR_STYLES.length]!,
		hairColour: HAIR_COLOURS[(h >>> 12) % HAIR_COLOURS.length]!,
		seed: (h >>> 16) + 1
	};
}

/** What a member wears for their profession at the Space Center; in a pod everyone wears Flight. */
export function outfitForProfession(profession: string): OutfitId {
	switch (profession) {
		case 'engineer':
			return 'engineer';
		case 'scientist':
			return 'scientist';
		case 'tourist':
			return 'tourist';
		default:
			return 'flight';
	}
}

export interface CharacterSpec {
	outfit: OutfitId;
	appearance?: Appearance;
	expression?: Expression;
	/** Overrides the outfit's hand prop. */
	prop?: Prop;
	/** Leaves the helmet off an EVA outfit (the EVA part draws its helmet as a separate piece). */
	noHelmet?: boolean;
}
