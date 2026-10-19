/** Plan 214 (ADR 0205 point 2): typed values with units and the three pins. */
import { loadPlugins, describeModule, type EntityId } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { closePart, emptyInspector, openPart, shownParts, togglePin } from './inspector-model';
import { formatTyped, parseTyped } from './units';

const { registries } = loadPlugins([Stock]);
/** The thrust limiter of a 200 kN engine, as the engine module describes it. */
function limiter() {
	const mod = registries.modules.get('stock.engine')!;
	const config = registries.parts
		.list()
		.flatMap((p) => p.modules ?? [])
		.find(([id]) => id === 'stock.engine')![1] as Record<string, unknown>;
	const info = describeModule(mod, { ...config, thrust: 200_000 }, undefined)!;
	return info.actions!.find((a) => a.id === 'setLimiter')!;
}

describe('typed values', () => {
	it('"50 kN" on a 200 kN engine sets the limiter to 25 %', () => {
		const d = limiter();
		expect(parseTyped(d, '50 kN')).toEqual({ value: 0.25 });
		expect(parseTyped(d, '25 %')).toEqual({ value: 0.25 });
		expect(parseTyped(d, '25')).toEqual({ value: 0.25 }); // the first unit
		expect(formatTyped(d, 0.25)).toBe('25 %');
	});

	it('"abc" reverts with a message; out of range and unknown units too', () => {
		const d = limiter();
		const bad = parseTyped(d, 'abc');
		expect('error' in bad && bad.error).toMatch(/Type a number/);
		expect(parseTyped(d, '250 kN')).toEqual({ error: 'Thrust limiter cannot go above 100 %' });
		expect('error' in parseTyped(d, '5 furlongs')).toBe(true);
		expect(parseTyped(d, '3 m')).toEqual({ error: 'Thrust limiter is not set in m' });
	});
});

describe('pins', () => {
	const p = (n: number) => n as EntityId;
	it('a fourth pin drops the oldest', () => {
		let s = emptyInspector();
		for (const n of [1, 2, 3, 4]) s = togglePin(s, p(n));
		expect(s.pinned).toEqual([p(2), p(3), p(4)]);
	});

	it('an open part pins in place; unpinning and closing', () => {
		let s = openPart(emptyInspector(), p(7));
		expect(shownParts(s)).toEqual([p(7)]);
		s = togglePin(s, p(7));
		expect(s).toEqual({ open: null, pinned: [p(7)] });
		s = openPart(s, p(8));
		expect(shownParts(s)).toEqual([p(7), p(8)]);
		s = closePart(s, p(8));
		s = closePart(s, p(7));
		expect(shownParts(s)).toEqual([]);
	});
});
