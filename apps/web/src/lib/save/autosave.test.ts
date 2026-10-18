/** Plan 043: when the page autosaves. */
import { describe, expect, it } from 'vitest';
import { createAutosaver, type AutosaveState } from './autosave';

const flying: AutosaveState = { flying: true, paused: false, busy: false };

function clock() {
	let t = 0;
	return { now: () => t, advance: (ms: number) => void (t += ms) };
}

describe('autosaver', () => {
	it('saves on the interval while flying, and the timer restarts after a save', () => {
		const c = clock();
		const a = createAutosaver(c.now, { intervalMs: 1000, minGapMs: 100 });
		c.advance(999);
		expect(a.tick(flying)).toBeNull();
		c.advance(1);
		expect(a.tick(flying)).toBe('timer');
		a.saved();
		c.advance(999);
		expect(a.tick(flying)).toBeNull();
		c.advance(1);
		expect(a.tick(flying)).toBe('timer');
	});

	it('never saves when nothing flies, while paused (timer) or while busy', () => {
		const c = clock();
		const a = createAutosaver(c.now, { intervalMs: 10, minGapMs: 1 });
		c.advance(1000);
		expect(a.tick({ ...flying, flying: false })).toBeNull();
		expect(a.tick({ ...flying, paused: true })).toBeNull();
		expect(a.tick({ ...flying, busy: true })).toBeNull();
		expect(a.request('stage', { ...flying, busy: true })).toBeNull();
		expect(a.tick(flying)).toBe('timer');
	});

	it('event requests wait out the minimum gap, except leaving the tab', () => {
		const c = clock();
		const a = createAutosaver(c.now, { intervalMs: 10_000, minGapMs: 500 });
		c.advance(200);
		expect(a.request('stage', flying)).toBeNull();
		expect(a.request('hidden', flying)).toBe('hidden');
		a.saved();
		c.advance(499);
		expect(a.request('landed', flying)).toBeNull();
		c.advance(1);
		expect(a.request('landed', flying)).toBe('landed');
	});

	it('leaving the tab while paused still saves (the sim state is what it is)', () => {
		const c = clock();
		const a = createAutosaver(c.now);
		expect(a.request('hidden', { ...flying, paused: true })).toBe('hidden');
	});
});

describe('autosaver cadence (plan 204)', () => {
	it('defaults to a 60 s timer; an event save keeps the minimum gap, a pagehide save does not', () => {
		const c = clock();
		const a = createAutosaver(c.now);
		c.advance(59_999);
		expect(a.tick(flying)).toBeNull();
		c.advance(1);
		expect(a.tick(flying)).toBe('timer');
		a.saved();
		c.advance(5_000);
		expect(a.request('change', flying)).toBeNull();
		expect(a.request('pagehide', flying)).toBe('pagehide');
		c.advance(10_000);
		expect(a.request('stage', flying)).toBe('stage');
	});
});
