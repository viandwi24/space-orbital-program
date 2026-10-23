/** Plan 400 (ADR 0335): every stock engine's plume carries a valid template that names a propellant base. */
import { describe, expect, test } from 'bun:test';
import { PLUME_PROPELLANTS, loadPlugins, plumeTemplateSchema } from '@orbital/sdk';
import Stock from '../src/index.ts';

const parts = loadPlugins([Stock]).registries.parts.list();
const engines = parts.filter((p) => p.visual?.plume);

describe('stock plume templates', () => {
	test('there are engines to check', () => {
		expect(engines.length).toBeGreaterThanOrEqual(18);
	});

	test('every engine with a plume has a valid template with a propellant base', () => {
		for (const e of engines) {
			const t = e.visual!.plume!.template;
			expect(t, e.id).toBeDefined();
			expect(plumeTemplateSchema.safeParse(t).success, e.id).toBe(true);
			expect(PLUME_PROPELLANTS).toContain(t!.propellant);
		}
	});

	test('the propellants differ across the engines: solids, kerolox, hydrolox, methalox and hypergolic all appear', () => {
		const used = new Set(engines.map((e) => e.visual!.plume!.template!.propellant));
		for (const p of ['solid', 'kerolox', 'hydrolox', 'methalox', 'hypergolic'] as const) {
			expect(used.has(p), p).toBe(true);
		}
	});

	test('solid motors use the solid base and liquid engines do not', () => {
		for (const e of engines) {
			const solid = (e.modules ?? []).some(
				([, config]) => (config as { solid?: boolean } | null)?.solid === true
			);
			const isSolid = e.visual!.plume!.template!.propellant === 'solid';
			if (solid) expect(isSolid, e.id).toBe(true);
		}
		expect(
			engines.find((e) => e.id === 'stock.engine-plate-f1')!.visual!.plume!.template!.lengthScale
		).toBeGreaterThan(1);
	});
});
