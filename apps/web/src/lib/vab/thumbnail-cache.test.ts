import { describe, expect, it } from 'vitest';
import { hashText, memoryThumbs, thumbKey } from './thumbnail-cache';

describe('the thumbnail cache (plan 312)', () => {
	const design = { formatVersion: 4, parts: [{ index: 0, part: 'stock.command-pod' }] };

	it('a blueprint in two systems gets two entries', () => {
		const a = thumbKey('stock.moon-shot', design, { id: 'stock' });
		const b = thumbKey('stock.moon-shot', design, { id: 'sol', variant: '1:1' });
		const c = thumbKey('stock.moon-shot', design, { id: 'sol', variant: '1:10' });
		expect(new Set([a, b, c]).size).toBe(3);
		expect(b).toContain(':sol:1:1');
	});

	it('a changed design draws again; the same design hits', () => {
		const a = thumbKey('x', design, { id: 'stock' });
		expect(thumbKey('x', { ...design, parts: [] }, { id: 'stock' })).not.toBe(a);
		expect(thumbKey('x', structuredClone(design), { id: 'stock' })).toBe(a);
		expect(hashText('abc')).toBe(hashText('abc'));
		expect(hashText('abc')).not.toBe(hashText('abd'));
	});

	it('the store keeps what it is given', async () => {
		const store = memoryThumbs();
		expect(await store.get('k')).toBeUndefined();
		await store.put({ key: 'k', url: 'data:image/png;base64,AA', at: 1 });
		expect((await store.get('k'))?.url).toBe('data:image/png;base64,AA');
	});
});
