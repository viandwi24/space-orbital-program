/**
 * Stock's crew content (plan 375, ADR 0313): the character of ADR 0291 ("NOVA", the owner's
 * character sheet `refs/crew-character-nova.jpg`) registered through the crew API like any mod's:
 * 12 outfits, the skins, hair and eye colours, hair styles, 8 expressions and the poses of the
 * five animation roles.
 */
import {
	defineCrewAnimation,
	defineCrewExpression,
	defineCrewLook,
	type CrewAnimationDefinition,
	type CrewExpressionDefinition,
	type CrewLookDefinition,
	type CrewOutfitDefinition,
	type CrewPose
} from '@orbital/sdk';

const ORANGE = 0xe8742a;
const NAVY = 0x23304f;
const CREAM = 0xefe9df;
const DARK = 0x2a2c31;

const OUTFITS = {
	flight: {
		id: 'stock.flight',
		uses: ['pod', 'lineup'],
		professions: ['pilot'],
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
		id: 'stock.iva',
		uses: ['lineup'],
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
		id: 'stock.eva',
		uses: ['eva', 'lineup'],
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
		id: 'stock.engineer',
		uses: ['hangar', 'space-center', 'lineup'],
		professions: ['engineer'],
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
		id: 'stock.scientist',
		uses: ['hangar', 'space-center', 'lineup'],
		professions: ['scientist'],
		title: 'Scientist',
		body: 'coat',
		suit: 0xf4f4f2,
		trim: 0xdcdcd8,
		accent: 0x3a6fd0,
		legs: NAVY,
		boots: DARK,
		gloves: 'skin',
		headwear: 'none',
		headwearColour: 0,
		eyewear: 'glasses',
		prop: 'tablet',
		pack: 'none',
		harness: false,
		tie: 0x2c4f8a
	},
	'flight-control': {
		id: 'stock.flight-control',
		uses: ['space-center', 'lineup'],
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
		id: 'stock.researcher',
		uses: ['hangar', 'lineup'],
		title: 'Researcher',
		body: 'coat',
		suit: 0xf4f4f2,
		trim: 0xdcdcd8,
		accent: 0x4c8a5a,
		legs: 0x4d5a3a,
		boots: 0x5a3a24,
		gloves: 'skin',
		headwear: 'goggles',
		headwearColour: 0x6f8fa8,
		eyewear: 'none',
		prop: 'clipboard',
		pack: 'none',
		harness: false
	},
	mechanic: {
		id: 'stock.mechanic',
		uses: ['hangar', 'lineup'],
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
		id: 'stock.mission-specialist',
		uses: ['lineup'],
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
		id: 'stock.doctor',
		uses: ['space-center', 'lineup'],
		title: 'Doctor',
		body: 'coat',
		suit: 0xf6f6f4,
		trim: 0xdcdcd8,
		accent: 0x2f9a8a,
		legs: 0x6fa8c8,
		boots: 0xe8e8e8,
		gloves: 'skin',
		headwear: 'none',
		headwearColour: 0,
		eyewear: 'none',
		prop: 'clipboard',
		pack: 'none',
		harness: false,
		stethoscope: true
	},
	'field-worker': {
		id: 'stock.field-worker',
		uses: ['space-center', 'lineup'],
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
		id: 'stock.tourist',
		uses: ['lineup'],
		professions: ['tourist'],
		title: 'Tourist',
		body: 'shirt',
		suit: 0x3fa7d6,
		trim: 0xf2c94c,
		accent: 0xf2c94c,
		legs: 0x5b7fa6,
		boots: 0x8a5a36,
		gloves: 'skin',
		headwear: 'none',
		headwearColour: 0,
		eyewear: 'sunglasses',
		prop: 'camera',
		pack: 'small',
		harness: false
	}
} satisfies Record<string, CrewOutfitDefinition>;

export const STOCK_CREW_OUTFITS: readonly CrewOutfitDefinition[] = Object.values(OUTFITS);

const SKINS: Array<[string, string, number, number]> = [
	['sky-blue', 'Sky blue', 0x8ec5f2, 3],
	['pale-cyan', 'Pale cyan', 0x9fe0ea, 1],
	['lavender', 'Lavender', 0xb4b0f0, 1],
	['teal', 'Teal', 0x7fd6c4, 1],
	['muted-blue', 'Muted blue', 0x9aaee0, 1]
];
const HAIR: Array<[string, string, number]> = [
	['brown', 'Brown', 0x7a4a26],
	['dark-brown', 'Dark brown', 0x5a341b],
	['chestnut', 'Chestnut', 0x9a6232],
	['espresso', 'Espresso', 0x3a2414],
	['caramel', 'Caramel', 0xb07a3a]
];

/** Skin, hair and eye colours and hair styles, in the order crew ids have always drawn them. */
export const STOCK_CREW_LOOKS: readonly CrewLookDefinition[] = [
	...SKINS.map(([id, title, colour, weight]) =>
		defineCrewLook({ id: `stock.skin-${id}`, title, kind: 'skin', colour, weight })
	),
	...(['tousled', 'swept', 'short'] as const).map((style) =>
		defineCrewLook({
			id: `stock.hair-${style}`,
			title: style[0]!.toUpperCase() + style.slice(1),
			kind: 'hair-style',
			colour: 0,
			style
		})
	),
	...HAIR.map(([id, title, colour]) =>
		defineCrewLook({ id: `stock.hair-${id}`, title, kind: 'hair-colour', colour })
	),
	defineCrewLook({ id: 'stock.eyes-dark', title: 'Dark eyes', kind: 'eye-colour', colour: 0x2a1a14 })
];

/** The sheet's eight faces. */
export const STOCK_CREW_EXPRESSIONS: readonly CrewExpressionDefinition[] = [
	defineCrewExpression({
		id: 'stock.happy',
		title: 'Happy',
		mood: 'happy',
		eyes: { left: 'open', right: 'open' },
		mouth: 'smile'
	}),
	defineCrewExpression({
		id: 'stock.surprised',
		title: 'Surprised',
		mood: 'surprised',
		eyes: { left: 'wide', right: 'wide' },
		brows: { tilt: [0, 0], lift: 0.025 },
		mouth: 'o'
	}),
	defineCrewExpression({
		id: 'stock.wink',
		title: 'Wink',
		mood: 'wink',
		eyes: { left: 'open', right: 'closed-up' },
		mouth: 'smile'
	}),
	defineCrewExpression({
		id: 'stock.excited',
		title: 'Excited',
		mood: 'excited',
		eyes: { left: 'big', right: 'big' },
		mouth: 'grin'
	}),
	defineCrewExpression({
		id: 'stock.confused',
		title: 'Confused',
		mood: 'confused',
		eyes: { left: 'open', right: 'open' },
		brows: { tilt: [0.25, -0.15], raise: [0.02, 0] },
		mouth: 'tilt'
	}),
	defineCrewExpression({
		id: 'stock.sad',
		title: 'Sad',
		mood: 'sad',
		eyes: { left: 'open', right: 'open' },
		brows: { tilt: [-0.4, -0.4] },
		mouth: 'frown'
	}),
	defineCrewExpression({
		id: 'stock.angry',
		title: 'Angry',
		mood: 'angry',
		eyes: { left: 'open', right: 'open' },
		brows: { tilt: [0.45, 0.45], lift: -0.015 },
		mouth: 'frown'
	}),
	defineCrewExpression({
		id: 'stock.sleepy',
		title: 'Sleepy',
		mood: 'sleepy',
		eyes: { left: 'closed-down', right: 'closed-down' },
		mouth: 'small-o'
	})
];

/** Length of one step of the short legs, m: a stride is two (the walk cycle follows the distance). */
export const CREW_STEP = 0.42;

const breatheOf = (t: number, seed: number): number => Math.sin(t * 1.7 + seed) * 0.004;

/** The poses of ADR 0291 as pure functions of time (walk follows the distance walked). */
export const STOCK_CREW_ANIMATIONS: readonly CrewAnimationDefinition[] = [
	defineCrewAnimation({
		id: 'stock.idle',
		title: 'Idle: breathing, looking about',
		role: 'idle',
		pose: (t, { seed }): Partial<CrewPose> => {
			const breathe = breatheOf(t, seed);
			return {
				bob: breathe,
				headYaw: Math.sin(t * 0.37 + seed * 1.3) * 0.3 + Math.sin(t * 0.11 + seed) * 0.15,
				headPitch: Math.sin(t * 0.23 + seed) * 0.06,
				armLRaise: 0.07 + breathe * 3,
				armRRaise: 0.07 + breathe * 3,
				armLPitch: Math.sin(t * 0.9 + seed) * 0.04,
				armRPitch: -Math.sin(t * 0.9 + seed) * 0.04
			};
		}
	}),
	defineCrewAnimation({
		id: 'stock.walk',
		title: 'Walk',
		role: 'walk',
		pose: (_t, { walked }): Partial<CrewPose> => {
			const phase = (walked / CREW_STEP) * Math.PI;
			const s = Math.sin(phase);
			return {
				bob: Math.abs(Math.cos(phase)) * 0.022,
				lean: 0.06,
				headPitch: -0.03,
				headYaw: Math.sin(phase * 0.5) * 0.05,
				headRoll: s * 0.04,
				armLPitch: -s * 0.5,
				armLRaise: 0.06,
				armRPitch: s * 0.5,
				armRRaise: 0.06,
				legLPitch: s * 0.55,
				legRPitch: -s * 0.55
			};
		}
	}),
	defineCrewAnimation({
		id: 'stock.wave',
		title: 'Wave',
		role: 'wave',
		pose: (t, { seed }): Partial<CrewPose> => ({
			bob: breatheOf(t, seed),
			headRoll: 0.12,
			headYaw: 0.1,
			armRRaise: 2.5 + Math.sin(t * 7 + seed) * 0.32,
			armRPitch: 0.2,
			armLRaise: 0.08
		})
	}),
	defineCrewAnimation({
		id: 'stock.work',
		title: 'Work: hands busy at the chest',
		role: 'work',
		pose: (t, { seed }): Partial<CrewPose> => ({
			bob: breatheOf(t, seed),
			headPitch: 0.28 + Math.sin(t * 0.5 + seed) * 0.05,
			headYaw: Math.sin(t * 0.3 + seed) * 0.12,
			armRPitch: 0.85 + Math.sin(t * 3.1 + seed) * 0.06,
			armRRaise: -0.15,
			armLPitch: 0.6 + Math.sin(t * 2.3 + seed) * 0.08,
			armLRaise: -0.2
		})
	}),
	defineCrewAnimation({
		id: 'stock.eva-float',
		title: 'EVA: floating, arms out',
		role: 'eva',
		keys: [
			{ t: 0, pose: { armLRaise: 0.7, armRRaise: 0.7, legLPitch: 0.15, legRPitch: -0.1, lean: 0.1 } },
			{
				t: 2,
				pose: {
					armLRaise: 0.9,
					armRRaise: 0.55,
					armLPitch: 0.2,
					legLPitch: -0.1,
					legRPitch: 0.18,
					headPitch: -0.1,
					lean: 0.16
				}
			}
		],
		duration: 4
	})
];
