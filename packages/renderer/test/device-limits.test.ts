import { describe, expect, test } from 'bun:test';
import { limitsFor } from '../src/device-limits.ts';

describe('limitsFor', () => {
	test('asks for more only where the adapter has more than the default', () => {
		expect(limitsFor(undefined)).toBeNull();
		expect(limitsFor(16)).toBeNull();
		expect(limitsFor(Number.NaN)).toBeNull();
		expect(limitsFor(48)).toEqual({ maxSampledTexturesPerShaderStage: 32 });
		expect(limitsFor(20)).toEqual({ maxSampledTexturesPerShaderStage: 20 });
		expect(limitsFor(128)).toEqual({ maxSampledTexturesPerShaderStage: 32 });
	});
});
