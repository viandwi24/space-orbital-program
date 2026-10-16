import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadDraft, loadScript, saveDraft, saveScript } from './storage';

function memoryStorage() {
	const data = new Map<string, string>();
	return {
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => void data.set(k, v),
		data
	};
}

describe('script persistence', () => {
	const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
	afterEach(() => {
		if (original) Object.defineProperty(globalThis, 'localStorage', original);
		else Reflect.deleteProperty(globalThis, 'localStorage');
	});
	const install = (value: unknown) =>
		Object.defineProperty(globalThis, 'localStorage', { value, configurable: true });

	describe('with a working localStorage', () => {
		beforeEach(() => install(memoryStorage()));
		it('round-trips the source per design name', () => {
			saveScript('Ascent', 'ship.throttle = 1;\nprint("hi é");');
			saveScript('Lander', 'stage();');
			expect(loadScript('Ascent')).toBe('ship.throttle = 1;\nprint("hi é");');
			expect(loadScript('Lander')).toBe('stage();');
		});
		it('returns null for a design without a saved script and keeps the design key separate', () => {
			expect(loadScript('Nothing')).toBeNull();
			saveDraft('{"x":1}');
			expect(loadScript('orbital.design')).toBeNull();
			expect(loadDraft()).toBe('{"x":1}');
		});
	});

	describe('with a localStorage that throws', () => {
		beforeEach(() =>
			install({
				getItem: () => {
					throw new DOMException('blocked', 'SecurityError');
				},
				setItem: () => {
					throw new DOMException('full', 'QuotaExceededError');
				}
			})
		);
		it('neither saves nor loads loudly', () => {
			expect(() => saveScript('A', 'x')).not.toThrow();
			expect(loadScript('A')).toBeNull();
		});
	});
});
