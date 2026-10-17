/** Mod manager text (plan 075): the licence a manifest states, as the list and the trust prompt show it. */
import { describe, expect, it } from 'vitest';
import { licenceLabel } from './format';

describe('licenceLabel', () => {
	it('shows the stated SPDX expression', () => {
		expect(licenceLabel({ licence: 'MIT' })).toBe('MIT');
		expect(licenceLabel({ licence: 'MIT OR Apache-2.0' })).toBe('MIT OR Apache-2.0');
	});
	it('says "not stated" without one', () => {
		expect(licenceLabel({})).toBe('not stated');
	});
});
