import { describe, expect, it } from 'vitest';
import { portraitSpec } from './portrait-model';

describe('crew portraits (plan 341)', () => {
	it('is happy at the Space Center in the profession outfit, in the flight suit aboard', () => {
		expect(portraitSpec({ id: 'a', profession: 'engineer', status: 'available' })).toMatchObject({
			outfit: 'engineer',
			expression: 'happy'
		});
		expect(portraitSpec({ id: 'a', profession: 'engineer', status: 'assigned' }).outfit).toBe(
			'flight'
		);
	});

	it('is sad when lost or missing, sleepy aboard on a long warp', () => {
		expect(portraitSpec({ id: 'a', profession: 'pilot', status: 'lost' }).expression).toBe('sad');
		expect(portraitSpec({ id: 'a', profession: 'pilot', status: 'missing' }).expression).toBe(
			'sad'
		);
		expect(
			portraitSpec({ id: 'a', profession: 'pilot', status: 'assigned', warping: true }).expression
		).toBe('sleepy');
	});

	it('keeps one look per id', () => {
		const a = portraitSpec({ id: 'crew-3', profession: 'pilot' });
		const b = portraitSpec({ id: 'crew-3', profession: 'scientist', status: 'lost' });
		expect(a.appearance).toEqual(b.appearance);
	});
});
