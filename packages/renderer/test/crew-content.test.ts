import { describe, expect, it } from 'bun:test';
import { loadPlugins, type Plugin } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import {
	animationFor,
	crewContentOf,
	outfitsFor,
	poseFor,
	portraitImageOf,
	setCrewContent
} from '../src/crew/content.ts';
import { appearanceOf, hashId } from '../src/crew/outfits.ts';
import { buildCharacter } from '../src/crew/character.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const mod: Plugin = {
	meta: { id: 'troupe', version: '1.0.0', api: '*' },
	depends: ['stock'],
	optional: [],
	setup(ctx) {
		ctx.crewAnimations.register({
			id: 'troupe.march',
			title: 'March',
			role: 'walk',
			keys: [
				{ t: 0, pose: { legLPitch: 0.8, legRPitch: -0.8 } },
				{ t: 0.5, pose: { legLPitch: -0.8, legRPitch: 0.8 } }
			],
			duration: 1
		});
		ctx.crewOutfits.register({
			...{
				id: 'troupe.band',
				title: 'Band',
				body: 'coat',
				suit: 0xaa2222,
				trim: 0xffd700,
				accent: 0xffd700,
				legs: 0x111111,
				boots: 0x111111,
				gloves: 'skin',
				headwear: 'cap',
				headwearColour: 0xaa2222,
				eyewear: 'none',
				prop: 'none',
				pack: 'none',
				harness: false,
				uses: ['hangar']
			}
		});
		ctx.crewLooks.register({
			id: 'troupe.green',
			title: 'Green',
			kind: 'eye-colour',
			colour: 0x2f8a3a
		});
		ctx.crewPortraits.register({
			id: 'troupe.face',
			title: 'Face',
			image: 'faces/band.png',
			outfit: 'troupe.band'
		});
	}
};

describe('the renderer reads crew content from the plugins (plan 375, ADR 0313)', () => {
	const { registries } = loadPlugins([Stock, mod]);
	const content = crewContentOf(registries, (m, path) =>
		m === 'troupe' && path === 'faces/band.png' ? PNG : undefined
	);
	setCrewContent(content);

	it("a later plugin's walk replaces stock's; the others stay stock's", () => {
		expect(animationFor('walk')?.id).toBe('troupe.march');
		expect(animationFor('idle')?.id).toBe('stock.idle');
		// keyframed walk: one cycle per 0.84 m stride
		expect(poseFor('walk', 0, 0).legLPitch).toBeCloseTo(0.8, 9);
		expect(poseFor('walk', 0, 0.42).legLPitch).toBeCloseTo(-0.8, 9);
		expect(poseFor('walk', 99, 0.84).legLPitch).toBeCloseTo(0.8, 9);
	});

	it("a mod's Hangar outfit joins the Hangar crew, and its portrait image wins", () => {
		expect(outfitsFor('hangar').map((o) => o.id)).toContain('troupe.band');
		expect(content.by.get('troupe.band')).toBe('troupe');
		expect(portraitImageOf(undefined, 'troupe.band')).toMatch(/^data:image\/png;base64,/);
		expect(portraitImageOf(undefined, 'stock.flight')).toBeUndefined();
		expect(buildCharacter({ outfit: 'troupe.band' }).length).toBeGreaterThan(10);
	});

	it('a second eye colour shares the hash with the first by weight; skins keep their bits', () => {
		const eyes = new Set(Array.from({ length: 40 }, (_, i) => appearanceOf(`c${i}`).eyeColour));
		expect(eyes.size).toBe(2);
		expect(hashId('x')).toBe(hashId('x'));
	});

	it('an unknown outfit draws the plain suit instead of throwing', () => {
		expect(buildCharacter({ outfit: 'nobody.here' }).length).toBeGreaterThan(10);
	});
});
