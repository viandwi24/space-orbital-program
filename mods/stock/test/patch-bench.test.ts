import { describe, expect, test } from 'bun:test';
import {
	definePlugin,
	loadPlugins,
	type AnyPatchDefinition,
	type PartDefinition,
	type ResourceDefinition
} from '@orbital/sdk';
import { Stock } from '../src/index.ts';

/**
 * Plan 079 benchmark: 1 000 patches over the stock registries. The budget (50 ms) is for the M5;
 * other machines print an indicative number.
 */
function patchesFor(parts: readonly PartDefinition[], resources: readonly ResourceDefinition[]) {
	const engines = parts.filter((p) => p.modules?.some(([id]) => id === 'stock.engine'));
	const out: AnyPatchDefinition[] = [];
	for (let i = 0; out.length < 1000; i++) {
		const kind = i % 4;
		if (kind === 0) {
			const part = parts[i % parts.length]!;
			out.push({
				id: `bench.mass-${i}`,
				target: 'part',
				select: { id: part.id },
				ops: [{ op: 'set', path: 'mass', value: part.mass + 1 }]
			});
		} else if (kind === 1) {
			const part = engines[i % engines.length]!;
			const thrust = (part.modules!.find(([id]) => id === 'stock.engine')![1] as { thrust: number })
				.thrust;
			out.push({
				id: `bench.thrust-${i}`,
				target: 'part',
				select: { id: part.id },
				ops: [{ op: 'set', path: 'modules.stock.engine.thrust', value: thrust * 1.01 }]
			});
		} else if (kind === 2) {
			const resource = resources[i % resources.length]!;
			out.push({
				id: `bench.density-${i}`,
				target: 'resource',
				select: { id: resource.id },
				ops: [{ op: 'set', path: 'density', value: resource.density * 1.01 }]
			});
		} else {
			out.push({
				id: `bench.where-${i}`,
				target: 'part',
				select: { where: (p) => p.mass > 1e9 },
				ops: [{ op: 'set', path: 'mass', value: 1 }]
			});
		}
	}
	return out;
}

describe('patches over the stock registries', () => {
	test('stock alone registers no patches', () => {
		const { report } = loadPlugins([Stock]);
		expect(report.patches).toEqual([]);
		expect(report.provenance).toEqual({ part: {}, resource: {}, body: {} });
	});

	test('benchmark: 1 000 patches apply in under 50 ms (M5; indicative elsewhere)', () => {
		// The patch phase is timed as the difference between a load with the patches and one
		// without, best of several rounds each (the SDK does not expose the phase on its own).
		const { registries } = loadPlugins([Stock]);
		const defs = patchesFor(registries.parts.list(), registries.resources.list());
		const bench = definePlugin({
			meta: { id: 'bench', version: '1.0.0', api: '^0.1' },
			depends: [Stock],
			setup(ctx) {
				for (const def of defs) ctx.patches.register(def);
			}
		});
		const empty = definePlugin({
			meta: { id: 'bench', version: '1.0.0', api: '^0.1' },
			depends: [Stock],
			setup() {}
		});
		const best = (plugins: Parameters<typeof loadPlugins>[0]) => {
			let min = Infinity;
			let report: ReturnType<typeof loadPlugins>['report'] | undefined;
			for (let round = 0; round < 7; round++) {
				const start = performance.now();
				report = loadPlugins(plugins).report;
				min = Math.min(min, performance.now() - start);
			}
			return { min, report: report! };
		};
		best([Stock, bench]); // warm-up
		const withPatches = best([Stock, bench]);
		const without = best([Stock, empty]);
		const cost = withPatches.min - without.min;
		expect(withPatches.report.patches.length).toBe(1000);
		expect(withPatches.report.patches.filter((p) => p.disabled)).toEqual([]);
		const applied = withPatches.report.patches.filter((p) => p.applied.length > 0).length;
		console.log(
			`1000 patches (${applied} applied) over stock: ${cost.toFixed(1)} ms ` +
				`(load ${withPatches.min.toFixed(1)} ms with, ${without.min.toFixed(1)} ms without)`
		);
		expect(cost).toBeLessThan(50);
	});
});
