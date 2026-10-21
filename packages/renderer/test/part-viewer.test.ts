/** The pure helpers of the part model viewer (plan 301). */
import { describe, expect, test } from 'bun:test';
import {
	DRIVE_LIMITS,
	driveModules,
	frameDistance,
	nodeMarkerRadius,
	rowGap,
	rowLayout
} from '../src/part-viewer/layout.ts';
import { PartModelFactory } from '../src/parts/factory.ts';
import { detailOf, PRESETS } from '../src/presets.ts';
import { stockMaps } from './stock-fixture.ts';

describe('part viewer layout', () => {
	test('a row is centred and keeps the gap between neighbours', () => {
		const xs = rowLayout([1, 2, 1], 0.5);
		expect(xs).toEqual([-2, 0, 2]);
		expect(rowLayout([2], 1)).toEqual([0]);
		expect(rowLayout([], 1)).toEqual([]);
		// a broken width takes no room
		expect(rowLayout([1, Number.NaN, 1], 0)).toEqual([-0.5, 0, 0.5]);
		expect(rowGap([0.5, 3])).toBe(1);
		expect(rowGap([0.1])).toBe(0.25);
	});

	test('the framing distance fits the sphere in the narrower field of view', () => {
		const wide = frameDistance(1, 40, 2, 1);
		expect(wide).toBeCloseTo(1 / Math.sin((20 * Math.PI) / 180), 6);
		// a tall view is limited by its horizontal field, so the camera stands further back
		expect(frameDistance(1, 40, 0.5, 1)).toBeGreaterThan(wide);
		expect(nodeMarkerRadius(0.2)).toBe(0.01);
		expect(nodeMarkerRadius(2.5)).toBeCloseTo(0.05, 9);
		expect(nodeMarkerRadius(40)).toBe(0.1);
	});
});

describe('part viewer drive', () => {
	const { visuals } = stockMaps();

	test('deploy writes the flag of the visual, clamped', () => {
		const chute = [...visuals.entries()].find(([, v]) => v.deploy)!;
		const [, visual] = chute;
		const m = driveModules(visual, { deploy: 2, art: 0, fire: false });
		expect(m[visual.deploy!.module]![visual.deploy!.flag]).toBe(1);
	});

	test('firing lights the plume and every RCS jet; the rest pose writes no articulation', () => {
		const rcs = visuals.get('stock.rcs-block')!;
		expect(rcs.puffs).toBeDefined();
		const m = driveModules(rcs, { deploy: 0, art: 0, fire: true });
		const jets = m[rcs.puffs!.module]![rcs.puffs!.field] as number[];
		expect(jets).toHaveLength(rcs.puffs!.nozzles.length);
		expect(jets.every((j) => j === 1)).toBe(true);
		const engine = [...visuals.values()].find((v) => v.plume && v.articulation?.mode === 'gimbal')!;
		const fired = driveModules(engine, { deploy: 0, art: 0, fire: true });
		expect(fired[engine.plume!.module]).toMatchObject({ ignited: true, throttle: 1 });
		expect(fired[engine.articulation!.module]?.[engine.articulation!.field]).toBeUndefined();
		const tilted = driveModules(engine, { deploy: 0, art: -1, fire: false });
		expect(tilted[engine.articulation!.module]![engine.articulation!.field]).toEqual([
			-DRIVE_LIMITS.gimbal,
			0
		]);
		expect(driveModules(undefined, { deploy: 1, art: 1, fire: true })).toEqual({});
	});

	test('a deploying part builds and takes the drive', () => {
		const maps = stockMaps();
		const factory = new PartModelFactory({ ...maps, detail: detailOf(PRESETS.low) });
		const [id, visual] = [...maps.visuals.entries()].find(([, v]) => v.deploy)!;
		const model = factory.create(id);
		model.setState({ modules: driveModules(visual, { deploy: 1, art: 0, fire: false }) });
		model.tick(60);
		expect(model.triangles).toBeGreaterThan(0);
		model.dispose();
		factory.dispose();
	});
});
