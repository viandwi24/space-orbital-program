/** Plan 090 / ADR 0115: stock buildings validate; the Legacy layout is a valid layout. */
import { describe, expect, test } from 'bun:test';
import {
	buildingDefinitionSchema,
	canPlace,
	LEGACY_LAYOUT,
	LEGACY_SITE,
	loadPlugins
} from '@orbital/sdk';
import { Stock, STOCK_BUILDINGS } from '../src/index.ts';

const { registries, report } = loadPlugins([Stock]);

describe('stock buildings', () => {
	test('every stock building validates and is registered', () => {
		for (const b of STOCK_BUILDINGS)
			expect(buildingDefinitionSchema.safeParse(b).success).toBe(true);
		expect(report.registered.building.map((e) => e.id)).toEqual(STOCK_BUILDINGS.map((b) => b.id));
	});

	test('every building of the Legacy layout passes canPlace against the others', () => {
		for (const b of LEGACY_LAYOUT.buildings) {
			const others = LEGACY_LAYOUT.buildings.filter((o) => o.id !== b.id);
			const r = canPlace(
				{
					body: LEGACY_SITE.body,
					flatRadius: LEGACY_SITE.flatRadius,
					buildings: others,
					roads: LEGACY_LAYOUT.roads
				},
				registries.buildings,
				b.kind,
				b.cell,
				b.rotation
			);
			expect({ id: b.id, ok: r.ok, why: r.ok ? [] : r.reasons.map((x) => x.message) }).toEqual({
				id: b.id,
				ok: true,
				why: []
			});
		}
	});

	test('a patch can change a stock building (patch target `building`)', () => {
		const { report: patched, registries: r } = loadPlugins([
			Stock,
			{
				meta: { id: 'acme', version: '1.0.0', api: '^0.1' },
				depends: [],
				optional: [],
				setup(ctx) {
					ctx.patches.register({
						id: 'acme.bigger-pad',
						target: 'building',
						select: { id: 'stock.launchpad-s' },
						ops: [{ op: 'set', path: 'levels.0.capacity.launch-pad', value: 25 }]
					} as never);
				}
			}
		]);
		expect(patched.patches[0]!.applied).toEqual(['stock.launchpad-s']);
		expect(r.buildings.get('stock.launchpad-s')!.levels[0]!.capacity['launch-pad']).toBe(25);
	});
});
