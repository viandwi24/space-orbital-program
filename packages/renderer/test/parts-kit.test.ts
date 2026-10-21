/**
 * The detail kit, liveries and honest icon bounds (plan 291, ADR 0257).
 */
import { describe, expect, test } from 'bun:test';
import {
	Box3,
	BoxGeometry,
	BufferGeometry,
	Mesh,
	MeshBasicMaterial,
	Object3D,
	OrthographicCamera,
	Vector3
} from 'three';
import { GeometryBuilder, type SlotName } from '../src/parts/builder.ts';
import { PartModelFactory } from '../src/parts/factory.ts';
import {
	band,
	bellProfiles,
	boltCircle,
	cellGrid,
	hazardStripe,
	hinge,
	liveryOf,
	louvres,
	paintLivery,
	panelInset,
	raisedRing,
	ribbedBell,
	rim,
	stubPipe,
	LIVERIES
} from '../src/parts/generators/kit.ts';
import { profileDirection } from '../src/parts/revolve.ts';
import { PRESETS, detailOf } from '../src/presets.ts';
import { frameIcon, visibleBounds } from '../src/vab/icons.ts';
import { stockMaps } from './stock-fixture.ts';

/** Bounds of every geometry the builder holds, and which slots it used. */
function built(fill: (b: GeometryBuilder) => void): { box: Box3; slots: SlotName[]; tris: number } {
	const b = new GeometryBuilder({ segments: 24 });
	fill(b);
	const out = b.build();
	out.geometry.computeBoundingBox();
	const box = out.geometry.boundingBox!.clone();
	out.geometry.dispose();
	return { box, slots: out.slots, tris: out.triangles };
}

const finite = (box: Box3): boolean =>
	[box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite);

describe('detail kit primitives (plan 291)', () => {
	test('rings and bands stay within their height and stand only slightly off the wall', () => {
		const r = 0.6;
		for (const fill of [
			(b: GeometryBuilder) => rim(b, 'dark-metal', r, 0.2),
			(b: GeometryBuilder) => band(b, 'paint-secondary', r, -0.3, 0.1),
			(b: GeometryBuilder) => raisedRing(b, 'metal', r, 0)
		]) {
			const { box } = built(fill);
			expect(finite(box)).toBe(true);
			expect(box.max.x).toBeLessThanOrEqual(r + 0.0151);
			expect(box.max.x).toBeGreaterThan(r);
			expect(box.max.y - box.min.y).toBeLessThanOrEqual(0.41);
		}
	});

	test('bolts, panels, louvres, cells, hinges and stub pipes land where they are asked', () => {
		const bolts = built((b) => boltCircle(b, 'metal', 12, 0.5, 0.3)).box;
		expect(bolts.max.y).toBeCloseTo(0.311, 2);
		expect(Math.max(bolts.max.x, bolts.max.z)).toBeLessThan(0.52);
		const panel = built((b) => panelInset(b, 'paint-secondary', 0.6, 0, 0, 0.2, 0.3)).box;
		expect(panel.max.z).toBeGreaterThan(0.6);
		expect(panel.max.y - panel.min.y).toBeCloseTo(0.3, 3);
		const slats = built((b) => louvres(b, 'dark-metal', 0.6, Math.PI / 2, 0, 5)).box;
		expect(slats.max.x).toBeGreaterThan(0.6);
		const cells = built((b) => cellGrid(b, 'glass', [0, 0, 0.02], 1, 0.5, 4, 2));
		expect(cells.box.max.x).toBeLessThanOrEqual(0.5);
		expect(cells.tris).toBe(8 * 12);
		const pipe = built((b) => stubPipe(b, 'metal', [0, 0, 0], [1, 0, 0], 0.4, 0.03)).box;
		expect(pipe.min.x).toBeCloseTo(0, 3);
		expect(pipe.max.x).toBeCloseTo(0.4, 3);
		const barrel = built((b) => hinge(b, 'metal', [0, 1, 0], [0, 0, 1], 0.5, 0.02)).box;
		expect(barrel.min.z).toBeCloseTo(-0.25, 3);
		expect(barrel.max.z).toBeCloseTo(0.25, 3);
	});

	test('a ribbed bell is hollow: its outside walks up from the lip, its inside walks down', () => {
		const spec = { throat: 0.05, exit: 0.15, length: 0.3, rings: 4 };
		const { outer, inner } = bellProfiles(spec);
		expect(profileDirection(outer)).toBe('up');
		expect(profileDirection(inner)).toBe('down');
		// the inner wall is open at the exit: its last point is the exit radius at the lip
		expect(inner.at(-1)!.r).toBeCloseTo(0.15, 6);
		expect(inner.at(-1)!.y).toBeCloseTo(-0.3, 6);
		// every outer point is outside the inner wall at the same height (no wall pokes through)
		for (const p of outer) {
			const t = Math.min(1, Math.max(0, -p.y / spec.length));
			const innerR = 0.05 + 0.1 * Math.pow(t, 0.6);
			if (p.y > -spec.length + 1e-6) expect(p.r).toBeGreaterThanOrEqual(innerR - 1e-9);
		}
		// rings add outward steps: more outer points than steps + 3
		expect(outer.length).toBeGreaterThan(10 + 3);
		const sideways = built((b) =>
			ribbedBell(b, { ...spec, slot: 'bronze' }, [0.2, 0, 0], [1, 0, 0])
		);
		expect(sideways.slots).toContain('bronze');
		expect(sideways.slots).toContain('nozzle-inner');
		// pointing along +X from x = 0.2: the lip is at x = 0.5
		expect(sideways.box.max.x).toBeCloseTo(0.5, 2);
	});

	test('a hazard stripe alternates two slots around the ring', () => {
		const { slots, box } = built((b) => hazardStripe(b, 0.6, -0.02, 0.02, { count: 12 }));
		expect(new Set(slots)).toEqual(new Set<SlotName>(['paint-accent', 'dark-metal']));
		expect(box.max.y - box.min.y).toBeCloseTo(0.04, 4);
	});
});

describe('liveries (plan 291)', () => {
	test('liveryOf reads known names only', () => {
		expect(liveryOf({ livery: 'checker' })).toBe('checker');
		expect(liveryOf({ livery: 'rainbow' })).toBeUndefined();
		expect(liveryOf({ livery: 3 })).toBeUndefined();
		expect(liveryOf(undefined)).toBeUndefined();
	});

	test('every livery paints within the barrel it is given', () => {
		for (const livery of LIVERIES) {
			const b = new GeometryBuilder({ segments: 24 });
			b.revolve('paint-primary', [
				{ r: 0.6, y: -1 },
				{ r: 0.6, y: 1 }
			]);
			paintLivery(b, livery, 0.6, -1, 1);
			const out = b.build();
			out.geometry.computeBoundingBox();
			const box = out.geometry.boundingBox!;
			expect(box.min.y, livery).toBeGreaterThanOrEqual(-1 - 1e-6);
			expect(box.max.y, livery).toBeLessThanOrEqual(1 + 1e-6);
			expect(box.max.x, livery).toBeLessThanOrEqual(0.6 + 0.0061);
			if (livery === 'bands' || livery === 'checker' || livery === 'half-black')
				expect(out.slots, livery).toContain('paint-secondary');
			out.geometry.dispose();
		}
	});

	test('a tank with the foam livery is drawn in foam, with steel in metal, without one as before', () => {
		const maps = stockMaps();
		const visual = maps.visuals.get('stock.tank-medium')!;
		const shapes = new Map(maps.shapes);
		const visuals = new Map(maps.visuals);
		visuals.set('t.foam', { ...visual, params: { ...visual.params, livery: 'foam' } });
		visuals.set('t.steel', { ...visual, params: { ...visual.params, livery: 'steel' } });
		shapes.set('t.foam', maps.shapes.get('stock.tank-medium')!);
		shapes.set('t.steel', maps.shapes.get('stock.tank-medium')!);
		const factory = new PartModelFactory({
			shapes,
			visuals,
			attach: maps.attach,
			detail: detailOf(PRESETS.high)
		});
		const slotsOf = (id: string): string[] => {
			const model = factory.create(id)!;
			const out: string[] = [];
			model.root.traverse((o) => {
				const m = (o as Mesh).material;
				for (const mat of Array.isArray(m) ? m : m ? [m] : []) out.push(String(mat.userData.slot));
			});
			model.dispose();
			return out;
		};
		expect(slotsOf('t.foam')).toContain('foam');
		expect(slotsOf('t.steel')).not.toContain('paint-secondary');
		expect(slotsOf('stock.tank-medium')).not.toContain('foam');
	});
});

describe('catalogue icons frame what is drawn (plan 291)', () => {
	test('visibleBounds ignores hidden meshes', () => {
		const root = new Object3D();
		const shown = new Mesh(new BoxGeometry(0.2, 0.2, 0.2), new MeshBasicMaterial());
		const hidden = new Mesh(new BoxGeometry(5, 5, 5), new MeshBasicMaterial());
		hidden.visible = false;
		root.add(shown, hidden);
		const size = visibleBounds(root).getSize(new Vector3());
		expect(size.x).toBeCloseTo(0.2, 6);
		const empty = new Object3D();
		empty.add(new Mesh(new BufferGeometry(), new MeshBasicMaterial()));
		expect(visibleBounds(empty).isEmpty()).toBe(true);
	});

	test('small parts with hidden plumes or canopies fill at least 60 % of their icon', () => {
		const maps = stockMaps();
		const factory = new PartModelFactory({
			shapes: maps.shapes,
			visuals: maps.visuals,
			attach: maps.attach,
			detail: detailOf(PRESETS.high)
		});
		for (const id of [
			'stock.rcs-block',
			'stock.rcs-cold-gas',
			'stock.parachute',
			'stock.drogue-chute',
			'stock.radial-parachute'
		]) {
			const model = factory.create(id)!;
			model.setState({ modules: {}, temperature: 0, ambientPressure: 101_325 });
			const holder = new Object3D();
			holder.add(model.root);
			const box = visibleBounds(holder);
			const cam = new OrthographicCamera(-1, 1, 1, -1);
			frameIcon(box, cam);
			let extent = 0;
			for (const x of [box.min.x, box.max.x])
				for (const y of [box.min.y, box.max.y])
					for (const z of [box.min.z, box.max.z]) {
						const p = new Vector3(x, y, z).project(cam);
						extent = Math.max(extent, Math.abs(p.x), Math.abs(p.y));
					}
			expect(extent, id).toBeGreaterThan(0.6);
			// and the old full bounds would not have: the hidden piece is bigger than the part
			const full = new Box3().setFromObject(holder).getSize(new Vector3()).length();
			expect(full, id).toBeGreaterThan(box.getSize(new Vector3()).length() * 1.5);
			model.dispose();
		}
	});
});

describe('the stack chute continues the pod (plan 278, ADR 0260)', () => {
	/** Largest radius where the model's triangle edges cross the height `y` (a horizontal slice). */
	function radiusAt(root: Object3D, y: number): number {
		let r = 0;
		root.updateMatrixWorld(true);
		const a = new Vector3();
		const b = new Vector3();
		root.traverseVisible((o) => {
			const mesh = o as Mesh;
			if (!mesh.isMesh) return;
			const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
			const pos = g.getAttribute('position');
			for (let t = 0; t < pos.count; t += 3) {
				for (const [i, j] of [
					[0, 1],
					[1, 2],
					[2, 0]
				] as const) {
					a.fromBufferAttribute(pos, t + i).applyMatrix4(mesh.matrixWorld);
					b.fromBufferAttribute(pos, t + j).applyMatrix4(mesh.matrixWorld);
					if ((a.y - y) * (b.y - y) > 0 || a.y === b.y) continue;
					const f = (y - a.y) / (b.y - a.y);
					r = Math.max(r, Math.hypot(a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f));
				}
			}
		});
		return r;
	}

	test("the chute's wall slope is within 10 % of the pod cone's near the collar", () => {
		const maps = stockMaps();
		const factory = new PartModelFactory({
			shapes: maps.shapes,
			visuals: maps.visuals,
			attach: maps.attach,
			detail: detailOf(PRESETS.low)
		});
		const pod = factory.create('stock.command-pod')!;
		// the pod's cone between 0.15 m and 0.30 m (its collar starts at 0.40)
		const podSlope = (radiusAt(pod.root, 0.15) - radiusAt(pod.root, 0.3)) / 0.15;
		const chute = factory.create('stock.parachute')!;
		// the chute's body between 0.02 m and 0.08 m above its seat (its bottom face is at -0.16)
		const chuteSlope = (radiusAt(chute.root, -0.13) - radiusAt(chute.root, -0.07)) / 0.06;
		expect(podSlope).toBeGreaterThan(0.3);
		expect(Math.abs(chuteSlope - podSlope) / podSlope).toBeLessThan(0.1);
		pod.dispose();
		chute.dispose();
	});
});
