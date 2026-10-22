/** Plan 346 (ADR 0295 point 6): the Launch page's vessel library. */
import { describe, expect, it } from 'vitest';
import { referenceTwoStage } from '../design';
import { editedText, mergeLibrary, shownLibrary, type VesselItem } from './vessel-library';

const base = referenceTwoStage();
const lighter = { ...base, parts: base.parts.slice(0, -1) };
const item = (key: string, over: Partial<VesselItem> = {}): VesselItem => ({
	key,
	name: 'Two-stage',
	from: 'library',
	design: base,
	wet: 12_990,
	cost: 9000,
	seats: 1,
	parts: base.parts.length,
	updatedAt: 1000,
	thumbnail: null,
	...over
});
const all = { query: '', filter: 'all', sort: 'recent' } as const;

describe('mergeLibrary', () => {
	it('shows one of identical designs, the newest, and counts the copies', () => {
		const out = mergeLibrary([
			item('a', { updatedAt: 1 }),
			item('b', { updatedAt: 3 }),
			item('c', { updatedAt: 2 })
		]);
		expect(out).toHaveLength(1);
		expect(out[0]!.key).toBe('b');
		expect([...out[0]!.copies].sort()).toEqual(['a', 'c']);
		expect(out[0]!.variant).toBeNull();
	});

	it('a renamed copy is its own entry; the name is compared without case', () => {
		expect(mergeLibrary([item('a'), item('b', { name: 'Other' })])).toHaveLength(2);
		expect(mergeLibrary([item('a'), item('b', { name: 'two-STAGE' })])).toHaveLength(1);
	});

	it('different designs under one name are variants, the oldest v1', () => {
		const out = mergeLibrary([
			item('new', { design: { ...lighter, name: 'Two-stage' }, updatedAt: 5 }),
			item('old', { updatedAt: 1 })
		]);
		expect(Object.fromEntries(out.map((v) => [v.key, v.variant]))).toEqual({ old: 1, new: 2 });
	});

	it('a library record that matches the Hangar folds into it', () => {
		const out = mergeLibrary([item('rec', { updatedAt: 9 }), item('hangar', { from: 'hangar' })]);
		expect(out).toHaveLength(1);
		expect(out[0]!.key).toBe('hangar');
		expect(out[0]!.inHangar).toBe(true);
		expect(out[0]!.copies).toEqual(['rec']);
	});
});

describe('shownLibrary', () => {
	const items = [
		item('hangar', { from: 'hangar', design: { ...lighter, name: 'Draft' }, name: 'Draft' }),
		item('b', {
			name: 'Wayfarer',
			design: { ...base, name: 'Wayfarer', aircraft: true },
			wet: 400_000,
			cost: 5,
			updatedAt: 2
		}),
		item('c', {
			name: 'Aurora',
			design: { ...lighter, name: 'Aurora', parts: lighter.parts.slice(0, -1) },
			wet: 30_000,
			cost: 50,
			seats: 0,
			updatedAt: 3
		}),
		item('d', { name: 'Horizon', wet: 50_000, cost: 500, updatedAt: 1 })
	];

	it('keeps the Hangar apart and sorts the rest', () => {
		const out = shownLibrary(items, all);
		expect(out.hangar?.key).toBe('hangar');
		expect(out.library.map((v) => v.key)).toEqual(['c', 'b', 'd']);
		expect(shownLibrary(items, { ...all, sort: 'name' }).library.map((v) => v.name)).toEqual([
			'Aurora',
			'Horizon',
			'Wayfarer'
		]);
		expect(shownLibrary(items, { ...all, sort: 'mass' }).library.map((v) => v.key)).toEqual([
			'c',
			'd',
			'b'
		]);
		expect(shownLibrary(items, { ...all, sort: 'cost' }).library.map((v) => v.key)).toEqual([
			'b',
			'c',
			'd'
		]);
	});

	it('searches names and filters by kind and crew', () => {
		expect(shownLibrary(items, { ...all, query: 'hor' }).library.map((v) => v.key)).toEqual(['d']);
		expect(shownLibrary(items, { ...all, query: 'hor' }).hangar).toBeNull();
		expect(shownLibrary(items, { ...all, filter: 'aircraft' }).library.map((v) => v.key)).toEqual([
			'b'
		]);
		expect(shownLibrary(items, { ...all, filter: 'rocket' }).library.map((v) => v.key)).toEqual([
			'c',
			'd'
		]);
		expect(shownLibrary(items, { ...all, filter: 'crewed' }).library.map((v) => v.key)).toEqual([
			'b',
			'd'
		]);
	});

	it('keeps the variants of a name together, newest first', () => {
		const out = shownLibrary(
			[
				item('v1', { updatedAt: 1 }),
				item('x', { name: 'Zed', design: { ...lighter, name: 'Zed' }, updatedAt: 5 }),
				item('v2', { design: { ...base, aircraft: true }, updatedAt: 9 })
			],
			all
		);
		expect(out.library.map((v) => v.key)).toEqual(['v2', 'v1', 'x']);
	});
});

describe('editedText', () => {
	it('reads as a short age, then a date', () => {
		const now = Date.UTC(2026, 9, 22);
		expect(editedText(now - 10_000, now)).toBe('just now');
		expect(editedText(now - 5 * 60_000, now)).toBe('5 min ago');
		expect(editedText(now - 3 * 3600_000, now)).toBe('3 h ago');
		expect(editedText(now - 86400_000, now)).toBe('1 day ago');
		expect(editedText(Date.UTC(2026, 0, 2), now)).toBe('2026-01-02');
	});
});
