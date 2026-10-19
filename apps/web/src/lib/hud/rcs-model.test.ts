import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { rcsFiring, rcsState } from './rcs-model';

const { registries } = loadPlugins([Stock]);
const part = (definition: string, amounts?: Record<string, number>) => ({
	definition,
	modules: amounts ? { 'stock.resource-container': { amounts } } : {}
});

describe('the RCS pill (plan 211)', () => {
	it('none without RCS, off, on, and no propellant', () => {
		const pod = part('stock.command-pod', { 'stock.monopropellant': 5 });
		expect(rcsState({ parts: [pod] } as never, registries.parts)).toBe('none');
		const parts = [pod, part('stock.rcs-block')];
		expect(rcsState({ parts } as never, registries.parts)).toBe('off');
		expect(rcsState({ parts, rcs: true } as never, registries.parts)).toBe('on');
		const empty = [
			part('stock.command-pod', { 'stock.monopropellant': 0 }),
			part('stock.rcs-block')
		];
		expect(rcsState({ parts: empty, rcs: true } as never, registries.parts)).toBe('dry');
	});
	it('the firing level is the mean over every nozzle', () => {
		const parts = [
			{ definition: 'stock.rcs-block', modules: { 'stock.rcs': { firing: [1, 0, 0, 1] } } },
			{ definition: 'stock.command-pod', modules: {} }
		];
		expect(rcsFiring({ parts } as never)).toBe(0.5);
		expect(rcsFiring({ parts: [] } as never)).toBe(0);
	});
});
