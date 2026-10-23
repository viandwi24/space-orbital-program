/**
 * Stock's blueprints are baked from the Hangar's builders (ADR 0316): every registered design must
 * equal what its builder makes now. When this fails after a builder change, run
 * `bun scripts/bake-stock-blueprints.ts` in apps/web.
 */
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { BLUEPRINT_SOURCES, stableNumbers } from './blueprint-sources';

const { registries, report } = loadPlugins([Stock]);
const content = { parts: registries.parts, modules: registries.modules };

describe("stock's blueprints (ADR 0316)", () => {
	it('stock registers exactly the sources, in order', () => {
		expect(report.registered.blueprint).toEqual(
			BLUEPRINT_SOURCES.map((s) => ({ id: s.id, by: 'stock' }))
		);
	});

	for (const source of BLUEPRINT_SOURCES) {
		it(`${source.id} equals what its builder makes (bake again if not)`, () => {
			const registered = registries.blueprints.get(source.id)!;
			const { build, systems, ...card } = source;
			const { design, systems: registeredSystems, ...fields } = registered;
			expect(fields).toEqual(card);
			expect(stableNumbers(design)).toEqual(stableNumbers(build(content)));
			// each system's own design too (plan 380)
			expect(stableNumbers(registeredSystems)).toEqual(
				systems &&
					stableNumbers(
						systems.map(({ build: own, ...s }) => ({
							...s,
							...(own ? { design: own(content) } : {})
						}))
					)
			);
		});
	}
});
