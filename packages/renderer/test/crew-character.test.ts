import { describe, expect, it } from 'bun:test';
import { Box3, Vector3 } from 'three';
import { buildCharacter, piecesHeight } from '../src/crew/character.ts';
import {
	CREW_HEIGHT,
	EXPRESSIONS,
	OUTFIT_IDS,
	SKIN_NAMES,
	appearanceOf,
	outfitForProfession
} from '../src/crew/outfits.ts';
import { characterGeometry, createCrewMaterial, createPerson } from '../src/crew/person.ts';
import { REST_POSE, STEP, personPose } from '../src/crew/poses.ts';

describe('crew character (plan 341)', () => {
	it('every outfit stands 1.6–1.85 m tall with the feet on the ground', () => {
		for (const outfit of OUTFIT_IDS) {
			const h = piecesHeight(buildCharacter({ outfit }));
			expect(h.min).toBeGreaterThan(-0.01);
			expect(h.min).toBeLessThan(0.02);
			expect(h.max - h.min).toBeGreaterThanOrEqual(1.6);
			expect(h.max - h.min).toBeLessThanOrEqual(1.85);
		}
		expect(CREW_HEIGHT).toBe(1.7);
	});

	it('the bare head and hair reach about CREW_HEIGHT', () => {
		const h = piecesHeight(buildCharacter({ outfit: 'flight' }));
		expect(Math.abs(h.max - CREW_HEIGHT)).toBeLessThan(0.06);
	});

	it('is about as wide as a person: under 0.9 m across and deep (helmet and pack included)', () => {
		for (const outfit of OUTFIT_IDS) {
			const box = new Box3();
			for (const p of buildCharacter({ outfit })) {
				p.geometry.computeBoundingBox();
				box.union(p.geometry.boundingBox!);
			}
			const size = box.getSize(new Vector3());
			expect(size.x).toBeLessThan(0.9);
			expect(size.z).toBeLessThan(0.9);
		}
	});

	it('builds every expression with face pieces', () => {
		for (const expression of EXPRESSIONS) {
			const pieces = buildCharacter({ outfit: 'flight', expression });
			expect(pieces.some((p) => p.role === 'pupil')).toBe(true);
		}
	});

	it('the EVA helmet is the only helmet piece, and can be left off', () => {
		const eva = buildCharacter({ outfit: 'eva' });
		expect(eva.some((p) => p.helmet)).toBe(true);
		expect(buildCharacter({ outfit: 'flight' }).some((p) => p.helmet)).toBe(false);
		expect(buildCharacter({ outfit: 'eva', noHelmet: true }).some((p) => p.helmet)).toBe(false);
	});

	it('the look of a crew id is stable and varies across ids', () => {
		expect(appearanceOf('crew-7')).toEqual(appearanceOf('crew-7'));
		const skins = new Set(Array.from({ length: 60 }, (_, i) => appearanceOf(`c${i}`).skin));
		expect(skins.size).toBe(SKIN_NAMES.length);
		expect(outfitForProfession('engineer')).toBe('engineer');
		expect(outfitForProfession('pilot')).toBe('flight');
	});

	it('one skinned geometry with one bone per vertex', () => {
		const g = characterGeometry({ outfit: 'engineer' });
		const w = g.getAttribute('skinWeight');
		for (let i = 0; i < w.count; i += 97) expect(w.getX(i)).toBe(1);
		expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count);
		expect(g.getAttribute('position').count / 3).toBeLessThan(7000);
	});

	it('a person poses its limbs and keeps its height', () => {
		const p = createPerson({ outfit: 'scientist' }, createCrewMaterial());
		p.pose(personPose('wave', 1));
		expect(p.bones.armR.rotation.z).toBeLessThan(-2);
		p.pose(REST_POSE);
		expect(p.bones.armR.rotation.z).toBe(-0);
		p.dispose();
	});
});

describe('crew poses', () => {
	it('are pure functions of time and distance', () => {
		expect(personPose('walk', 3, 2.2, 1)).toEqual(personPose('walk', 3, 2.2, 1));
		expect(personPose('idle', 3, 0, 2)).toEqual(personPose('idle', 3, 0, 2));
	});

	it('the walk swings the legs opposite and repeats every two steps', () => {
		const a = personPose('walk', 0, STEP / 2);
		expect(a.legLPitch).toBeCloseTo(-a.legRPitch, 9);
		expect(Math.abs(a.legLPitch)).toBeGreaterThan(0.4);
		const b = personPose('walk', 0, STEP / 2 + 2 * STEP);
		expect(b.legLPitch).toBeCloseTo(a.legLPitch, 9);
	});

	it('the wave raises the right arm above the shoulder', () => {
		for (let t = 0; t < 3; t += 0.1) expect(personPose('wave', t).armRRaise).toBeGreaterThan(2);
	});
});

describe('Space Center people (plan 341)', () => {
	it('stay off the pad and clear of the tower at all times', async () => {
		const { SITE_PEOPLE, PAD_RADIUS, TOWER } = await import('../src/site.ts');
		const { crewPose } = await import('../src/crew/walkers.ts');
		expect(SITE_PEOPLE.length).toBeGreaterThanOrEqual(5);
		for (const spec of SITE_PEOPLE)
			for (let t = 0; t < 200; t += 0.5) {
				const p = crewPose(spec, t);
				expect(Math.hypot(p.x, p.z)).toBeGreaterThan(PAD_RADIUS + 4);
				expect(Math.hypot(p.x - TOWER.x, p.z - TOWER.z)).toBeGreaterThan(TOWER.size + 3);
			}
	});
});
