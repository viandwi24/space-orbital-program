import { describe, expect, test } from 'bun:test';
import { landingLegColliders, landingLegConfigSchema } from '@orbital/mod-stock';
import {
	Box3,
	BoxGeometry,
	CylinderGeometry,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	Vector3
} from 'three';
import { PartModelFactory } from '../src/parts/factory.ts';
import { revolve } from '../src/parts/revolve.ts';
import type { PartDetail, PartModel, PartModelProvider } from '../src/parts/types.ts';
import { PRESETS, detailOf } from '../src/presets.ts';
import { stockMaps } from './stock-fixture.ts';

const HIGH = detailOf(PRESETS.high);
const LOW = detailOf(PRESETS.low);
const maps = stockMaps();

const factory = (detail: PartDetail) =>
	new PartModelFactory({
		shapes: maps.shapes,
		visuals: maps.visuals,
		attach: maps.attach,
		detail
	});

/** Visible meshes below `root`. */
function meshes(root: Object3D): Mesh[] {
	const out: Mesh[] = [];
	root.traverse((o) => {
		let visible = true;
		for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) visible = false;
		if (o instanceof Mesh && visible && o.geometry.getAttribute('position')) out.push(o);
	});
	return out;
}

function extents(model: PartModel): { minY: number; maxY: number; radial: number } {
	model.root.updateMatrixWorld(true);
	let minY = Infinity;
	let maxY = -Infinity;
	let radial = 0;
	const v = new Vector3();
	for (const m of meshes(model.root)) {
		if (m.name.startsWith('plume')) continue;
		const pos = m.geometry.getAttribute('position');
		for (let i = 0; i < pos.count; i++) {
			v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
			minY = Math.min(minY, v.y);
			maxY = Math.max(maxY, v.y);
			radial = Math.max(radial, Math.hypot(v.x, v.z));
		}
	}
	return { minY, maxY, radial };
}

describe('revolve', () => {
	test('triangles face outward on a wall, up on a top cap, down on a bottom cap', () => {
		const g = revolve(
			[
				{ r: 0, y: 0 },
				{ r: 1, y: 0 },
				{ r: 1, y: 2 },
				{ r: 0, y: 2 }
			],
			{ segments: 12 }
		);
		const pos = g.getAttribute('position');
		const nor = g.getAttribute('normal');
		const idx = g.index!;
		const a = new Vector3();
		const b = new Vector3();
		const c = new Vector3();
		const n = new Vector3();
		for (let t = 0; t < idx.count; t += 3) {
			a.fromBufferAttribute(pos, idx.getX(t));
			b.fromBufferAttribute(pos, idx.getX(t + 1));
			c.fromBufferAttribute(pos, idx.getX(t + 2));
			const face = b.clone().sub(a).cross(c.clone().sub(a));
			if (face.lengthSq() < 1e-12) continue;
			n.fromBufferAttribute(nor, idx.getX(t));
			expect(face.normalize().dot(n)).toBeGreaterThan(0.9);
		}
	});
	test('a hard corner keeps two normals, a smooth point blends them', () => {
		const corner = revolve(
			[
				{ r: 1, y: 0 },
				{ r: 1, y: 1 },
				{ r: 0, y: 1 }
			],
			{ segments: 4 }
		);
		const ys = new Set<number>();
		const nor = corner.getAttribute('normal');
		for (let i = 0; i < nor.count; i++) ys.add(Math.round(nor.getY(i) * 100));
		expect(ys.has(0) && ys.has(100)).toBe(true);
		const soft = revolve(
			[
				{ r: 1, y: 0 },
				{ r: 1, y: 1, smooth: true },
				{ r: 0, y: 1 }
			],
			{ segments: 4 }
		);
		const sn = soft.getAttribute('normal');
		const mid = Array.from({ length: sn.count }, (_, i) => Math.round(sn.getY(i) * 100)).filter(
			(y) => y > 60 && y < 80
		);
		expect(mid.length).toBeGreaterThan(0);
	});
});

describe('stock part models (plan 020)', () => {
	for (const detail of [HIGH, LOW]) {
		const label = detail === HIGH ? 'high' : 'low';
		test(`${label}: every model fits its physics cylinder and spans its attach nodes`, () => {
			const f = factory(detail);
			for (const [id, shape] of maps.shapes) {
				if (shape.kind !== 'cylinder') continue;
				const model = f.create(id);
				const e = extents(model);
				const attach = maps.byId.get(id)!.attach!;
				expect(e.maxY - e.minY, id).toBeLessThanOrEqual(shape.height + 0.002);
				// Parts with both stack nodes span them exactly; the booster's top node and the
				// cone's bottom node are checked at the end they have.
				if (attach.top) expect(Math.abs(e.maxY - attach.top.pos[1]), id).toBeLessThan(0.002);
				if (attach.bottom) {
					expect(Math.abs(e.minY - attach.bottom.pos[1]), id).toBeLessThan(0.002);
				}
				if (attach.top && attach.bottom) expect(e.maxY - e.minY).toBeCloseTo(shape.height, 2);
				expect(model.nodes.top?.pos[1]).toBe(attach.top?.pos[1]);
				expect(e.radial, id).toBeLessThanOrEqual(shape.radius * 1.002);
				expect(e.radial, id).toBeGreaterThanOrEqual(shape.radius * 0.9);
				model.dispose();
			}
			f.dispose();
		});
		test(`${label}: box parts (radial decoupler, fin) fit their box and touch their radial node`, () => {
			const f = factory(detail);
			for (const id of ['stock.radial-decoupler', 'stock.fin']) {
				const shape = maps.shapes.get(id)!;
				if (shape.kind !== 'box') throw new Error(`${id} should be a box`);
				const model = f.create(id);
				model.root.updateMatrixWorld(true);
				const box = new Box3().setFromObject(model.root);
				expect(box.max.x, id).toBeLessThanOrEqual(shape.size.x / 2 + 0.002);
				expect(box.min.x, id).toBeGreaterThanOrEqual(-shape.size.x / 2 - 0.002);
				expect(box.max.y - box.min.y, id).toBeLessThanOrEqual(shape.size.y + 0.002);
				expect(box.max.z - box.min.z, id).toBeLessThanOrEqual(shape.size.z * 1.7 + 0.002);
				// The radial node sits on the inner face: the geometry reaches it.
				const radial = maps.byId.get(id)!.attach!.radial!;
				expect(Math.abs(box.min.x - radial.pos[0]), id).toBeLessThan(0.002);
				model.dispose();
			}
			f.dispose();
		});
		test(`${label}: no NaN in positions, normals or uvs`, () => {
			const f = factory(detail);
			for (const id of maps.shapes.keys()) {
				const model = f.create(id);
				for (const m of meshes(model.root)) {
					for (const name of ['position', 'normal', 'uv']) {
						const a = m.geometry.getAttribute(name);
						if (!a) continue;
						for (let i = 0; i < a.array.length; i++) {
							expect(Number.isFinite(a.array[i]!)).toBe(true);
						}
					}
				}
			}
			f.dispose();
		});
	}

	test('triangle budgets: 100..9000 per part on high, low at most 0.6 of high, a ten-part vessel under 60000', () => {
		const high = factory(HIGH);
		const low = factory(LOW);
		const counts = new Map<string, number>();
		for (const id of maps.shapes.keys()) {
			const h = high.create(id).triangles;
			const l = low.create(id).triangles;
			counts.set(id, h);
			// Flat plates (radial decoupler, fin) are a few dozen triangles; revolved parts at least 100.
			expect(h, id).toBeGreaterThanOrEqual(maps.shapes.get(id)!.kind === 'box' ? 24 : 100);
			expect(h, id).toBeLessThanOrEqual(9000);
			expect(l, id).toBeLessThanOrEqual(maps.shapes.get(id)!.kind === 'box' ? h : h * 0.6);
		}
		const stack = [
			'stock.command-pod',
			'stock.reaction-wheel',
			'stock.tank-small',
			'stock.tank-medium',
			'stock.tank-medium',
			'stock.decoupler',
			'stock.tank-medium',
			'stock.engine-lv',
			'stock.landing-legs',
			'stock.heat-shield'
		];
		const total = stack.reduce((sum, id) => sum + counts.get(id)!, 0);
		expect(total).toBeLessThan(60_000);
		high.dispose();
		low.dispose();
	});

	test('retracted legs add nothing; deployed feet stand where the module colliders are', () => {
		const f = factory(HIGH);
		const legs = f.create('stock.landing-legs');
		legs.setState({ modules: { 'stock.landing-leg': { deployed: false } } });
		const retracted = extents(legs);
		const colliders = landingLegColliders(landingLegConfigSchema.parse({}), { deployed: true });
		legs.setState({ modules: { 'stock.landing-leg': { deployed: true } } });
		legs.tick(5);
		legs.root.updateMatrixWorld(true);
		const feet: Vector3[] = [];
		legs.root.traverse((o) => {
			if (o.name.startsWith('foot-')) feet.push(o.getWorldPosition(new Vector3()));
		});
		expect(feet.length).toBe(4);
		const near = (c: { x: number; y: number; z: number }) =>
			feet.some((p) => Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) < 0.002);
		for (const c of colliders) expect(near(c.offset)).toBe(true);
		expect(extents(legs).radial).toBeGreaterThan(retracted.radial * 2);
		f.dispose();
	});

	test('the deploy animation runs over the descriptor time and does not jump on the first state', () => {
		const f = factory(HIGH);
		const legs = f.create('stock.landing-legs');
		const foot = () => {
			const p = new Vector3();
			legs.root.updateMatrixWorld(true);
			legs.root.traverse((o) => {
				if (o.name === 'foot-0') o.getWorldPosition(p);
			});
			return p.length();
		};
		legs.setState({ modules: { 'stock.landing-leg': { deployed: false } } });
		const closed = foot();
		legs.setState({ modules: { 'stock.landing-leg': { deployed: true } } });
		legs.tick(0.6);
		const half = foot();
		legs.tick(0.7);
		const open = foot();
		expect(closed).toBeLessThan(0.7);
		expect(half).toBeGreaterThan(closed);
		expect(half).toBeLessThan(open);
		expect(open).toBeGreaterThan(1.9);
		const born = f.create('stock.landing-legs');
		born.setState({ modules: { 'stock.landing-leg': { deployed: true } } });
		born.root.updateMatrixWorld(true);
		let bornFoot = 0;
		born.root.traverse((o) => {
			if (o.name === 'foot-0') bornFoot = o.getWorldPosition(new Vector3()).length();
		});
		expect(bornFoot).toBeGreaterThan(1.9);
		f.dispose();
	});

	test('a hot skin gets its own emissive materials; a cold part shares the library', () => {
		const f = factory(HIGH);
		const cold = f.create('stock.tank-small');
		const hot = f.create('stock.tank-small');
		const mat = (m: PartModel): MeshStandardMaterial => {
			const list = meshes(m.root)[0]!.material;
			const first = Array.isArray(list) ? list[0] : list;
			if (!(first instanceof MeshStandardMaterial)) throw new Error('not a standard material');
			return first;
		};
		cold.setState({ temperature: 400, modules: {} });
		hot.setState({ temperature: 2200, modules: {} });
		expect(mat(cold).emissive.r).toBe(0);
		expect(mat(hot).emissive.r).toBeGreaterThan(3);
		expect(mat(hot)).not.toBe(mat(cold));
		hot.setState({ temperature: 300, modules: {} });
		expect(mat(hot).emissive.r).toBe(0);
		f.dispose();
	});

	test('engine models carry a plume that shows only while the engine burns', () => {
		const f = factory(HIGH);
		const engine = f.create('stock.engine-lv');
		const plume = engine.root.getObjectByName('plume')!;
		engine.setState({
			modules: { 'stock.engine': { ignited: false, throttle: 0, flameout: false } }
		});
		expect(plume.visible).toBe(false);
		engine.setState({
			modules: { 'stock.engine': { ignited: true, throttle: 1, flameout: false } },
			ambientPressure: 101325
		});
		// Start-up ramp: a lit engine becomes visible within a fraction of a second.
		engine.tick(0.1);
		expect(plume.visible).toBe(true);
		engine.setState({
			modules: { 'stock.engine': { ignited: true, throttle: 1, flameout: true } }
		});
		engine.tick(3);
		expect(plume.visible).toBe(false);
		f.dispose();
	});
});

describe('providers (ADR 0028)', () => {
	test('a registered provider is asked before the procedural one; parts without a visual fall back to their shape', () => {
		const custom: PartModelProvider = {
			id: 'custom',
			create(request) {
				if (request.definition !== 'stock.tank-small') return null;
				const mesh = new Mesh(new BoxGeometry(1, 1, 1));
				mesh.name = 'custom-model';
				return {
					root: mesh,
					bounds: new Box3().setFromObject(mesh),
					nodes: {},
					triangles: 12,
					setState() {},
					tick() {},
					dispose() {}
				};
			}
		};
		const f = new PartModelFactory({
			shapes: maps.shapes,
			visuals: maps.visuals,
			providers: [custom],
			detail: HIGH
		});
		expect(f.create('stock.tank-small').root.name).toBe('custom-model');
		expect(f.create('stock.tank-medium').root.name).toBe('part:stock.tank-medium');
		const bare = new PartModelFactory({ shapes: maps.shapes, detail: HIGH });
		const plain = bare.create('stock.tank-medium').root as Mesh;
		expect(plain.geometry).toBeInstanceOf(CylinderGeometry);
		const unknown = bare.create('mod.unknown').root as Mesh;
		expect(unknown.geometry).toBeInstanceOf(BoxGeometry);
		f.dispose();
		bare.dispose();
	});

	test('an unknown visual kind falls back to the shape mesh', () => {
		const f = new PartModelFactory({
			shapes: new Map([['mod.x', { kind: 'cylinder', radius: 0.5, height: 1 }]]),
			visuals: new Map([['mod.x', { kind: 'does-not-exist' }]]),
			detail: HIGH
		});
		expect((f.create('mod.x').root as Mesh).geometry).toBeInstanceOf(CylinderGeometry);
		f.dispose();
	});
});
