import { describe, expect, test } from 'bun:test';
import {
	debrisName,
	splitName,
	tidyLegacyNames,
	uniqueVesselName,
	vesselBaseName
} from '../src/index.ts';

describe('vessel names (plan 270, ADR 0252)', () => {
	test('a free name is kept; a taken one gets the first free number', () => {
		expect(uniqueVesselName('Moon shot', [])).toBe('Moon shot');
		expect(uniqueVesselName('Moon shot', ['Moon shot'])).toBe('Moon shot 2');
		expect(uniqueVesselName('Moon shot', ['Moon shot', 'Moon shot 2'])).toBe('Moon shot 3');
		expect(uniqueVesselName('Moon shot', ['Moon shot', 'Moon shot 3'])).toBe('Moon shot 2');
	});

	test('names compare trimmed and case-insensitively; an empty name is "Vessel"', () => {
		expect(uniqueVesselName('  moon SHOT ', ['Moon shot'])).toBe('moon SHOT 2');
		expect(uniqueVesselName('   ', [])).toBe('Vessel');
	});

	test('a number in the name is not taken for a counter', () => {
		expect(uniqueVesselName('Apollo 11', ['Apollo 11'])).toBe('Apollo 11 2');
	});

	test('the base drops every debris tail, legacy chains included, and is never empty', () => {
		expect(vesselBaseName('Moon shot debris')).toBe('Moon shot');
		expect(vesselBaseName('Moon shot debris 4')).toBe('Moon shot');
		expect(vesselBaseName('Moon shot (debris) (debris) (debris)')).toBe('Moon shot');
		expect(vesselBaseName('Moon shot 2 debris')).toBe('Moon shot 2');
		expect(vesselBaseName('debris')).toBe('debris');
	});

	test('debris is named once, numbered when taken', () => {
		const taken = ['Moon shot'];
		const a = debrisName('Moon shot', taken);
		taken.push(a);
		const b = debrisName('Moon shot', taken);
		taken.push(b);
		// a piece of debris that splits again is still "Moon shot debris N"
		const c = debrisName(b, taken);
		expect([a, b, c]).toEqual(['Moon shot debris', 'Moon shot debris 2', 'Moon shot debris 3']);
	});

	test('a controllable side split off gets the base with a number', () => {
		expect(splitName('Moon shot', ['Moon shot'])).toBe('Moon shot 2');
		expect(splitName('Moon shot debris', ['Moon shot', 'Moon shot debris'])).toBe('Moon shot 2');
	});

	test('legacy "(debris)" names are tidied; other names are kept', () => {
		expect(
			tidyLegacyNames([
				'Moon shot',
				'Moon shot (debris)',
				'Moon shot (debris) (debris) (debris)',
				'Rover'
			])
		).toEqual(['Moon shot', 'Moon shot debris', 'Moon shot debris 2', 'Rover']);
		expect(tidyLegacyNames(['A', 'A'])).toEqual(['A', 'A']);
	});
});
