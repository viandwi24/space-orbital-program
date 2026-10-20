/** Orbit and icon rules of the map (plan 258, ADR 0242). */
import { describe, expect, it } from 'bun:test';
import { VESSEL_TYPES } from '@orbital/core';
import {
	ORBIT_STYLES,
	VESSEL_ICON_PATHS,
	iconColour,
	iconPath,
	orbitRole
} from '../src/map-style.ts';

describe('orbit roles', () => {
	const none = { active: null, target: null };
	it('the active vessel is white, the others grey, debris dim', () => {
		expect(orbitRole({ id: 1, type: 'ship' }, { active: 1, target: null })).toBe('active');
		expect(orbitRole({ id: 2, type: 'probe' }, { active: 1, target: null })).toBe('other');
		expect(orbitRole({ id: 3, type: 'debris' }, { active: 1, target: null })).toBe('debris');
		expect(orbitRole({ id: 3 }, none)).toBe('other');
		expect(ORBIT_STYLES.active.colour).toBe(0xffffff);
		expect(ORBIT_STYLES.other.colour).not.toBe(ORBIT_STYLES.active.colour);
	});
	it('the target stands out, even over the active vessel, and debris that is the target too', () => {
		expect(orbitRole({ id: 2, type: 'probe' }, { active: 1, target: 2 })).toBe('target');
		expect(orbitRole({ id: 1, type: 'ship' }, { active: 1, target: 1 })).toBe('target');
		expect(orbitRole({ id: 9, type: 'debris' }, { active: 1, target: 9 })).toBe('target');
	});
	it('the four styles are distinct, and the active line is the widest', () => {
		const colours = new Set(Object.values(ORBIT_STYLES).map((s) => s.colour));
		expect(colours.size).toBe(4);
		const widest = Math.max(...Object.values(ORBIT_STYLES).map((s) => s.width));
		expect(ORBIT_STYLES.active.width).toBe(widest);
		expect(iconColour('target')).toBe(ORBIT_STYLES.target.colour);
	});
});

describe('vessel icons', () => {
	it('has a glyph for every vessel type, each its own', () => {
		for (const t of VESSEL_TYPES) expect(VESSEL_ICON_PATHS[t], t).toMatch(/^M/);
		expect(new Set(VESSEL_TYPES.map((t) => VESSEL_ICON_PATHS[t])).size).toBe(VESSEL_TYPES.length);
	});
	it('an unknown or missing type draws the ship', () => {
		expect(iconPath(undefined)).toBe(VESSEL_ICON_PATHS.ship);
		expect(iconPath('mystery' as never)).toBe(VESSEL_ICON_PATHS.ship);
		expect(iconPath('relay')).toBe(VESSEL_ICON_PATHS.relay);
	});
});
