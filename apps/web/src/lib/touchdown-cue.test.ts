import { describe, expect, it } from 'vitest';
import { isOwnTouchdown } from './touchdown-cue';

describe('isOwnTouchdown', () => {
	it('is the active vessel own impact only', () => {
		expect(isOwnTouchdown({ type: 'part-damaged', vessel: 3 }, 3)).toBe(true);
		expect(isOwnTouchdown({ type: 'part-damaged', vessel: 7 }, 3)).toBe(false); // a booster far away
		expect(isOwnTouchdown({ type: 'part-damaged', vessel: null }, 3)).toBe(false);
		expect(isOwnTouchdown({ type: 'part-damaged', vessel: 3 }, null)).toBe(false);
	});
	it('ignores heat and other events', () => {
		expect(isOwnTouchdown({ type: 'part-damaged', cause: 'overheat', vessel: 3 }, 3)).toBe(false);
		expect(isOwnTouchdown({ type: 'flameout', vessel: 3 }, 3)).toBe(false);
	});
});
