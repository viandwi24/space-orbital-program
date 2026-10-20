/** Plan 249: the suit's helmet is hidden while it is off, and its canopy shows with the chute open. */
import { describe, expect, test } from 'bun:test';
import { canopyOpening } from '@orbital/mod-stock';
import type { Object3D } from 'three';
import { PartModelFactory } from '../src/parts/factory.ts';
import { PRESETS, detailOf } from '../src/presets.ts';
import { stockMaps } from './stock-fixture.ts';

const maps = stockMaps();
const factory = new PartModelFactory({
	shapes: maps.shapes,
	visuals: maps.visuals,
	attach: maps.attach,
	detail: detailOf(PRESETS.high)
});

function shown(root: Object3D, name: string): boolean {
	const o = root.getObjectByName(name);
	if (!o) return false;
	for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
	return true;
}

describe('the EVA suit (plan 249)', () => {
	test('the helmet piece shows while the helmet is on and hides when it is off', () => {
		for (const on of [true, false]) {
			const model = factory.create('stock.eva-suit');
			model.setState({ modules: { 'stock.helmet': { on } } });
			expect(shown(model.root, 'pivot'), `helmet ${on}`).toBe(on);
			model.dispose();
		}
	});

	test('the canopy shows once the personal chute is open and not before', () => {
		for (const status of ['stowed', 'armed', 'full', 'cut'] as const) {
			const model = factory.create('stock.eva-suit');
			model.setState({
				modules: {
					'stock.helmet': { on: true },
					'stock.parachute': { status, canopy: canopyOpening({ status, opening: 1 }) }
				}
			});
			model.tick(5);
			expect(shown(model.root, 'canopy'), status).toBe(status === 'full');
			model.dispose();
		}
	});
});
