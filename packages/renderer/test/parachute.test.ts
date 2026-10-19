/** Plan 209: the canopy shows for a semi-deployed and a full parachute, not stowed, cut or torn. */
import { describe, expect, test } from 'bun:test';
import { canopyOpening, type ParachuteStatus } from '@orbital/mod-stock';
import type { Object3D } from 'three';
import { PartModelFactory } from '../src/parts/factory.ts';
import { canopyShape } from '../src/parts/generators/parachute.ts';
import { PRESETS, detailOf } from '../src/presets.ts';
import { stockMaps } from './stock-fixture.ts';

const maps = stockMaps();
const factory = new PartModelFactory({
	shapes: maps.shapes,
	visuals: maps.visuals,
	attach: maps.attach,
	detail: detailOf(PRESETS.high)
});

/** Whether `name` under `root` and all its parents are visible. */
function shown(root: Object3D, name: string): boolean {
	const o = root.getObjectByName(name);
	if (!o) return false;
	for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
	return true;
}

describe('parachute canopy (plan 209)', () => {
	for (const part of ['stock.parachute', 'stock.radial-parachute', 'stock.drogue-chute']) {
		test(`${part}: a canopy for semi and full, none for stowed, armed, cut and torn`, () => {
			const statuses: ParachuteStatus[] = ['stowed', 'armed', 'semi', 'full', 'cut', 'torn'];
			for (const status of statuses) {
				const model = factory.create(part);
				const canopy = canopyOpening({ status, opening: 1 });
				model.setState({ modules: { 'stock.parachute': { status, canopy } } });
				model.tick(5);
				const open = status === 'semi' || status === 'full';
				expect(shown(model.root, 'canopy'), `${part} ${status}`).toBe(open);
				model.dispose();
			}
		});
	}

	test('semi is a narrow streamer, full a dome of the canopy radius', () => {
		const semi = canopyShape(canopyOpening({ status: 'semi', opening: 1 }));
		const full = canopyShape(canopyOpening({ status: 'full', opening: 1 }));
		expect(semi.radius).toBeLessThan(0.2);
		expect(full.radius).toBe(1);
		const model = factory.create('stock.parachute');
		model.setState({ modules: { 'stock.parachute': { canopy: 1 } } });
		model.root.updateMatrixWorld(true);
		const dome = model.root.getObjectByName('dome')!;
		expect(dome.scale.x).toBeCloseTo(11, 6); // the part's `canopy` param
		model.dispose();
	});
});
