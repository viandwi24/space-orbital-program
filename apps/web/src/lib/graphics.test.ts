import { describe, expect, it } from 'vitest';
import { resolvePreset } from './graphics';

describe('resolvePreset', () => {
	it('prefers a saved preset over the device default', () => {
		expect(resolvePreset('low', { gpu: 'Apple M2', maxTextureSize: 16384 })).toBe('low');
	});
	it('falls back to the device default', () => {
		expect(
			resolvePreset(null, {
				gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M5)',
				maxTextureSize: 16384
			})
		).toBe('high');
		expect(resolvePreset(null, { gpu: 'Google SwiftShader', maxTextureSize: 8192 })).toBe('low');
	});
});
