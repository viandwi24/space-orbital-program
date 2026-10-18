import { describe, expect, test } from 'bun:test';
import { Group, Mesh, Vector3, type Object3D } from 'three';
import { PartModelFactory } from '../src/parts/factory.ts';
import { applyShrouds, shroudCandidates, shroudProfile } from '../src/parts/shroud.ts';
import type { PartModel } from '../src/parts/types.ts';
import { PRESETS, detailOf } from '../src/presets.ts';
import { stockMaps } from './stock-fixture.ts';

const maps = stockMaps();
const factory = new PartModelFactory({
	shapes: maps.shapes,
	visuals: maps.visuals,
	attach: maps.attach,
	detail: detailOf(PRESETS.high)
});

/** Builds a stack top to bottom: each part's top node on the previous part's bottom node. */
function stack(definitions: readonly string[]): Map<string, { model: PartModel }> {
	const group = new Group();
	const parts = new Map<string, { model: PartModel }>();
	let y = 0;
	definitions.forEach((definition, i) => {
		const model = factory.create(definition);
		const top = model.nodes.top?.pos[1] ?? 0;
		const bottom = model.nodes.bottom?.pos[1] ?? 0;
		model.root.position.set(0, y - top, 0);
		y = y - top + bottom;
		group.add(model.root);
		parts.set(`${i}:${definition}`, { model });
	});
	return parts;
}

const shroudOf = (model: PartModel): Mesh | undefined =>
	model.root.children.find((o: Object3D): o is Mesh => o instanceof Mesh && o.name === 'shroud');

/** Largest radius of the shroud's vertices at the part's bottom face. */
function bottomRim(model: PartModel): number {
	const mesh = shroudOf(model)!;
	const pos = mesh.geometry.getAttribute('position');
	const v = new Vector3();
	const y = model.nodes.bottom!.pos[1];
	let r = 0;
	for (let i = 0; i < pos.count; i++) {
		v.fromBufferAttribute(pos, i);
		if (Math.abs(v.y - y) < 1e-4) r = Math.max(r, Math.hypot(v.x, v.z));
	}
	return r;
}

describe('auto shrouds (plan 207)', () => {
	test('an engine with a 1.25 m tank below gets a 1.25 m shroud', () => {
		const parts = stack(['stock.engine-lv', 'stock.tank-small']);
		applyShrouds(shroudCandidates(parts));
		const engine = parts.get('0:stock.engine-lv')!.model;
		expect(engine.shroud).toBe(1.25);
		expect(shroudOf(engine)).toBeDefined();
		expect(Math.abs(bottomRim(engine) - 0.625)).toBeLessThan(1e-3);
		// The tank has no shroud of its own.
		expect(parts.get('1:stock.tank-small')!.model.shroud ?? null).toBeNull();
	});

	test('an engine with nothing below has none', () => {
		const parts = stack(['stock.tank-small', 'stock.engine-cluster']);
		applyShrouds(shroudCandidates(parts));
		const engine = parts.get('1:stock.engine-cluster')!.model;
		expect(engine.shroud).toBeNull();
		expect(shroudOf(engine)).toBeUndefined();
	});

	test('the shroud drops when the part below leaves (a decoupled stage)', () => {
		const parts = stack(['stock.engine-lv', 'stock.decoupler', 'stock.tank-small']);
		applyShrouds(shroudCandidates(parts));
		const engine = parts.get('0:stock.engine-lv')!.model;
		expect(engine.shroud).toBe(1.25);
		parts.delete('1:stock.decoupler');
		parts.delete('2:stock.tank-small');
		applyShrouds(shroudCandidates(parts));
		expect(engine.shroud).toBeNull();
		expect(shroudOf(engine)).toBeUndefined();
	});

	test('a decoupler grows a skirt only onto a wider part', () => {
		const spec = { top: 0.08, bottom: -0.1, radius: 0.625, when: 'wider' as const };
		expect(shroudProfile(spec, 1.25)).toBeNull();
		expect(shroudProfile(spec, 0.625)).toBeNull();
		const flare = shroudProfile(spec, 2.5)!;
		expect(Math.max(...flare.map((p) => p.r))).toBe(1.25);
		expect(shroudProfile({ ...spec, when: 'always' }, 1.25)).not.toBeNull();
		expect(shroudProfile(spec, null)).toBeNull();
	});
});
