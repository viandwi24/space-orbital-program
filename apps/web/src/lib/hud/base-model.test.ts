/** The Flight HUD's base offers (plan 386): the buttons, their reasons and the commands they send. */
import { describe, expect, it } from 'vitest';
import type { EntityId } from '@orbital/core';
import { baseButtons, baseCommand, siteIdFor, type BaseOffers } from './base-model';

const v = 7 as EntityId;
const kit: BaseOffers = { found: { body: 'stock.cinder', latitude: 0.1, longitude: -0.5 } };

describe('base offers', () => {
	it('a kit on the Moon offers to found a base, with the spot', () => {
		const [found] = baseButtons(kit, (id) => id.replace('stock.', ''));
		expect(found).toMatchObject({ id: 'found', label: 'Found a base here…' });
		expect(found!.detail).toBe('cinder, 5.73° N, 28.65° W');
		expect(found!.reason).toBeUndefined();
	});

	it('a refused spot keeps the button, with the reason', () => {
		const [found] = baseButtons({
			found: { ...kit.found!, refusal: 'too close to site "b" (3 km): flat zones would overlap' }
		});
		expect(found!.reason).toContain('too close');
		expect(
			baseCommand('found', v, { found: { ...kit.found!, refusal: 'no' } }, { name: 'X' })
		).toEqual({
			reason: 'no'
		});
	});

	it('founding needs a name; the id comes from it and is never one in use', () => {
		expect(baseCommand('found', v, kit, { name: '  ' })).toEqual({ reason: 'name the base' });
		expect(baseCommand('found', v, kit, { name: 'Tranquil Camp', taken: ['legacy'] })).toEqual({
			command: { type: 'deploy-base', vessel: v, id: 'tranquil-camp', name: 'Tranquil Camp' }
		});
		expect(siteIdFor('Tranquil Camp', ['tranquil-camp', 'tranquil-camp-2'])).toBe(
			'tranquil-camp-3'
		);
		expect(siteIdFor('???', [])).toBe('base');
	});

	it("inside a site's flat zone it offers to join; a member offers to refuel with what is stored", () => {
		const offers: BaseOffers = {
			join: { site: 'b', name: 'Base B' },
			refuel: { site: 'b', name: 'Base B', stored: { 'stock.liquid-fuel': 1234.4 } }
		};
		const buttons = baseButtons(offers, (id) => id.replace('stock.', ''));
		expect(buttons.map((b) => b.label)).toEqual(['Join Base B', 'Refuel from Base B']);
		expect(buttons[1]!.detail).toBe('Stored: 1,234 liquid-fuel');
		expect(baseCommand('join', v, offers)).toEqual({
			command: { type: 'join-site', vessel: v, site: 'b' }
		});
		expect(baseCommand('refuel', v, offers)).toEqual({
			command: { type: 'refuel', vessel: v, site: 'b' }
		});
	});

	it('nothing on offer: no buttons, and a command asks for a reason', () => {
		expect(baseButtons(null)).toEqual([]);
		expect(baseCommand('join', v, {})).toEqual({ reason: 'no site here to join' });
		expect(baseCommand('refuel', v, {})).toEqual({ reason: 'the site stores no propellant yet' });
	});
});
