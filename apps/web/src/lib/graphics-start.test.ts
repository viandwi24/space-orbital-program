import { describe, expect, it, vi } from 'vitest';
import { settleWithin } from './graphics';
import { afterDeviceFailure, GRAPHICS_TIPS } from './world-renderer.svelte';

/** Starting the graphics on software rendering (plan 388): nothing waits forever. */
describe('starting the graphics', () => {
	it('settleWithin gives the answer, or the fallback when it never comes or fails', async () => {
		expect(await settleWithin(Promise.resolve(true), 50, false)).toBe(true);
		expect(await settleWithin(Promise.reject(new Error('x')), 50, false)).toBe(false);
		vi.useFakeTimers();
		const never = settleWithin(new Promise<boolean>(() => {}), 4_000, false);
		vi.advanceTimersByTime(4_000);
		expect(await never).toBe(false);
		vi.useRealTimers();
	});

	it('WebGPU that does not start reloads on WebGL once; then the graphics are unavailable', () => {
		expect(afterDeviceFailure('webgpu', false, false)).toBe('reload-webgl');
		// the adapter probe itself hung: no backend yet
		expect(afterDeviceFailure(null, false, false)).toBe('reload-webgl');
		expect(afterDeviceFailure('webgpu', true, false)).toBe('unavailable');
		expect(afterDeviceFailure('webgl', false, false)).toBe('unavailable');
		// ?renderer= on the address wins over the fallback, so a reload would hang again
		expect(afterDeviceFailure('webgpu', false, true)).toBe('unavailable');
		expect(GRAPHICS_TIPS.length).toBeGreaterThan(2);
	});
});
