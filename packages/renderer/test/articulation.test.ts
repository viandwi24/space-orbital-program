/** Plan 033 / ADR 0045: the engine bell follows the thrust vector and a control surface turns. */
import { describe, expect, test } from 'bun:test';
import { Euler, Vector3, type Object3D } from 'three';
import { articulationRotation } from '../src/parts/articulation.ts';
import { PartModelFactory } from '../src/parts/factory.ts';
import { PRESETS, detailOf } from '../src/presets.ts';
import { launchClampConfigSchema } from '@orbital/mod-stock';
import { stockMaps } from './stock-fixture.ts';

const maps = stockMaps();
const factory = () =>
	new PartModelFactory({
		shapes: maps.shapes,
		visuals: maps.visuals,
		attach: maps.attach,
		detail: detailOf(PRESETS.high)
	});

const find = (root: Object3D, name: string): Object3D => {
	let found: Object3D | undefined;
	root.traverse((o) => {
		if (o.name === name) found = o;
	});
	if (!found) throw new Error(`no object "${name}"`);
	return found;
};

describe('articulationRotation', () => {
	test('gimbal tilts the +Y axis towards the snapshot angles', () => {
		const r = articulationRotation('gimbal', [0.05, -0.03]);
		const q = new Vector3(0, 1, 0).applyEuler(new Euler(r.x, r.y, r.z, 'XYZ'));
		expect(q.x).toBeCloseTo(Math.sin(0.05), 3);
		expect(q.z).toBeCloseTo(Math.sin(-0.03), 3);
		expect(q.y).toBeGreaterThan(0.99);
	});

	test('hinge turns about X; missing or malformed values are the rest pose', () => {
		expect(articulationRotation('hinge', 0.3)).toEqual({ x: 0.3, y: 0, z: 0 });
		expect(articulationRotation('hinge', undefined)).toEqual({ x: 0, y: 0, z: 0 });
		expect(articulationRotation('gimbal', [1])).toEqual({ x: 0, y: 0, z: 0 });
		expect(articulationRotation('gimbal', [Number.NaN, 0])).toEqual({ x: 0, y: 0, z: 0 });
	});
});

describe('models', () => {
	test('the stock engine swings its bell and its plume with the gimbal snapshot', () => {
		const f = factory();
		const model = f.create('stock.engine-lv');
		model.setState({
			modules: {
				'stock.engine': { ignited: true, throttle: 1, flameout: false, gimbal: [0.05, 0] }
			}
		});
		const pivot = find(model.root, 'pivot');
		expect(pivot.rotation.z).toBeCloseTo(-0.05, 12);
		const plume = find(model.root, 'plume');
		expect(plume.parent).toBe(pivot);
		// The exhaust axis (-Y of the plume) leaves towards -X when the thrust tilts towards +X.
		model.root.updateMatrixWorld(true);
		const down = new Vector3(0, -1, 0).transformDirection(plume.matrixWorld);
		expect(down.x).toBeLessThan(-0.04);
		model.setState({ modules: { 'stock.engine': { gimbal: [0, 0] } } });
		expect(pivot.rotation.z).toBe(0);
		model.dispose();
		f.dispose();
	});

	test('the control surface plate turns about X with its deflection; the root stays', () => {
		const f = factory();
		const model = f.create('stock.control-surface');
		model.setState({ modules: { 'stock.control-surface': { deflection: 0.4 } } });
		const pivot = find(model.root, 'pivot');
		expect(pivot.rotation.x).toBeCloseTo(0.4, 12);
		expect(model.triangles).toBeGreaterThan(24);
		model.dispose();
		f.dispose();
	});

	test('the launch clamp tower starts at the module foot and stretches to the snapshot height', () => {
		const f = factory();
		const model = f.create('stock.launch-clamp');
		model.setState({ modules: { 'stock.launch-clamp': { height: 7.5, released: false } } });
		const pivot = find(model.root, 'pivot');
		const foot = launchClampConfigSchema.parse({}).foot;
		expect([pivot.position.x, pivot.position.y, pivot.position.z]).toEqual(foot);
		expect(pivot.scale.y).toBeCloseTo(7.5, 12);
		model.dispose();
		f.dispose();
	});

	test('an engine without articulation data still builds (the pivot rests)', () => {
		const f = factory();
		const model = f.create('stock.engine-lv');
		model.setState({ modules: {} });
		expect(find(model.root, 'pivot').rotation.z).toBe(0);
		model.dispose();
		f.dispose();
	});
});
