import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { referenceTwoStage } from '../design';
import { designStats } from '../editor/stats';
import { destinationsOf } from '../editor/trip';
import { tripView } from '../editor/trip-view';
import {
	FOLD_DEFAULTS,
	defaultFolds,
	parseFolds,
	serialiseFolds,
	tripSummary
} from './panel-model';

const { registries } = loadPlugins([Stock]);
const content = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};
const destinations = destinationsOf(registries.bodies.list());
const stats = designStats(referenceTwoStage(), content, 'vacuum', 9.81);
const n = (v: number): string => Math.round(v).toLocaleString('en-US');

describe('the right panel sections (plan 255)', () => {
	it('start as the defaults: staging and checks open, the rest folded', () => {
		expect(defaultFolds()).toEqual({
			trip: false,
			staging: true,
			checks: true,
			power: false,
			crew: false
		});
		expect(Object.keys(FOLD_DEFAULTS)).toHaveLength(5);
	});
	it('round trip, and a damaged or partial value falls back per section', () => {
		const state = { ...defaultFolds(), trip: true, staging: false };
		expect(parseFolds(serialiseFolds(state))).toEqual(state);
		expect(parseFolds(null)).toEqual(defaultFolds());
		expect(parseFolds('{nope')).toEqual(defaultFolds());
		expect(parseFolds('[1]')).toEqual(defaultFolds());
		expect(parseFolds('{"trip":true,"staging":"yes","extra":1}')).toEqual({
			...defaultFolds(),
			trip: true
		});
	});
});

describe('the trip as one line', () => {
	const view = (id: string, parts = stats.partCount) => {
		const dest = destinations.find((d) => d.id === id)!;
		return tripView(dest, stats.report, parts);
	};
	it('covered: the figures, in the good tone', () => {
		const t = view('low-orbit');
		const s = tripSummary(t, n, 'm/s');
		expect(s.tone).toBe('good');
		expect(s.text).toBe(`${t.destination.label}: ${n(t.covered)} of ${n(t.needed)} m/s`);
	});
	it('short: says by how much, in the warning tone', () => {
		const s = tripSummary(view('stock.cinder:landing'), n, 'm/s');
		expect(s.tone).toBe('warn');
		expect(s.text).toMatch(/: short by [\d,]+ m\/s$/);
	});
	it('empty and no propulsion: idle, and says what to do', () => {
		expect(tripSummary(view('low-orbit', 0), n, 'm/s')).toMatchObject({ tone: 'idle' });
		const none = tripView(destinations[0]!, null, 3);
		expect(tripSummary(none, n, 'm/s').text).toContain('no stage gives');
	});
});
