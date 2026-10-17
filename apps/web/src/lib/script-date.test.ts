import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { scriptDate } from './script-date';

describe('scriptDate (plan 081)', () => {
	it('formats the stock calendar from the world epoch', () => {
		const bodies = loadPlugins([Stock]).registries.bodies.list();
		const date = scriptDate({ bodies, epoch: { day: 1, fraction: 0 } });
		// one SI day is 3.99 stock days of 21 650.8 s since the planet orbits the Sun (plan 122), plus 90 s
		expect(date(90)).toEqual({
			text: 'Year 1, day 4, 05:58:57',
			julianDate: 2_451_546 + 90 / 86_400
		});
		expect(scriptDate({ bodies })(0).text).toBe('Year 1, day 1, 00:00:00');
	});
});
