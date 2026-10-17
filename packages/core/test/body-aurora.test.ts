/** Plan 061 / ADR 0093: a body's atmosphere may switch its aurora off; it is on unless `false`. */
import { describe, expect, test } from 'bun:test';
import { bodyDefinitionSchema } from '../src/index.ts';

const air = { scaleHeight: 5000, surfacePressure: 1e5, height: 50_000 };
const parse = (atmosphere: unknown) =>
	bodyDefinitionSchema.safeParse({
		id: 'test.body',
		mass: 1e20,
		radius: 600_000,
		rotationPeriod: 1000,
		atmosphere
	});

describe('aurora flag', () => {
	test('is optional and a boolean', () => {
		expect(parse(air).success).toBe(true);
		expect(parse({ ...air, aurora: false }).data?.atmosphere?.aurora).toBe(false);
		expect(parse({ ...air, aurora: true }).data?.atmosphere?.aurora).toBe(true);
		expect(parse({ ...air, aurora: 'no' }).success).toBe(false);
		expect(parse(air).data?.atmosphere?.aurora).toBeUndefined();
	});
});
