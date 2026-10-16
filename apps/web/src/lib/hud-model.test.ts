import { describe, expect, it } from 'vitest';
import { referenceTwoStage } from './design';
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import {
	bodyLabel,
	displayVesselName,
	groundClearance,
	situationLabel,
	vesselThrottle
} from './hud-model';

describe('vessel display name', () => {
	it('keeps a real name', () => {
		expect(displayVesselName(referenceTwoStage())).toBe('Two-stage');
	});
	it('never shows "Untitled vessel": blank and default names become a stable callsign', () => {
		const a = displayVesselName({ ...referenceTwoStage(), name: 'Untitled vessel' });
		const b = displayVesselName({ ...referenceTwoStage(), name: '  ' });
		const other = displayVesselName({ ...referenceTwoStage(), name: '', stages: [[1]] });
		expect(a).toMatch(/^OV-[0-9A-F]{4}$/);
		expect(a).toBe(b);
		expect(other).not.toBe(a);
	});
});

describe('labels', () => {
	it('title-cases the body id', () => expect(bodyLabel('stock.home')).toBe('Home'));
	it('describes the situation', () => {
		expect(situationLabel('landed', false, 'Home')).toBe('Landed on Home');
		expect(situationLabel('orbit', false, 'Home')).toBe('Orbiting Home');
		expect(situationLabel('orbit', true, 'Home')).toBe('Escaping Home');
		expect(situationLabel(null, false, 'Home')).toBe('Starting up');
	});
});

describe('ground clearance', () => {
	const { registries } = loadPlugins([Stock]);
	it('is the height of the root origin above the lowest part: 7.5 m for the two-stage vessel', () => {
		// pod 1 m (origin at its middle) + wheel 0.4 + tank 2 + engine 1.2 + decoupler 0.2 + tank 2 + engine 1.2
		expect(groundClearance(referenceTwoStage(), registries.parts)).toBeCloseTo(7.5, 9);
	});
	it('is 0 for a design that does not resolve', () => {
		expect(groundClearance({ ...referenceTwoStage(), parts: [] }, registries.parts)).toBe(0);
	});
});

describe('vessel throttle', () => {
	const engine = (throttle: number) => ({ modules: { 'stock.engine': { throttle } } });
	it('reads the highest engine throttle, so a script or the autopilot shows on the gauge', () => {
		expect(vesselThrottle([{ modules: {} }, engine(0.25), engine(0.75)], 0)).toBe(0.75);
	});
	it('falls back to the page setting without engines or with malformed state', () => {
		expect(vesselThrottle([{ modules: {} }], 0.4)).toBe(0.4);
		expect(vesselThrottle([{ modules: { 'stock.engine': { throttle: 'x' } } }], 0.4)).toBe(0.4);
	});
});
