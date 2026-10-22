/**
 * Seam tests for every part generator (plan 207, ADR 0212):
 * - every revolved profile follows the winding rule of `revolve.ts` (outer surfaces bottom to
 *   top, `nozzle-inner` top down), so no outer wall faces inward and vanishes from outside;
 * - the rim of every sized attach face equals the node radius within 1 mm, so two parts whose
 *   nodes have the same size meet without a step: every attachable pair of equal size matches.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { nodeSize } from '@orbital/core';
import { Mesh, Object3D, Vector3 } from 'three';
import { GeometryBuilder, type SlotName } from '../src/parts/builder.ts';
import { PartModelFactory } from '../src/parts/factory.ts';
import { profileDirection, type ProfilePoint } from '../src/parts/revolve.ts';
import { PRESETS, detailOf } from '../src/presets.ts';
import { stockMaps } from './stock-fixture.ts';

const maps = stockMaps();
const DETAILS = { high: detailOf(PRESETS.high), low: detailOf(PRESETS.low) };

/** How far into the part from its face the joint rim may sit (a chamfer on the collar), m. */
const SEAM_BAND = 0.05;

/** Nodes whose face is not a flat joint, with the reason. */
const NOT_A_FLAT_JOINT: Record<string, string> = {
	'stock.engine-lv/bottom': 'a bell: the shroud carries the joint (shrouds.test.ts)',
	'stock.engine-cluster/bottom': 'bells: the shroud carries the joint (shrouds.test.ts)',
	'stock.heat-shield/bottom': 'the ablative dish faces the airflow at the end of a stack',
	'stock.heat-shield-wide/bottom': 'the ablative dish faces the airflow at the end of a stack',
	// the size-class shields of plan 289: the same dish
	'stock.heat-shield-1875/bottom': 'the ablative dish faces the airflow at the end of a stack',
	'stock.heat-shield-3750/bottom': 'the ablative dish faces the airflow at the end of a stack',
	'stock.heat-shield-5000/bottom': 'the ablative dish faces the airflow at the end of a stack',
	'stock.engine-vacuum/bottom': 'a bell: the shroud carries the joint (shrouds.test.ts)',
	'stock.engine-wide/bottom': 'a bell: the shroud carries the joint (shrouds.test.ts)',
	'stock.flotation-collar/top': 'a ring around the stack, wider than its joint by design',
	'stock.flotation-collar/bottom': 'a ring around the stack, wider than its joint by design',
	// plans 276, 281: bells under engine plates, and joints off the part's axis (the rim is
	// measured from the axis)
	'stock.engine-plate-5/bottom': 'bells: the shroud carries the joint (shrouds.test.ts)',
	'stock.engine-plate-9/bottom': 'bells: the shroud carries the joint (shrouds.test.ts)',
	'stock.engine-plate-8/bottom': 'bells: the shroud carries the joint (shrouds.test.ts)',
	'stock.engine-vacuum-xl/bottom': 'a bell: the shroud carries the joint (shrouds.test.ts)',
	'stock.coupler-2/bottom': 'an off-axis joint: its own collar has the node radius',
	'stock.coupler-2/bottom2': 'an off-axis joint: its own collar has the node radius',
	'stock.coupler-3/bottom': 'an off-axis joint: its own collar has the node radius',
	'stock.coupler-3/bottom2': 'an off-axis joint: its own collar has the node radius',
	'stock.coupler-3/bottom3': 'an off-axis joint: its own collar has the node radius',
	'stock.coupler-4/bottom': 'an off-axis joint: its own collar has the node radius',
	'stock.coupler-4/bottom2': 'an off-axis joint: its own collar has the node radius',
	'stock.coupler-4/bottom3': 'an off-axis joint: its own collar has the node radius',
	'stock.coupler-4/bottom4': 'an off-axis joint: its own collar has the node radius',
	'stock.hub/east': 'a side port: its collar faces sideways, not along the axis',
	'stock.hub/west': 'a side port: its collar faces sideways, not along the axis',
	'stock.hub/north': 'a side port: its collar faces sideways, not along the axis',
	'stock.hub/south': 'a side port: its collar faces sideways, not along the axis',
	'stock.payload-petals/inner': 'a payload seat on the floor inside the shell, not a face',
	'stock.cargo-bay/inner': 'a payload seat on the floor inside the bay, not a face',
	// plan 356
	'stock.orbiter-bay/keel': 'a payload seat on the keel inside the bay, not a face',
	'stock.docking-port-side/side': 'a side port: its ring faces sideways, not along the axis',
	'stock.lander-descent/bottom': "a bell: the lander's engine is under the stage"
};

interface Recorded {
	part: string;
	kind: string;
	index: number;
	slot: SlotName;
	profile: readonly ProfilePoint[];
}

const recorded: Recorded[] = [];
const original = {
	revolve: GeometryBuilder.prototype.revolve,
	revolveAt: GeometryBuilder.prototype.revolveAt
};
let current = { part: '', kind: '', index: 0 };

beforeAll(() => {
	const record = (slot: SlotName, profile: readonly ProfilePoint[]) =>
		recorded.push({ ...current, index: current.index++, slot, profile });
	GeometryBuilder.prototype.revolve = function (slot, profile, options) {
		record(slot, profile);
		return original.revolve.call(this, slot, profile, options);
	};
	GeometryBuilder.prototype.revolveAt = function (slot, profile, position, options) {
		record(slot, profile);
		return original.revolveAt.call(this, slot, profile, position, options);
	};
	for (const detail of Object.values(DETAILS)) {
		const factory = new PartModelFactory({
			shapes: maps.shapes,
			visuals: maps.visuals,
			attach: maps.attach,
			detail
		});
		for (const [id, visual] of maps.visuals) {
			current = { part: id, kind: visual.kind, index: 0 };
			factory.create(id)?.dispose();
		}
	}
});

afterAll(() => {
	GeometryBuilder.prototype.revolve = original.revolve;
	GeometryBuilder.prototype.revolveAt = original.revolveAt;
});

/** The profiles that break the winding rule, as "kind (part) profile #i slot". */
function windingProblems(entries: readonly Recorded[]): string[] {
	const wrong: string[] = [];
	for (const e of entries) {
		// inner skins face in: a nozzle's wall, the SLA petals' tan inside (plan 355)
		const want = e.slot === 'nozzle-inner' || e.slot === 'tan' ? 'down' : 'up';
		const got = profileDirection(e.profile);
		if (got !== 'level' && got !== want) {
			wrong.push(`${e.kind} (${e.part}) profile #${e.index} ${e.slot}: runs ${got}`);
		}
	}
	return [...new Set(wrong)];
}

describe('part seams', () => {
	test('every stock generator is exercised', () => {
		const kinds = new Set(recorded.map((e) => e.kind));
		for (const visual of maps.visuals.values()) {
			if (visual.kind === 'strut' || visual.kind === 'fuel-line') continue; // no revolve: bars
			if (
				[
					'fin',
					'control-surface',
					'wing',
					'radial-decoupler',
					'gear',
					'flag',
					'rcs-block',
					'launch-clamp',
					// a panel without sections is a plate (plan 219; the fairing case below draws one)
					'fairing-panel',
					// boxes only (plan 225)
					'ladder',
					// boxes and a cylinder, no revolve (plan 242)
					'light',
					// radial boxes, plates and extrusions, no revolve (plans 280, 281, 295–300)
					'solar-flat',
					'solar-fold',
					'solar-array',
					'rtg',
					'fuel-cell',
					'antenna-whip',
					'antenna-dish',
					'instrument',
					'container',
					'truss',
					'radiator',
					'boom',
					'single-leg',
					'delta-wing',
					// boxes and cylinders, no revolve (plan 306)
					'hinge-joint',
					// boxes and extrusions (plan 307)
					'rover-wheel',
					'rover-chassis',
					// boxes and cylinders (plan 311)
					'light-panel',
					'light-angled',
					'light-nav',
					// a quarter cone, no full revolve (plan 345)
					'petal-panel',
					// the crew character: spheres, lathes and capsules, no revolve (plan 341)
					'suit',
					// the orbiter's lofted hull (plan 356): no revolve
					'orbiter-nose',
					'orbiter-bay'
				].includes(visual.kind)
			)
				continue;
			expect(kinds.has(visual.kind), visual.kind).toBe(true);
		}
	});

	test('every revolved profile runs bottom to top (inner nozzle surfaces top down)', () => {
		expect(windingProblems(recorded)).toEqual([]);
	});

	test('the check catches the booster top ring as it was before plan 207', () => {
		const h2 = 1.6;
		const R = 0.4;
		const before: Recorded = {
			part: 'stock.booster',
			kind: 'booster',
			index: 0,
			slot: 'dark-metal',
			profile: [
				{ r: 0, y: h2 },
				{ r: R * 0.94, y: h2 },
				{ r: R, y: h2 - 0.025 },
				{ r: R, y: h2 - 0.14 },
				{ r: R * 0.965, y: h2 - 0.155 }
			]
		};
		expect(windingProblems([before])).toEqual([
			'booster (stock.booster) profile #0 dark-metal: runs down'
		]);
	});

	/** Largest distance from the axis of the visible static geometry within the band of a face. */
	function rimRadius(
		root: Object3D,
		face: { pos: readonly number[]; dir: readonly number[] }
	): number {
		root.updateMatrixWorld(true);
		const v = new Vector3();
		let r = 0;
		root.traverse((o) => {
			if (!(o instanceof Mesh) || o.name.startsWith('plume')) return;
			for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return;
			const pos = o.geometry.getAttribute('position');
			for (let i = 0; i < pos.count; i++) {
				v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
				const depth = (v.y - face.pos[1]!) * -face.dir[1]!;
				if (depth >= -1e-4 && depth <= SEAM_BAND) r = Math.max(r, Math.hypot(v.x, v.z));
			}
		});
		return r;
	}

	test('every sized attach face has its rim at the node radius within 1 mm', () => {
		const factory = new PartModelFactory({
			shapes: maps.shapes,
			visuals: maps.visuals,
			attach: maps.attach,
			detail: DETAILS.high
		});
		const wrong: string[] = [];
		let checked = 0;
		for (const [id, part] of maps.byId) {
			if (!part.visual || !part.attach) continue;
			const model = factory.create(id);
			if (!model) continue;
			for (const [name, node] of Object.entries(part.attach)) {
				const size = nodeSize(part, name);
				if (size === undefined || NOT_A_FLAT_JOINT[`${id}/${name}`]) continue;
				const rim = rimRadius(model.root, node);
				checked++;
				if (Math.abs(rim - size / 2) > 1e-3) {
					wrong.push(`${id}/${name}: rim ${rim.toFixed(4)} m, node ${size} m`);
				}
			}
			model.dispose();
		}
		expect(wrong).toEqual([]);
		expect(checked).toBeGreaterThan(40);
	});

	test('a fairing with sections: every profile runs bottom to top, the panels too (plan 219)', () => {
		const factory = new PartModelFactory({
			shapes: maps.shapes,
			visuals: maps.visuals,
			attach: maps.attach,
			detail: DETAILS.high
		});
		const sections = JSON.stringify([
			{ height: 1, radius: 0.8 },
			{ height: 1.5, radius: 0.8 },
			{ height: 0.5, radius: 0.6 }
		]);
		const start = recorded.length;
		current = { part: 'stock.fairing-base', kind: 'fairing', index: 0 };
		const base = factory.create('stock.fairing-base', { params: { sections, closed: true } });
		for (const half of [0, 1]) {
			current = { part: 'stock.fairing-panel', kind: 'fairing-panel', index: 0 };
			factory
				.create('stock.fairing-panel', {
					params: { sections, closed: true, size: 1.25, baseTop: 0.1, half }
				})
				.dispose();
		}
		const mine = recorded.slice(start);
		expect(mine.filter((e) => e.kind === 'fairing').length).toBeGreaterThanOrEqual(2);
		expect(mine.filter((e) => e.kind === 'fairing-panel').length).toBe(2);
		expect(windingProblems(mine)).toEqual([]);
		// the base rim meets its 1.25 m node with the shell on it
		const top = maps.byId.get('stock.fairing-base')!.attach!.top!;
		expect(Math.abs(rimRadius(base.root, top) - 0.625)).toBeLessThan(1e-3);
		base.dispose();
		factory.dispose();
	});
});
