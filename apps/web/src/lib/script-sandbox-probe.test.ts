import { describe, expect, it } from 'vitest';
import {
	isContained,
	probeContainment,
	reachableProbes,
	type ContainmentReport,
	type ProbeScope
} from './script-sandbox-probe';

const target = 'https://game.example/robots.txt';

/** A scope where everything works: the game's own origin, which must read as fully reachable. */
function openScope(): ProbeScope {
	return {
		origin: 'https://game.example',
		fetch: () => Promise.resolve({}),
		indexedDB: {
			open: () => {
				const request: ReturnType<NonNullable<ProbeScope['indexedDB']>['open']> = {
					onsuccess: null,
					onerror: null,
					result: { close: () => {} }
				};
				queueMicrotask(() => request.onsuccess?.(new Event('success')));
				return request;
			},
			deleteDatabase: () => {}
		},
		caches: { open: () => Promise.resolve({}) },
		document: { cookie: 'a=b' },
		localStorage: { getItem: () => null }
	};
}

/** What a sandboxed iframe with `connect-src 'none'` looks like to the probe. */
function closedScope(): ProbeScope {
	const deny = (): never => {
		throw new DOMException('denied', 'SecurityError');
	};
	return {
		origin: 'null',
		fetch: () => Promise.reject(new TypeError('Failed to fetch')),
		indexedDB: {
			open: deny,
			deleteDatabase: deny
		},
		caches: { open: () => Promise.reject(new DOMException('denied', 'SecurityError')) },
		get document(): { cookie: string } {
			return deny();
		},
		get localStorage(): { getItem(key: string): unknown } {
			return deny();
		}
	};
}

/** `closedScope()` with some members replaced (a spread would run its throwing getters). */
function patched(patch: Partial<ProbeScope>): ProbeScope {
	const scope = closedScope();
	for (const [key, value] of Object.entries(patch)) {
		Object.defineProperty(scope, key, { value, configurable: true });
	}
	return scope;
}

describe('containment probe', () => {
	it('reports everything reachable in the game origin (the positive control)', async () => {
		const report = await probeContainment(openScope(), { context: 'frame', target });
		expect(report.opaque).toBe(false);
		expect(report.probes).toEqual({
			fetch: 'reachable',
			indexedDB: 'reachable',
			localStorage: 'reachable',
			cookie: 'reachable',
			caches: 'reachable'
		});
		expect(isContained([report])).toBe(false);
		expect(reachableProbes([report])).toEqual([
			'frame.origin=https://game.example',
			'frame.fetch',
			'frame.indexedDB',
			'frame.localStorage',
			'frame.cookie',
			'frame.caches'
		]);
	});

	it('reports everything blocked from an opaque origin that throws or rejects', async () => {
		const report = await probeContainment(closedScope(), { context: 'frame', target });
		expect(report.opaque).toBe(true);
		expect(Object.values(report.probes)).toEqual(Array(5).fill('blocked'));
		expect(isContained([report])).toBe(true);
		expect(reachableProbes([report])).toEqual([]);
	});

	it('a worker scope without the window APIs counts those as blocked', async () => {
		const scope: ProbeScope = { origin: 'null', fetch: () => Promise.reject(new TypeError('x')) };
		const report = await probeContainment(scope, { context: 'worker', target });
		expect(report.probes).toMatchObject({
			indexedDB: 'blocked',
			localStorage: 'blocked',
			cookie: 'blocked',
			caches: 'blocked'
		});
	});

	it('one reachable item is enough to lose "contained", even in an opaque origin', async () => {
		const scope = patched({ fetch: () => Promise.resolve({}) });
		const report = await probeContainment(scope, { context: 'worker', target });
		expect(report.probes.fetch).toBe('reachable');
		expect(isContained([report])).toBe(false);
		expect(reachableProbes([report])).toEqual(['worker.fetch']);
	});

	it('an IndexedDB request that never answers is not reported as reachable', async () => {
		const scope = patched({
			indexedDB: { open: () => ({ onsuccess: null, onerror: null }), deleteDatabase: () => {} }
		});
		const report = await probeContainment(scope, { context: 'frame', target, timeoutMs: 20 });
		expect(report.probes.indexedDB).toBe('blocked');
	});

	it('counts CSP violation events seen while probing', async () => {
		let fire: () => void = () => {};
		const scope = patched({
			addEventListener: (_type, listener) => void (fire = listener),
			fetch: () => {
				fire();
				return Promise.reject(new TypeError('blocked by CSP'));
			}
		});
		const report = await probeContainment(scope, { context: 'worker', target });
		expect(report.violations).toBe(1);
	});

	it('is not contained without a report, or when an origin is not opaque', () => {
		expect(isContained([])).toBe(false);
		const report: ContainmentReport = {
			context: 'frame',
			origin: 'https://game.example',
			opaque: false,
			probes: {},
			target,
			violations: 0
		};
		expect(isContained([report])).toBe(false);
	});
});
