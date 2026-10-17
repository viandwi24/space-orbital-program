/** Plan 052 / ADR 0067: the ground of a body comes from its `terrain` data, not from its parent or atmosphere. */
import { describe, expect, test } from 'bun:test';
import {
	bodyDefinitionSchema,
	CRATERS_MAX_SEED,
	createBodyTerrainField,
	createMoonTerrainField,
	createTerrainField,
	cratersSeedOf,
	createRng,
	moonHeight,
	terrainKindOf,
	type Vec3
} from '../src/index.ts';

const RADIUS = 190_000;
const unit = (x: number, y: number, z: number): Vec3 => {
	const l = Math.hypot(x, y, z);
	return { x: x / l, y: y / l, z: z / l };
};
const rng = createRng(11);
// Directions well away from the landing plain (+X), where craters exist.
const samples = Array.from({ length: 400 }, () =>
	unit(-0.3 - rng.next(), rng.next() * 2 - 1, rng.next() * 2 - 1)
);

const body = (terrain?: unknown, extra: object = {}) =>
	bodyDefinitionSchema.parse({
		id: 'test.body',
		mass: 1e20,
		radius: RADIUS,
		rotationPeriod: 1000,
		...(terrain === undefined ? {} : { terrain }),
		...extra
	});

describe('terrain kind per body', () => {
	test('no terrain means a smooth sphere, with or without a parent or an atmosphere', () => {
		const plain = body();
		const withParent = body(undefined, { parent: 'test.root' });
		const withAir = body(undefined, {
			atmosphere: { scaleHeight: 5000, surfacePressure: 1e5, height: 50_000 }
		});
		for (const b of [plain, withParent, withAir]) {
			expect(terrainKindOf(b)).toBeUndefined();
			expect(createBodyTerrainField(b)).toBeUndefined();
		}
	});

	test('craters give the moon field, with a parent or without one', () => {
		const field = createBodyTerrainField(body({ kind: 'craters' }, { parent: 'test.root' }))!;
		const orphan = createBodyTerrainField(body({ kind: 'craters' }))!;
		const reference = createMoonTerrainField({ radius: RADIUS });
		for (const n of samples) {
			expect(field.heightAt(n)).toBe(reference.heightAt(n));
			expect(orphan.heightAt(n)).toBe(reference.heightAt(n));
		}
		expect(field.maxHeight).toBe(reference.maxHeight);
	});

	test('hills give the home planet field, even for an airless body', () => {
		const field = createBodyTerrainField(body({ kind: 'hills' }))!;
		const reference = createTerrainField({ radius: RADIUS });
		for (const n of samples.slice(0, 50)) expect(field.heightAt(n)).toBe(reference.heightAt(n));
	});

	test('a seed is its own crater field, the same twice, inside the bounds, flat plain kept', () => {
		const a = createBodyTerrainField(body({ kind: 'craters', seed: 7 }))!;
		const b = createBodyTerrainField(body({ kind: 'craters', seed: 7 }))!;
		const stock = createBodyTerrainField(body({ kind: 'craters' }))!;
		let differs = 0;
		for (const n of samples) {
			const h = a.heightAt(n);
			expect(b.heightAt(n)).toBe(h);
			expect(h).toBeGreaterThanOrEqual(0);
			expect(h).toBeLessThanOrEqual(a.maxHeight);
			if (Math.abs(h - stock.heightAt(n)) > 1) differs++;
		}
		expect(differs).toBeGreaterThan(samples.length / 2);
		// the landing plain is the same flat ground whatever the seed
		expect(moonHeight(unit(1, 0, 0), RADIUS, 7)).toBe(moonHeight(unit(1, 0, 0), RADIUS, 0));
		expect(cratersSeedOf(body({ kind: 'craters', seed: 7 }))).toBe(7);
		expect(cratersSeedOf(body({ kind: 'hills' }))).toBe(0);
	});

	test('the schema refuses an unknown kind and a seed out of range', () => {
		expect(() => body({ kind: 'lava' })).toThrow();
		expect(() => body({ kind: 'craters', seed: CRATERS_MAX_SEED + 1 })).toThrow();
		expect(() => body({ kind: 'craters', seed: -1 })).toThrow();
		expect(() => body({ kind: 'craters', seed: 1.5 })).toThrow();
		expect(body({ kind: 'craters', seed: CRATERS_MAX_SEED }).terrain).toEqual({
			kind: 'craters',
			seed: CRATERS_MAX_SEED
		});
	});
});
