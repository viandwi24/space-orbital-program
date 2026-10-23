import { definePlugin } from '@orbital/sdk';
import Stock from '@orbital/mod-stock';
import { loadPlugins } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import { changeText, modsOf, originsOf, touchedBy } from './dev-content';

const tuner = definePlugin({
	meta: { id: 'tuner', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(ctx) {
		ctx.parts.register({
			id: 'tuner.box',
			title: 'Box',
			mass: 5,
			shape: { kind: 'box', size: [1, 1, 1] }
		});
		ctx.patches.register({
			id: 'tuner.lighter',
			target: 'part',
			select: { id: 'stock.tank-small' },
			ops: [{ op: 'set', path: 'mass', value: 1 }]
		});
	}
});

describe('where each viewer item comes from (plan 375)', () => {
	const { report } = loadPlugins([Stock, tuner]);
	const origins = originsOf(report, 'part');

	it('names the provider and the patchers of a patched part', () => {
		const tank = origins.get('stock.tank-small')!;
		expect(tank.by).toBe('stock');
		expect(tank.patchedBy).toEqual(['tuner']);
		expect(tank.changes).toHaveLength(1);
		expect(changeText(tank.changes[0]!)).toMatch(/^mass: \d+ → 1$/);
		expect(origins.get('tuner.box')).toEqual({ by: 'tuner', patchedBy: [], changes: [] });
	});

	it('filters by mod: what it registers and what it patches', () => {
		const shown = [...origins.entries()]
			.filter(([, o]) => touchedBy(o, 'tuner'))
			.map(([id]) => id);
		expect(shown.sort()).toEqual(['stock.tank-small', 'tuner.box']);
		expect(touchedBy(origins.get('stock.engine-lv'), 'tuner')).toBe(false);
		expect(touchedBy(origins.get('stock.engine-lv'), null)).toBe(true);
		const mods = modsOf(report, origins);
		expect(mods.map((m) => m.id)).toEqual(['stock', 'tuner']);
		expect(mods[1]).toEqual({ id: 'tuner', registered: 1, patched: 1 });
	});
});
