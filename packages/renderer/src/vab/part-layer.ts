/**
 * The parts and groups of the VAB view without WebGL (plan 029): creates the part models of a
 * `VabScene`, applies highlight overlays and draws identical parts as one `InstancedMesh` each.
 * Split from `VabView` so that the draw-call and triangle budget is a unit test.
 *
 * Instancing keeps the per-part model: its static mesh is only hidden (`visible = false`) and
 * still answers ray casts (three.js does not test `visible` in `Raycaster`), so picking, bounds,
 * overlays and animated pieces need no second path. A part with an active highlight draws its own
 * mesh again, because the overlay is a child of that mesh.
 */
import {
	Group,
	InstancedMesh,
	Matrix4,
	Mesh,
	type BufferGeometry,
	type Material,
	type Object3D
} from 'three';
import type { PartModelFactory } from '../parts/factory.ts';
import { repeatedDetail, type PartModel } from '../parts/types.ts';
import {
	addOverlay,
	makeGhost,
	removeOverlay,
	type HighlightKind,
	type HighlightMaterials
} from './highlight.ts';
import {
	applyPartTurn,
	diffParts,
	repeatedDefinitions,
	type PartSlot,
	type VabScene
} from './scene-model.ts';
import { ConnectorBars } from '../parts/connector.ts';
import { applyShrouds, shroudCandidates } from '../parts/shroud.ts';
import type { PartVisual } from '@orbital/core';

export interface PartEntry {
	slot: PartSlot;
	model: PartModel;
	group: string;
	/** `repeated` models were built with `repeatedDetail`. */
	lod: 'full' | 'repeated';
	overlays: Map<HighlightKind, ReturnType<typeof addOverlay>>;
}

export interface GroupEntry {
	object: Group;
	/** Attach-node rings. */
	markers: Group;
	/** Stability glyphs. */
	glyphs: Group;
	/** Bars of the group's struts and fuel lines (ADR 0071). */
	bars: ConnectorBars;
	x: number;
	z: number;
	y: number;
	goalY: number;
	fresh: boolean;
}

/** What a frame of this subtree costs: colour pass and shadow pass, summed over visible meshes. */
export interface DrawCost {
	drawCalls: number;
	triangles: number;
	shadowDrawCalls: number;
	shadowTriangles: number;
}

type DrawGroup = { start: number; count: number; materialIndex?: number };

const trianglesOf = (g: BufferGeometry): number =>
	(g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)) / 3;

/**
 * Deterministic cost of drawing `root` as the WebGL renderer would, without frustum culling:
 * a mesh with a material array costs one call per geometry group, an instanced mesh draws its
 * `count` instances in the same call. The shadow pass repeats the meshes that cast shadows.
 */
export function measureDrawCost(root: Object3D): DrawCost {
	const cost: DrawCost = { drawCalls: 0, triangles: 0, shadowDrawCalls: 0, shadowTriangles: 0 };
	const visit = (o: Object3D): void => {
		if (!o.visible) return;
		if (o instanceof Mesh && o.geometry.getAttribute('position')) {
			const instances = o instanceof InstancedMesh ? o.count : 1;
			if (instances > 0) {
				const g = o.geometry;
				const mats = o.material;
				const groups = Array.isArray(mats)
					? g.groups.filter((s: DrawGroup) => s.count > 0 && mats[s.materialIndex ?? 0])
					: [];
				const calls = Array.isArray(mats) ? groups.length : 1;
				const tris = Array.isArray(mats)
					? groups.reduce((n: number, s: DrawGroup) => n + s.count / 3, 0)
					: trianglesOf(g);
				cost.drawCalls += calls;
				cost.triangles += tris * instances;
				if (o.castShadow) {
					cost.shadowDrawCalls += calls;
					cost.shadowTriangles += tris * instances;
				}
			}
		}
		for (const c of o.children) visit(c);
	};
	visit(root);
	return cost;
}

const matrix = new Matrix4();

const materialKey = (m: Material | Material[]): string =>
	Array.isArray(m) ? m.map((x) => x.uuid).join(',') : m.uuid;

export class PartLayer {
	/** Parent of every group object; the view adds it to its scene. */
	readonly root = new Group();
	readonly parts = new Map<string, PartEntry>();
	readonly groups = new Map<string, GroupEntry>();
	private readonly instances = new Map<string, InstancedMesh>();
	private cost: DrawCost = { drawCalls: 0, triangles: 0, shadowDrawCalls: 0, shadowTriangles: 0 };
	private instancedParts = 0;

	constructor(
		private readonly factory: PartModelFactory,
		private readonly highlights: HighlightMaterials,
		private readonly visuals: ReadonlyMap<string, PartVisual> = new Map()
	) {
		this.root.name = 'vessels';
	}

	/** Draw cost of the vessels as of the last change (cheap to read every frame). */
	get drawCost(): Readonly<DrawCost> {
		return this.cost;
	}

	/** Parts currently drawn as an instance of a shared mesh. */
	get instancedCount(): number {
		return this.instancedParts;
	}

	/** Creates, removes and moves groups and parts to match `next`. */
	sync(next: VabScene): void {
		const repeated = repeatedDefinitions(next.parts);
		const lodOf = (p: { role: string; definition: string }): PartEntry['lod'] =>
			repeated.has(`${p.role}|${p.definition}`) ? 'repeated' : 'full';

		const prev = new Map<string, PartSlot>();
		for (const [k, e] of this.parts) prev.set(k, e.slot);
		const diff = diffParts(prev, next.parts);
		// A copy count crossing the threshold changes the detail of every copy: rebuild those.
		const rebuilt: typeof diff.add = [];
		for (const p of diff.keep) {
			if (this.parts.get(p.key)?.lod !== lodOf(p)) {
				this.removePart(p.key);
				rebuilt.push(p);
			}
		}
		for (const key of diff.remove) this.removePart(key);
		const groupIds = new Set(next.groups.map((g) => g.id));
		for (const g of next.groups) this.ensureGroup(g.id, g.x, g.z);
		for (const [id, entry] of this.groups) {
			if (!groupIds.has(id)) {
				entry.bars.dispose();
				this.root.remove(entry.object);
				this.groups.delete(id);
			}
		}
		for (const p of [...diff.add, ...rebuilt]) this.addPart(p.key, p, lodOf(p));
		for (const p of next.parts) {
			const e = this.parts.get(p.key);
			if (!e) continue;
			if (e.group !== p.group) {
				e.group = p.group;
				this.groups.get(p.group)?.object.add(e.model.root);
			}
			e.model.root.position.set(...p.position);
			applyPartTurn(e.model.root, p);
			e.model.root.updateMatrix();
		}
		// Auto shrouds (plan 207): per group, from where the parts' nodes meet.
		for (const id of this.groups.keys()) {
			const inGroup = new Map([...this.parts].filter(([, e]) => e.group === id));
			applyShrouds(shroudCandidates(inGroup));
		}
		for (const [id, g] of this.groups) {
			g.bars.sync(
				(next.links ?? [])
					.filter((l) => l.group === id)
					.map((l) => ({ key: l.key, definition: l.definition, from: l.from, to: l.to }))
			);
		}
	}

	/** The bar meshes of every group, for picking. */
	get barRoots(): Object3D[] {
		return [...this.groups.values()].map((g) => g.bars.root);
	}

	private ensureGroup(id: string, x: number, z: number): GroupEntry {
		let g = this.groups.get(id);
		if (!g) {
			const object = new Group();
			object.name = `group:${id}`;
			const markers = new Group();
			const glyphs = new Group();
			const bars = new ConnectorBars(this.factory, this.visuals, object);
			object.add(markers, glyphs);
			this.root.add(object);
			g = { object, markers, glyphs, bars, x, z, y: 0, goalY: 0, fresh: true };
			this.groups.set(id, g);
		}
		g.x = x;
		g.z = z;
		return g;
	}

	private addPart(
		key: string,
		part: {
			definition: string;
			role: PartSlot['role'];
			group: string;
			params?: PartSlot['params'];
		},
		lod: PartEntry['lod']
	): void {
		const model = this.factory.create(part.definition, {
			...(lod === 'repeated' ? { detail: repeatedDetail(this.factory.currentDetail) } : {}),
			...(part.params ? { params: part.params } : {})
		});
		model.setState({ modules: {}, temperature: 0, ambientPressure: 101_325 });
		model.root.userData.key = key;
		if (part.role === 'ghost') makeGhost(model.root, this.highlights.ghost);
		this.groups.get(part.group)?.object.add(model.root);
		this.parts.set(key, {
			slot: {
				definition: part.definition,
				role: part.role,
				...(part.params ? { params: part.params } : {})
			},
			model,
			group: part.group,
			lod,
			overlays: new Map()
		});
	}

	private removePart(key: string): void {
		const e = this.parts.get(key);
		if (!e) return;
		e.model.root.removeFromParent();
		e.model.dispose();
		this.parts.delete(key);
	}

	/** Overlays for hover, selection, flags and ghosts; then the instances follow. */
	applyHighlights(
		hover: string | null,
		selected: ReadonlySet<string>,
		flagged: ReadonlySet<string>
	): void {
		for (const [key, e] of this.parts) {
			const wanted: HighlightKind[] = [];
			if (e.slot.role === 'ghost') wanted.push('ghost', 'xray');
			else {
				if (flagged.has(key)) wanted.push('flag');
				if (selected.has(key)) wanted.push('select');
				else if (hover === key) wanted.push('hover');
			}
			for (const kind of [...e.overlays.keys()]) {
				if (!wanted.includes(kind)) {
					removeOverlay(e.overlays.get(kind)!);
					e.overlays.delete(kind);
				}
			}
			for (const kind of wanted) {
				if (!e.overlays.has(kind)) {
					const overlay = addOverlay(e.model.root, this.highlights.get(kind));
					// The x-ray pass draws after the translucent ghost and the other outlines.
					if (kind === 'xray') for (const m of overlay) m.renderOrder = 6;
					e.overlays.set(kind, overlay);
				}
			}
		}
		this.refreshInstances();
	}

	/**
	 * Draws every set of two or more identical, un-highlighted solid parts of a group as one
	 * instanced mesh and hides their own meshes; everything else keeps its own mesh.
	 */
	refreshInstances(): void {
		interface Bucket {
			group: string;
			template: Mesh;
			entries: PartEntry[];
		}
		const buckets = new Map<string, Bucket>();
		for (const e of this.parts.values()) {
			const mesh = e.model.staticMesh;
			if (!mesh) continue;
			// Own mesh by default; the loop below hides the ones that join an instance.
			mesh.visible = true;
			if (e.slot.role !== 'solid' || e.overlays.size > 0 || !this.groups.has(e.group)) continue;
			const k = `${e.group}|${e.lod}|${mesh.geometry.uuid}|${materialKey(mesh.material)}`;
			let b = buckets.get(k);
			if (!b) {
				b = { group: e.group, template: mesh, entries: [] };
				buckets.set(k, b);
			}
			b.entries.push(e);
		}

		const live = new Set<string>();
		let instanced = 0;
		for (const [k, b] of buckets) {
			if (b.entries.length < 2) continue;
			live.add(k);
			let im = this.instances.get(k);
			if (!im || im.instanceMatrix.count < b.entries.length) {
				if (im) this.dropInstance(k, im);
				im = new InstancedMesh(b.template.geometry, b.template.material, b.entries.length);
				im.name = `instances:${b.entries[0]!.slot.definition}`;
				im.castShadow = b.template.castShadow;
				im.receiveShadow = b.template.receiveShadow;
				this.groups.get(b.group)!.object.add(im);
				this.instances.set(k, im);
			}
			b.entries.forEach((e, i) => {
				matrix.multiplyMatrices(e.model.root.matrix, b.template.matrix);
				im!.setMatrixAt(i, matrix);
				e.model.staticMesh!.visible = false;
			});
			im.count = b.entries.length;
			im.userData.keys = b.entries.map((e) => e.model.root.userData.key as string);
			im.instanceMatrix.needsUpdate = true;
			// Culling uses the sphere around all instances; the old one would cut copies off.
			im.computeBoundingSphere();
			instanced += b.entries.length;
		}
		for (const [k, im] of [...this.instances]) if (!live.has(k)) this.dropInstance(k, im);
		this.instancedParts = instanced;
		this.cost = measureDrawCost(this.root);
	}

	private dropInstance(key: string, im: InstancedMesh): void {
		im.removeFromParent();
		// Geometry and materials belong to the part models.
		im.dispose();
		this.instances.delete(key);
	}

	dispose(): void {
		for (const [k, im] of [...this.instances]) this.dropInstance(k, im);
		for (const key of [...this.parts.keys()]) this.removePart(key);
		for (const g of this.groups.values()) g.bars.dispose();
	}
}
