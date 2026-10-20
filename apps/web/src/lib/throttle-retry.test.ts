import { describe, expect, it } from 'vitest';
import { fresh, refused, shouldResend } from './throttle-retry';

describe('throttle retry', () => {
	it('sends nothing again while no refusal waits', () => {
		const link = fresh();
		expect(shouldResend(link, 1)).toBe(false);
	});
	it('waits for the warp to change, then asks once', () => {
		const link = fresh();
		refused(link, 100);
		expect(shouldResend(link, 100)).toBe(false);
		expect(shouldResend(link, 1)).toBe(true);
		expect(shouldResend(link, 1)).toBe(false);
	});
});
