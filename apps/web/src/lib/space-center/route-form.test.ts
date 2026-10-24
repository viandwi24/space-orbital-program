/** The new-route form (plan 386): what it accepts, the command it makes and the ids it avoids. */
import { describe, expect, it } from 'vitest';
import { routeCommand, routeFeeLine, routeId } from './route-form';

const sites = [
	{ id: 'legacy', label: 'Home' },
	{ id: 'b', label: 'Base B' }
];
const form = { from: 'legacy', to: 'b', commodity: 'stock.ice', amount: 200 };

describe('the new-route form', () => {
	it('a filled form makes the command, with an id from its ends and cargo', () => {
		expect(routeCommand(form, sites, [])).toEqual({
			command: {
				type: 'create-route',
				id: 'legacy-b-ice',
				from: 'legacy',
				to: 'b',
				commodity: 'stock.ice',
				amount: 200
			}
		});
	});

	it('the id is never one in use', () => {
		expect(routeId(form, ['legacy-b-ice'])).toBe('legacy-b-ice-2');
		expect(routeId(form, ['legacy-b-ice', 'legacy-b-ice-2'])).toBe('legacy-b-ice-3');
	});

	it('refuses what cannot be a route, each with its reason', () => {
		expect(routeCommand({ ...form, to: 'legacy' }, sites, [])).toEqual({
			reason: 'a route needs two sites'
		});
		expect(routeCommand({ ...form, from: 'nowhere' }, sites, [])).toEqual({
			reason: 'choose the site it leaves'
		});
		expect(routeCommand({ ...form, to: '' }, sites, [])).toEqual({
			reason: 'choose the site it arrives at'
		});
		expect(routeCommand({ ...form, commodity: '' }, sites, [])).toEqual({
			reason: 'choose what it carries'
		});
		expect(routeCommand({ ...form, amount: 0 }, sites, [])).toEqual({
			reason: 'the amount a window must be more than zero'
		});
		expect(routeCommand({ ...form, amount: Number.NaN }, sites, [])).toHaveProperty('reason');
	});

	it('the line under the form names the launch fee when there is one', () => {
		expect(routeFeeLine(1500)).toContain('1,500');
		expect(routeFeeLine(null)).toContain('Each window');
	});
});
