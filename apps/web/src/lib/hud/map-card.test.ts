import { expect, test } from 'vitest';
import { mapCardFor } from './map-card';
import type { TargetChoice } from '../target-model';

const choices = [
	{ key: 'vessel:12', ref: { kind: 'vessel', id: 12 }, label: 'Relay', kind: 'vessel' },
	{ key: 'body:stock.moon', ref: { kind: 'body', id: 'stock.moon' }, label: 'Moon', kind: 'body' }
] as unknown as TargetChoice[];

test('a picked vessel opens a card at the click', () => {
	expect(mapCardFor('vessel:12', choices, { x: 40, y: 50 })).toEqual({
		vessel: 12,
		label: 'Relay',
		x: 40,
		y: 50
	});
});
test('bodies, ports and unknown vessels open none', () => {
	expect(mapCardFor('body:stock.moon', choices, { x: 0, y: 0 })).toBeNull();
	expect(mapCardFor('vessel:12:port:3', choices, { x: 0, y: 0 })).toBeNull();
	expect(mapCardFor('vessel:99', choices, { x: 0, y: 0 })).toBeNull();
});
