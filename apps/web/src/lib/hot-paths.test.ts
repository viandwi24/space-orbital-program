/** Plan 409: the per-snapshot and per-frame paths build no strings to tell whether something changed. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pinPositionsOrPrev } from './space-center/model';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('no JSON.stringify on the hot paths (plan 409)', () => {
	it('the Space Center, Mission Center and the flight loop compare by value, not by string', () => {
		for (const file of [
			'../routes/(world)/space-center/+page.svelte',
			'../routes/(world)/mission-center/+page.svelte',
			'./flight-loop.ts'
		])
			expect(read(file), file).not.toContain('JSON.stringify');
	});

	it('the flight page stringifies only to download a replay', () => {
		const page = read('../routes/(world)/flight/+page.svelte');
		const lines = page.split('\n').filter((l) => l.includes('JSON.stringify'));
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain('downloadText');
	});
});

describe('pinPositionsOrPrev', () => {
	const rows = [
		{ id: 'a', anchor: { east: 0, north: 0 } },
		{ id: 'b', anchor: { east: 10, north: 0 } }
	];
	const at = (x: number) => (p: { east: number }) => ({ x: x + p.east, y: 5 });

	it('returns the previous record itself while no pin moves a pixel', () => {
		const first = pinPositionsOrPrev(rows, at(100), {});
		expect(first).toEqual({ a: { x: 100, y: 5 }, b: { x: 110, y: 5 } });
		expect(pinPositionsOrPrev(rows, at(100.4), first)).toBe(first);
	});

	it('builds a new record when a pin moves or a row appears', () => {
		const first = pinPositionsOrPrev(rows, at(100), {});
		const moved = pinPositionsOrPrev(rows, at(103), first);
		expect(moved).not.toBe(first);
		expect(moved.a).toEqual({ x: 103, y: 5 });
		const more = pinPositionsOrPrev(
			[...rows, { id: 'c', anchor: { east: 0, north: 0 } }],
			at(100),
			first
		);
		expect(Object.keys(more)).toEqual(['a', 'b', 'c']);
	});
});
